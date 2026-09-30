"""agent.* Celery 任务：Run 的执行、恢复与对账（agent 层设计 §4.1；D66、D71、D88）。

三个任务的边界（都很容易写歪，先说清楚）：

- ``agent.run``：**唯一**的图执行入口。取租约 → 起心跳 → 驱动执行器 → CAS 写终态 →
  唤醒队头。重复投递由 ``agent_run_attempts`` 的唯一约束拒绝，**不靠 Celery**（D66）；
- ``agent.resume``：按 D71 起一个**新 Run**（``parent_run_id`` 指向原 Run）而不是复用原行。
  D88 去了 checkpointer，所以 resume 的语义是「用同一份提交快照重放」——历史由
  ``payload.param.history`` 承担，不是从图快照续跑；
- ``agent.reconcile_waiting``：beat 兜底。Celery 消息会丢、worker 会崩，这两件事
  都不该让 Run 永远停在半路。``waiting_ingest`` 的分支要等 Phase 2 的文档等待关系
  落地（需要按 document 反查），本期先把租约与投递两条兜底补上。

**为什么编排放在这里而不是任务体里**：任务体只做「调度器适配」，真正的流程在
:func:`run_agent_once` / :func:`resume_agent_run` / :func:`reconcile_runs`——它们是
普通 async 函数，测试可以直接跑，不需要 broker。
"""

from __future__ import annotations

import asyncio
import contextlib

from datetime import timedelta
from typing import TYPE_CHECKING, Any

from sqlalchemy import select

from backend.src.app.agent.model.agent_run import AgentRun
from backend.src.app.agent.model.agent_run_attempt import AgentRunAttempt
from backend.src.app.agent.model.agent_run_request import AgentRunRequest
from backend.src.app.agent.service.run_executor import LeaseLostError, RunOutcome, get_run_executor
from backend.src.app.agent.service.run_queue_service import (
    CELERY_RECONCILE_TASK,
    CELERY_RESUME_TASK,
    CELERY_RUN_TASK,
    get_run_queue_service,
)
from backend.src.app.agent.service.run_submission_service import get_run_submission_service
from backend.src.app.agent.service.run_worker import RunWorker, get_run_worker
from backend.src.app.task.celery import celery_app
from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.db import async_db_session
from backend.src.utils.timezone import timezone

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = [
    'reconcile_runs',
    'reconcile_waiting_task',
    'resume_agent_run',
    'resume_agent_task',
    'run_agent_once',
    'run_agent_task',
]

#: 可被 resume 的状态：**已停下**的 Run 才能重放；还在跑的（queued/running/
#: waiting_ingest/cancel_requested）重放等于双跑，一律拒绝
_RESUMABLE_STATUSES = ('interrupted', 'failed', 'cancelled')


# ---------------------------------------------------------------------- 执行
async def run_agent_once(run_id: str, *, attempt_no: int = 1, worker: RunWorker | None = None) -> dict[str, Any]:
    """执行一次 Run 的完整编排（``agent.run`` 的任务体）。"""
    run_worker = worker or get_run_worker()
    queue = get_run_queue_service()
    submission = get_run_submission_service()

    async with async_db_session() as db:
        acquired = await run_worker.acquire(db, run_id=run_id, attempt_no=attempt_no)
    if not acquired:
        # 别人已在跑、已终态、或这个 attempt 已经投递过——三种都不是错误
        log.info('agent Run 未取得租约，跳过 run_id={} attempt={}', run_id, attempt_no)
        return {'run_id': run_id, 'status': 'skipped'}

    lease_lost = asyncio.Event()
    heartbeat = asyncio.create_task(_heartbeat_loop(run_worker, run_id, lease_lost))
    try:
        outcome = await get_run_executor().execute(run_id, lease_lost=lease_lost)
    except LeaseLostError as exc:
        log.warning('agent Run 租约丢失，放弃收尾 run_id={} err={}', run_id, exc)
        return {'run_id': run_id, 'status': 'lease_lost'}
    except Exception as exc:  # 执行器自身崩了也不能让 Run 停在 running
        log.exception('agent Run 执行器异常 run_id={} err={}', run_id, exc)
        outcome = RunOutcome(status='failed', error=f'Run 执行异常: {exc}', error_code='INTERNAL')
    finally:
        heartbeat.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await heartbeat

    async with async_db_session() as db:
        finalized = await run_worker.finalize(db, run_id=run_id, status=outcome.status, **outcome.finalize_fields())
        if finalized:
            await submission.finish_request(
                db, run_id=run_id, status='cancelled' if outcome.status == 'cancelled' else 'done'
            )
    if finalized:
        await queue.clear_cancel(run_id)
    await _wake_next(run_id)
    log.info('agent Run 收尾 run_id={} status={} code={}', run_id, outcome.status, outcome.error_code)
    return {'run_id': run_id, 'status': outcome.status, 'error_code': outcome.error_code}


