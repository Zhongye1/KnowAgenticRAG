"""Run worker：租约、心跳与幂等收敛（agent 层设计 §4.1 / D88）。

**为什么租约必须自建**：Celery 的 ``visibility_timeout`` 面向「短任务重投递」，
对分钟级 Run 不可靠——worker 崩溃后消息会不会回来、什么时候回来都不确定。
因此「谁在跑、跑到什么时候」由 PG 上的租约表达，Celery 只负责把任务送到。

三个不变量（都有并发含义）：

1. **一个 Run 同时只有一个持有者**——靠 ``agent_run_attempts`` 的
   ``(run_id, attempt_no)`` 唯一约束 + ``agent_runs`` 的条件更新（CAS）双保险：
   前者拒绝重复投递，后者拒绝后来者夺权；
2. **持有者必须续租**——心跳在**独立事务**里延长 ``lease_expires_at``，
   否则长任务会被自己的租约判死；
3. **过期即收敛为 failed**——对账任务按 ``status + lease_expires_at`` 扫描，
   幂等写终态（重复收敛不会覆盖已有终态）。
"""

from __future__ import annotations

import socket

from datetime import timedelta
from typing import TYPE_CHECKING, Any

import sqlalchemy as sa

from sqlalchemy import CursorResult, select
from sqlalchemy.exc import IntegrityError

from backend.src.app.agent.model.agent_run import AGENT_RUN_TERMINAL_STATUSES, AgentRun
from backend.src.app.agent.model.agent_run_attempt import AgentRunAttempt
from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.utils.timezone import timezone

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['RunWorker', 'get_run_worker', 'worker_identity']

#: 执行中、可被心跳延续的状态（waiting_ingest 也算持有：Run 仍挂在某个 worker 上）
_LEASE_HOLDING_STATUSES = ('running', 'waiting_ingest')


def _rowcount(result: Any) -> int:
    """受影响行数：``execute`` 的静态类型是 ``Result``，只有 DML 走 ``CursorResult``。"""
    return int(result.rowcount) if isinstance(result, CursorResult) else 0


def worker_identity() -> str:
    """worker 标识：主机名 + PID 足够区分同机多进程，且便于日志定位。"""
    import os

    return f'{socket.gethostname()}:{os.getpid()}'


