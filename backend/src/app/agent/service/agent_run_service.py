"""Run 视图与取消（agent 层设计 §4.1；③ 1.12/1.13）。

本模块只做两件事：**把 Run 读出来**、**把 Run 停下来**。执行永远在 worker 里
（``tasks/tasks.py``），所以取消不是「把协程掐掉」，而是一次**状态协商**：

- ``queued``：还没人接单 → 直接 ``cancelled``（顺带唤醒同键队头，否则队列卡住）；
- ``running`` / ``waiting_ingest``：已经有人在跑 → 置 ``cancel_requested`` 并发 Redis 信号，
  worker 感知后按 D92 **合成已收集结果**再收敛为 ``cancelled``；
- 终态 / 已请求取消：**幂等返回**当前状态，不报错（客户端重试不该拿到 409）。

属主校验是硬要求：Run 表本身没有 uid（提交身份在排队记录上），所以统一走
``agent_run_requests.uid`` 求交，查不到即 404——不区分「不存在」与「不是你的」，
避免把别人的 run_id 变成存在性探针。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select, update

from backend.src.app.agent.model.agent_run import AGENT_RUN_TERMINAL_STATUSES, AgentRun
from backend.src.app.agent.model.agent_run_request import AgentRunRequest
from backend.src.app.agent.schema.agent_run import AgentRunCancelResult, AgentRunDetail
from backend.src.app.agent.service.run_queue_service import get_run_queue_service
from backend.src.app.agent.service.run_submission_service import get_run_submission_service
from backend.src.common.exception import errors
from backend.src.common.log import log

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['AgentRunService', 'get_agent_run_service']

#: 取消请求可以置位的「在跑」状态（其余状态要么还没开始，要么已经结束）
_CANCELLABLE_RUNNING = ('running', 'waiting_ingest')


class AgentRunService:
    """Run 的读面与取消面。"""

    # ------------------------------------------------------------------ 读
    async def get_owned(
        self,
        db: AsyncSession,
        *,
        run_id: str,
        uid: str,
        plugin_namespace: str | None = None,
    ) -> AgentRun:
        """按 ``run_id`` 取 Run，并校验它与 ``uid`` 的归属关系（失败 404）。"""
        stmt = (
            select(AgentRun)
            .join(AgentRunRequest, AgentRunRequest.run_id == AgentRun.run_id)
            .where(AgentRun.run_id == run_id, AgentRunRequest.uid == str(uid))
        )
        if plugin_namespace:
            stmt = stmt.where(AgentRun.plugin_namespace == str(plugin_namespace))
        run = (await db.execute(stmt)).scalars().first()
        if run is None:
            raise errors.NotFoundError(msg='运行不存在')
        return run

    async def view(
        self,
        db: AsyncSession,
        *,
        run_id: str,
        uid: str,
        plugin_namespace: str | None = None,
    ) -> AgentRunDetail:
        """``GET /runs/{run_id}`` 的数据（状态 + 用量 + 轨迹）。"""
        run = await self.get_owned(db, run_id=run_id, uid=uid, plugin_namespace=plugin_namespace)
        return self.to_detail(run)

    @staticmethod
    def to_detail(run: AgentRun) -> AgentRunDetail:
        return AgentRunDetail(
            run_id=str(run.run_id),
            status=str(run.status),
            kb_names=[str(item) for item in (run.kb_names or [])],
            plugin_namespace=str(run.plugin_namespace or 'core'),
            query=str(run.query or ''),
            model_spec=run.model_spec,
            steps=list(run.steps or []),
            tool_call_count=int(run.tool_call_count or 0),
            rewrite_count=int(run.rewrite_count or 0),
            usage=dict(run.usage or {}),
            parent_run_id=run.parent_run_id,
            error=run.error,
            error_code=run.error_code,
            has_result=bool(run.result),
            created_time=run.created_time,
            updated_time=run.updated_time,
        )

    # ------------------------------------------------------------------ 取消
    async def cancel(
        self,
        db: AsyncSession,
        *,
        run_id: str,
        uid: str,
        plugin_namespace: str | None = None,
    ) -> AgentRunCancelResult:
        """请求取消（幂等）：返回取消后的状态与「本次是否真的改变了状态」。"""
        run = await self.get_owned(db, run_id=run_id, uid=uid, plugin_namespace=plugin_namespace)
        if run.status in AGENT_RUN_TERMINAL_STATUSES or run.status == 'cancel_requested':
            return AgentRunCancelResult(run_id=run_id, status=str(run.status), accepted=False)

        if run.status == 'queued':
            # 还没人接单：直接终态。**必须**条件更新——worker 可能正在同一瞬间取租约，
            # 无条件写会把它刚建立的 running 覆盖回 cancelled（等于任务凭空消失）
            changed = await self._cas_status(db, run_id=run_id, allowed=('queued',), status='cancelled')
            if not changed:
                return await self._after_lost_race(db, run_id=run_id, uid=uid, plugin_namespace=plugin_namespace)
            await self._settle_request(db, run_id=run_id, status='cancelled')
            # 队列空位要让出来：排在后面的 Run 等的是「前一个结束」
            next_run_id = await get_run_submission_service().wake_next(db, run_id=run_id)
            if next_run_id:
                get_run_queue_service().dispatch_best_effort(next_run_id)
            return AgentRunCancelResult(run_id=run_id, status='cancelled', accepted=True)

        # 在跑：通知 worker 收敛（Redis 信号只是加速，DB 状态才是事实）
        changed = await self._cas_status(db, run_id=run_id, allowed=_CANCELLABLE_RUNNING, status='cancel_requested')
        if not changed:
            return await self._after_lost_race(db, run_id=run_id, uid=uid, plugin_namespace=plugin_namespace)
        try:
            await get_run_queue_service().request_cancel(run_id)
        except Exception as exc:  # Redis 不可用不该让取消失败：worker 心跳仍会复查 DB 状态
            log.warning('agent Run 取消信号发送失败（等 worker 心跳复查）run_id={} err={}', run_id, exc)
        return AgentRunCancelResult(run_id=run_id, status='cancel_requested', accepted=True)

    async def _after_lost_race(
        self,
        db: AsyncSession,
        *,
        run_id: str,
        uid: str,
        plugin_namespace: str | None,
    ) -> AgentRunCancelResult:
        """CAS 落空（状态被并发改写）：重读一次，按事实返回，不重试猜测。"""
        run = await self.get_owned(db, run_id=run_id, uid=uid, plugin_namespace=plugin_namespace)
        return AgentRunCancelResult(run_id=run_id, status=str(run.status), accepted=False)

    @staticmethod
    async def _cas_status(db: AsyncSession, *, run_id: str, allowed: tuple[str, ...], status: str) -> bool:
        result = await db.execute(
            update(AgentRun).where(AgentRun.run_id == run_id, AgentRun.status.in_(allowed)).values(status=status)
        )
        await db.commit()
        return bool(getattr(result, 'rowcount', 0))

    @staticmethod
    async def _settle_request(db: AsyncSession, *, run_id: str, status: str) -> None:
        """同步排队记录：队列记录不收尾，同键后面的 Run 永远等不到队头。"""
        await db.execute(update(AgentRunRequest).where(AgentRunRequest.run_id == run_id).values(status=str(status)))
        await db.commit()


_service: AgentRunService | None = None


def get_agent_run_service() -> AgentRunService:
    """模块级单例（与各域 ``get_xxx_service`` 同约定）。"""
    global _service
    if _service is None:
        _service = AgentRunService()
    return _service