async def _heartbeat_loop(worker: RunWorker, run_id: str, lease_lost: asyncio.Event) -> None:
    """独立事务续租；续不上即置位（执行器据此立刻停手，不再写终态）。

    独立事务是**必须的**：与执行共用会话的话，执行里任何一个长事务都会把心跳一起
    卡住，租约就会在「还活着」的时候过期。
    """
    interval = max(1, int(settings.RAGF_AGENT_HEARTBEAT_SECONDS))
    while True:
        await asyncio.sleep(interval)
        try:
            async with async_db_session() as db:
                alive = await worker.heartbeat(db, run_id=run_id)
        except Exception as exc:  # pragma: no cover - 数据库抖动不该直接判死持有者
            log.warning('agent Run 心跳异常 run_id={} err={}', run_id, exc)
            continue
        if not alive:
            lease_lost.set()
            return


async def _wake_next(run_id: str) -> str | None:
    """Run 收尾后唤醒同键队头并投递（串行语义的闭环）。"""
    submission = get_run_submission_service()
    async with async_db_session() as db:
        next_run_id = await submission.wake_next(db, run_id=run_id)
    if next_run_id:
        get_run_queue_service().dispatch_best_effort(next_run_id)
    return next_run_id


# ---------------------------------------------------------------------- 恢复
async def resume_agent_run(run_id: str) -> dict[str, Any]:
    """按 D71/D88 恢复：读原 Run 的提交快照 → 起新 Run（``parent_run_id``）→ 入队派发。"""
    submission = get_run_submission_service()
    async with async_db_session() as db:
        origin = (await db.execute(select(AgentRun).where(AgentRun.run_id == run_id))).scalars().first()
        if origin is None:
            return {'run_id': run_id, 'status': 'not_found'}
        if origin.status not in _RESUMABLE_STATUSES:
            return {'run_id': run_id, 'status': 'rejected', 'reason': f'状态不可恢复: {origin.status}'}
        request = (await db.execute(select(AgentRunRequest).where(AgentRunRequest.run_id == run_id))).scalars().first()
        if request is None:
            return {'run_id': run_id, 'status': 'rejected', 'reason': '缺少排队记录（无提交身份）'}
        if request.status in ('pending', 'dispatched'):
            # 原 Run 已停下，它的排队记录却还挂着——这种残留会让新 Run 排在一条死记录
            # 后面永远不派发。能走到这里说明状态已是终态/中断，残留必然是陈旧的，直接收尾。
            await submission.finish_request(db, run_id=run_id, status='done')
        new_run_id, dispatched = await submission.submit(
            db,
            payload=dict(origin.payload or {}),
            uid=request.uid,
            agent_slug=request.agent_slug,
            thread_id=request.thread_id,
        )
        # 父子关系在新 Run 上回填：D71 用 parent_run_id 串联「一次中断 + 一次恢复」
        child = (await db.execute(select(AgentRun).where(AgentRun.run_id == new_run_id))).scalars().first()
        if child is not None:
            child.parent_run_id = run_id
            await db.commit()
    if dispatched:
        try:
            get_run_queue_service().dispatch(new_run_id)
        except Exception as exc:
            log.warning('agent Run resume 投递失败，等对账兜底 run_id={} err={}', new_run_id, exc)
    log.info('agent Run 恢复 run_id={} → new_run_id={} dispatched={}', run_id, new_run_id, dispatched)
    return {'run_id': run_id, 'new_run_id': new_run_id, 'status': 'resumed', 'dispatched': dispatched}