class RunWorker:
    """租约的取/续/放与过期收敛（纯 DB 语义，不关心图怎么跑）。"""

    def __init__(self, worker_id: str | None = None) -> None:
        self.worker_id = worker_id or worker_identity()

    # ------------------------------------------------------------------ 取租约
    async def acquire(self, db: AsyncSession, *, run_id: str, attempt_no: int = 1) -> bool:
        """尝试取得 Run 的执行权；返回 False 表示「别人已在跑」或「已终态」。

        顺序很重要：**先插 attempt**（唯一约束挡住重复投递），**再 CAS 抢状态**。
        反过来会出现「状态抢到了但 attempt 插入失败」的悬挂持有者。
        """
        db.add(AgentRunAttempt(run_id=run_id, attempt_no=int(attempt_no), worker_id=self.worker_id, status='running'))
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            log.info('agent Run attempt 已存在，拒绝重复执行 run_id={} attempt={}', run_id, attempt_no)
            return False

        lease_expires = timezone.now() + timedelta(seconds=int(settings.RAGF_AGENT_LEASE_SECONDS))
        result = await db.execute(
            sa
            .update(AgentRun)
            .where(AgentRun.run_id == run_id, AgentRun.status == 'queued')
            .values(
                status='running',
                worker_id=self.worker_id,
                heartbeat_at=timezone.now(),
                lease_expires_at=lease_expires,
            )
        )
        if not _rowcount(result):
            # 状态已不是 queued（别人抢到 / 已取消 / 已终态）——放弃本次 attempt
            await db.rollback()
            log.info('agent Run 状态不可取，放弃执行 run_id={}', run_id)
            return False
        await db.commit()
        return True

    # ------------------------------------------------------------------ 续租
    async def heartbeat(self, db: AsyncSession, *, run_id: str) -> bool:
        """延长租约（独立事务调用）；返回 False 表示租约已被判失效。

        调用方拿到 False 应**主动中止执行**——继续跑等于两个 worker 同时写同一 Run。
        """
        lease_expires = timezone.now() + timedelta(seconds=int(settings.RAGF_AGENT_LEASE_SECONDS))
        result = await db.execute(
            sa
            .update(AgentRun)
            .where(
                AgentRun.run_id == run_id,
                AgentRun.worker_id == self.worker_id,
                AgentRun.status.in_(_LEASE_HOLDING_STATUSES),
            )
            .values(heartbeat_at=timezone.now(), lease_expires_at=lease_expires)
        )
        await db.commit()
        if not _rowcount(result):
            log.warning('agent Run 租约丢失，worker 应中止执行 run_id={} worker={}', run_id, self.worker_id)
            return False
        return True

    # ------------------------------------------------------------------ 放租约 / 写终态
    async def finalize(
        self,
        db: AsyncSession,
        *,
        run_id: str,
        status: str,
        attempt_status: str | None = None,
        **fields: Any,
    ) -> bool:
        """CAS 写终态：只有仍持有租约的 worker 能收尾；重复收尾不覆盖。

        ``**fields`` 透传审计字段（steps / usage / tool_call_count / rewrite_count /
        model_spec / error / output_message_id），由调用方按 D92 组装
        （取消/超时场景要把**已收集的部分结果**一并写入，而不是丢弃）。
        """
        if status not in AGENT_RUN_TERMINAL_STATUSES:
            raise ValueError(f'finalize 只接受终态，收到 {status!r}')
        result = await db.execute(
            sa
            .update(AgentRun)
            .where(AgentRun.run_id == run_id, AgentRun.worker_id == self.worker_id)
            .values(status=status, lease_expires_at=None, **fields)
        )
        if _rowcount(result):
            await db.execute(
                sa
                .update(AgentRunAttempt)
                .where(AgentRunAttempt.run_id == run_id, AgentRunAttempt.worker_id == self.worker_id)
                .values(status=attempt_status or ('succeeded' if status == 'completed' else 'failed'))
            )
        await db.commit()
        return bool(_rowcount(result))

    # ------------------------------------------------------------------ 放弃排队
    async def abandon_queued(
        self,
        db: AsyncSession,
        *,
        run_id: str,
        error: str,
        error_code: str | None = None,
    ) -> bool:
        """放弃一个**从未被取租约**的排队 Run（对账用）。

        与 :meth:`finalize` 的区别是 CAS 条件：收尾要求「我是持有者」，而这里根本没有
        持有者（``worker_id`` 为空），条件必须是 ``status='queued'`` —— 一旦有人抢到
        租约，这次放弃就落空，由正常的执行路径负责收尾。
        """
        result = await db.execute(
            sa
            .update(AgentRun)
            .where(AgentRun.run_id == run_id, AgentRun.status == 'queued')
            .values(status='failed', error=str(error), error_code=error_code, lease_expires_at=None)
        )
        await db.commit()
        return bool(_rowcount(result))

    # ------------------------------------------------------------------ 过期收敛
    async def reconcile_expired(self, db: AsyncSession, *, limit: int = 50) -> list[str]:
        """把租约过期的 running Run 幂等收敛为 failed（对账任务调用）。

        幂等：条件里带 ``status='running'``，已终态的行不会被二次改写；
        重复调用只会把**新过期**的行收敛掉。
        """
        now = timezone.now()
        rows = (
            (
                await db.execute(
                    select(AgentRun.run_id)
                    .where(
                        AgentRun.status == 'running',
                        AgentRun.lease_expires_at.is_not(None),
                        AgentRun.lease_expires_at < now,
                    )
                    .limit(int(limit))
                )
            )
            .scalars()
            .all()
        )
        if not rows:
            return []
        await db.execute(
            sa
            .update(AgentRun)
            .where(AgentRun.run_id.in_(list(rows)), AgentRun.status == 'running')
            .values(status='failed', error='租约过期：worker 失联', lease_expires_at=None)
        )
        await db.execute(
            sa
            .update(AgentRunAttempt)
            .where(AgentRunAttempt.run_id.in_(list(rows)), AgentRunAttempt.status == 'running')
            .values(status='lost', error='租约过期：worker 失联')
        )
        await db.commit()
        log.warning('agent Run 租约过期收敛为 failed count={} runs={}', len(rows), list(rows))
        return list(rows)


_worker: RunWorker | None = None


def get_run_worker() -> RunWorker:
    """模块级单例；测试可自行构造 ``RunWorker(worker_id='test:1')``。"""
    global _worker
    if _worker is None:
        _worker = RunWorker()
    return _worker
