"""Run 提交：事务性建 Run + 入队 + 队头判定（agent 层设计 §4.1 / §2.2）。

**为什么提交要单独一层**：并发提交必须串行化，且「创建」与「排队」必须在**同一事务**里，
否则会出现「Run 建了但没入队」（永远 queued）或「入队了但 Run 不存在」（worker 取不到）。
本模块只做这两件事与队头判定，不碰执行——执行在 ``run_worker``。

**队头语义**：同一 ``(uid, agent_slug, thread_id)`` 内同时只允许一个活跃 Run。
新提交若发现同键已有活跃 Run，就只入队不派发（``dispatched=False``），
由前一个 Run 收尾时调用 :func:`promote_next` 唤醒队头——这样「同一会话串行、
跨会话并行」，且不依赖 Redis 锁的可靠性（Redis 只做唤醒与取消信号）。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select

from backend.src.app.agent.model.agent_run import AgentRun
from backend.src.app.agent.model.agent_run_request import AgentRunRequest
from backend.src.app.agent.service.run_log import RUN_QUERY_MAX, new_run_id
from backend.src.common.log import log

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['RunSubmissionService', 'get_run_submission_service']

#: 视为「占着队头」的请求状态：pending 未派发 / dispatched 已投递未收尾
_ACTIVE_REQUEST_STATUSES = ('pending', 'dispatched')


class RunSubmissionService:
    """提交入口：建 Run、入队、按队头决定是否立即派发。"""

    async def submit(
        self,
        db: AsyncSession,
        *,
        query: str,
        kb_names: list[str],
        uid: str,
        plugin_namespace: str | None = None,
        agent_slug: str = 'default',
        thread_id: str | None = None,
    ) -> tuple[str, bool]:
        """创建一次 Run 并入队，返回 ``(run_id, 是否立即派发)``。

        调用方（API 层）拿到 ``run_id`` 后即可返回或开始 SSE 订阅；
        ``是否立即派发`` 为 False 表示排在别人后面，前端应展示排队状态。
        """
        run_id = new_run_id()
        db.add(
            AgentRun(
                run_id=run_id,
                kb_names=[str(item) for item in kb_names],
                plugin_namespace=str(plugin_namespace or 'core'),
                query=str(query or '')[:RUN_QUERY_MAX],
                status='queued',
            )
        )
        request = AgentRunRequest(
            run_id=run_id,
            uid=str(uid),
            agent_slug=str(agent_slug or 'default'),
            thread_id=thread_id,
            plugin_namespace=str(plugin_namespace or 'core'),
            status='pending',
        )
        db.add(request)
        # 同事务提交：Run 与排队记录要么都在，要么都不在
        await db.commit()

        ahead = await self.has_active_ahead(
            db,
            uid=uid,
            agent_slug=agent_slug,
            thread_id=thread_id,
            exclude_run_id=run_id,
        )
        if not ahead:
            # **必须把派发决策落库**：否则已派发的 Run 在队列表里仍是 pending，
            # 会被 promote_next 当成队头重复唤醒（同一 Run 跑两次）
            request.status = 'dispatched'
            await db.commit()
        return run_id, not ahead

    async def has_active_ahead(
        self,
        db: AsyncSession,
        *,
        uid: str,
        agent_slug: str,
        thread_id: str | None,
        exclude_run_id: str | None = None,
    ) -> bool:
        """同一排队键内是否已有活跃 Run（有 → 本次只能排队）。"""
        stmt = (
            select(AgentRunRequest.id)
            .where(
                AgentRunRequest.uid == str(uid),
                AgentRunRequest.agent_slug == str(agent_slug or 'default'),
                AgentRunRequest.thread_id == thread_id,
                AgentRunRequest.status.in_(_ACTIVE_REQUEST_STATUSES),
            )
            .limit(1)
        )
        if exclude_run_id:
            stmt = stmt.where(AgentRunRequest.run_id != exclude_run_id)
        return (await db.execute(stmt)).first() is not None

    async def promote_next(
        self,
        db: AsyncSession,
        *,
        uid: str,
        agent_slug: str,
        thread_id: str | None,
    ) -> str | None:
        """取同键队头（``id`` 升序的第一条 pending）并标记为已派发。

        返回被唤醒的 ``run_id``；无排队者返回 None。**按自增 id 排序**是 FIFO 的唯一
        依据——时间戳会受时钟回拨影响，UUID 无序。
        """
        stmt = (
            select(AgentRunRequest)
            .where(
                AgentRunRequest.uid == str(uid),
                AgentRunRequest.agent_slug == str(agent_slug or 'default'),
                AgentRunRequest.thread_id == thread_id,
                AgentRunRequest.status == 'pending',
            )
            .order_by(AgentRunRequest.id.asc())
            .limit(1)
        )
        row = (await db.execute(stmt)).scalars().first()
        if row is None:
            return None
        row.status = 'dispatched'
        await db.commit()
        log.info('agent Run 队头唤醒 run_id={} key=({}, {}, {})', row.run_id, uid, agent_slug, thread_id)
        return row.run_id

    async def finish_request(
        self,
        db: AsyncSession,
        *,
        run_id: str,
        status: str = 'done',
    ) -> None:
        """Run 收尾：把排队记录置为终态（`done`/`cancelled`），使后续提交能立即派发。"""
        row = (
            await db.execute(select(AgentRunRequest).where(AgentRunRequest.run_id == run_id))
        ).scalars().first()
        if row is not None:
            row.status = str(status)
        await db.commit()


_service: RunSubmissionService | None = None


def get_run_submission_service() -> RunSubmissionService:
    """模块级单例（与各域 ``get_xxx_service`` 同约定）。"""
    global _service
    if _service is None:
        _service = RunSubmissionService()
    return _service