# ---------------------------------------------------------------------- 对账
async def reconcile_runs(*, limit: int = 100) -> dict[str, Any]:
    """兜底对账：租约过期收敛 + 投递丢失重投（beat 周期调用）。"""
    worker = get_run_worker()
    submission = get_run_submission_service()
    redispatched: list[str] = []
    async with async_db_session() as db:
        expired = await worker.reconcile_expired(db, limit=limit)
        # 过期收敛只改 Run 行是不够的：排队记录不收尾，同键后面的 Run 会永远排在
        # 一条「看着还活跃、实际已经死了」的记录后面——这是最隐蔽的一种队列卡死。
        for run_id in expired:
            await submission.finish_request(db, run_id=run_id, status='done')
        redispatch, exhausted = await _collect_stalled(db, limit=limit)
        failed: list[str] = []
        for run_id in exhausted:
            abandoned = await worker.abandon_queued(
                db,
                run_id=run_id,
                error='投递多次仍无人接手（Celery 消息丢失或队列无消费者）',
                error_code='DISPATCH_EXHAUSTED',
            )
            if abandoned:
                failed.append(run_id)
                # 排队记录必须一起收尾：否则同键后面的 Run 永远等不到队头
                await submission.finish_request(db, run_id=run_id, status='done')
    for run_id in failed:
        await _wake_next(run_id)
    # 租约过期收敛掉的 Run 同样要放行队头（它们的排队记录已在上面的会话里收尾）
    for run_id in expired:
        await _wake_next(run_id)
    queue = get_run_queue_service()
    for run_id in redispatch:
        try:
            queue.dispatch(run_id)
            redispatched.append(run_id)
        except Exception as exc:
            log.warning('agent Run 对账重投失败 run_id={} err={}', run_id, exc)
    if expired or redispatched or failed:
        log.warning(
            'agent Run 对账：租约过期 {} 条、重投 {} 条、投递耗尽 {} 条',
            len(expired),
            len(redispatched),
            len(failed),
        )
    return {'expired': expired, 'redispatched': redispatched, 'exhausted': failed}


async def _collect_stalled(db: AsyncSession, *, limit: int) -> tuple[list[str], list[str]]:
    """找出「已派发但无人接手」的 queued Run → ``(可重投, 次数耗尽)``。

    只认 ``request.status='dispatched'``：``pending`` 说明它排在别人后面，重投会破坏
    FIFO 串行语义（那是派发决策的事，不是对账该越权的地方）。
    """
    deadline = timezone.now() - timedelta(seconds=int(settings.RAGF_AGENT_DISPATCH_TIMEOUT_SECONDS))
    rows = (
        (
            await db.execute(
                select(AgentRun.run_id)
                .join(AgentRunRequest, AgentRunRequest.run_id == AgentRun.run_id)
                .where(
                    AgentRun.status == 'queued',
                    AgentRunRequest.status == 'dispatched',
                    AgentRunRequest.updated_time < deadline,
                )
                .limit(int(limit))
            )
        )
        .scalars()
        .all()
    )
    if not rows:
        return [], []
    counts: dict[str, int] = {}
    for (run_id,) in (
        await db.execute(select(AgentRunAttempt.run_id).where(AgentRunAttempt.run_id.in_(list(rows))))
    ).all():
        counts[str(run_id)] = counts.get(str(run_id), 0) + 1
    max_attempts = max(1, int(settings.RAGF_AGENT_MAX_ATTEMPTS))
    redispatch: list[str] = []
    exhausted: list[str] = []
    for run_id in rows:
        if counts.get(str(run_id), 0) < max_attempts:
            redispatch.append(str(run_id))
        else:
            exhausted.append(str(run_id))
    return redispatch, exhausted


# ---------------------------------------------------------------------- 任务体
@celery_app.task(name=CELERY_RUN_TASK)
async def run_agent_task(run_id: str, attempt_no: int = 1) -> dict[str, Any]:
    """执行一个 Run（``agent`` 队列消费者：``-Q agent``）。"""
    return await run_agent_once(run_id, attempt_no=int(attempt_no))


@celery_app.task(name=CELERY_RESUME_TASK)
async def resume_agent_task(run_id: str) -> dict[str, Any]:
    """从一个已停下的 Run 恢复（D71：起新 Run，不复用原行）。"""
    return await resume_agent_run(run_id)


@celery_app.task(name=CELERY_RECONCILE_TASK)
async def reconcile_waiting_task(limit: int = 100) -> dict[str, Any]:
    """Run 对账（beat 周期触发）：租约过期收敛 + 投递丢失重投。"""
    return await reconcile_runs(limit=int(limit))
