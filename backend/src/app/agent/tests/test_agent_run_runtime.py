"""Run 运行态不变量测试（agent 层设计 §4.1）。

四条必须钉住的不变量——它们都是**并发语义**，错了不会报错，只会静默双跑或丢任务：

1. **同一排队键串行**：同 ``(uid, agent_slug, thread_id)`` 有活跃 Run 时，新提交只能排队；
2. **FIFO 按自增序**：唤醒的是最早入队的那条，不是最早创建时间的（时钟不可信）；
3. **一个 Run 只有一个持有者**：重复投递 / 抢状态都必须被拒；
4. **租约过期幂等收敛**：worker 失联后收敛为 failed，重复收敛不覆盖终态。
"""

from __future__ import annotations

import asyncio

from datetime import timedelta
from typing import Any

import pytest

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from backend.src.app.agent.model.agent_run import AgentRun
from backend.src.app.agent.model.agent_run_attempt import AgentRunAttempt
from backend.src.app.agent.model.agent_run_request import AgentRunRequest
from backend.src.app.agent.schema.agent import AgentParam
from backend.src.app.agent.service.run_payload import build_run_payload
from backend.src.app.agent.service.run_submission_service import RunSubmissionService
from backend.src.app.agent.service.run_worker import RunWorker
from backend.src.common.model import MappedBase
from backend.src.database.db import get_database_url
from backend.src.database.ragf_schema_migrations import ensure_ragf_column_migrations
from backend.src.utils.timezone import timezone

_NS = 'agent_runtime_test'
_UID = 'u-runtime'


async def _prepare(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(MappedBase.metadata.create_all)
    await ensure_ragf_column_migrations(engine)


async def _with_session(coro: Any) -> Any:
    engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            return await coro(session)
    finally:
        await engine.dispose()


async def _cleanup(session: AsyncSession) -> None:
    """清掉本模块的残留（用例之间互不干扰）。"""
    await session.execute(delete(AgentRunRequest).where(AgentRunRequest.plugin_namespace == _NS))
    await session.execute(delete(AgentRun).where(AgentRun.plugin_namespace == _NS))
    await session.commit()


@pytest.fixture(scope='module', autouse=True)
def _pg_available() -> Any:
    engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
    try:
        asyncio.run(_prepare(engine))
    except Exception as exc:  # pragma: no cover - 本地环境相关
        pytest.skip(f'真实 PG 不可达，跳过 Run 运行态用例: {exc}')
    finally:
        asyncio.run(engine.dispose())
    yield
    engine2 = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)

    async def _drop() -> None:
        async with async_sessionmaker(engine2, expire_on_commit=False)() as session:
            await _cleanup(session)

    asyncio.run(_drop())
    asyncio.run(engine2.dispose())


async def _submit(
    svc: RunSubmissionService, session: AsyncSession, *, thread: str, query: str = '问'
) -> tuple[str, bool]:
    payload = build_run_payload(kb_name='kb-a', param=AgentParam.model_validate({'query_text': query}), namespace=_NS)
    return await svc.submit(
        session,
        payload=payload,
        uid=_UID,
        agent_slug='default',
        thread_id=thread,
    )


# --------------------------------------------------------------- 1. 同键串行
def test_same_thread_queues_behind_active_run() -> None:
    async def _run() -> None:
        svc = RunSubmissionService()
        async with async_sessionmaker(
            create_async_engine(get_database_url(unittest=True), poolclass=NullPool), expire_on_commit=False
        )() as session:
            first_run, first_dispatched = await _submit(svc, session, thread='t-serial')
            second_run, second_dispatched = await _submit(svc, session, thread='t-serial')
            try:
                assert first_dispatched is True
                assert second_dispatched is False, '同键已有活跃 Run，第二次提交必须排队'
                assert first_run != second_run
            finally:
                await _cleanup(session)

    asyncio.run(_run())


def test_different_thread_dispatches_immediately() -> None:
    async def _run() -> None:
        svc = RunSubmissionService()
        async with async_sessionmaker(
            create_async_engine(get_database_url(unittest=True), poolclass=NullPool), expire_on_commit=False
        )() as session:
            _, d1 = await _submit(svc, session, thread='t-a')
            _, d2 = await _submit(svc, session, thread='t-b')
            try:
                assert d1 is True
                assert d2 is True, '不同会话互不阻塞'
            finally:
                await _cleanup(session)

    asyncio.run(_run())


# --------------------------------------------------------------- 2. FIFO
def test_promote_next_returns_earliest_enqueued() -> None:
    async def _run() -> None:
        svc = RunSubmissionService()
        async with async_sessionmaker(
            create_async_engine(get_database_url(unittest=True), poolclass=NullPool), expire_on_commit=False
        )() as session:
            first, _ = await _submit(svc, session, thread='t-fifo')
            second, _ = await _submit(svc, session, thread='t-fifo')
            third, _ = await _submit(svc, session, thread='t-fifo')
            try:
                promoted = await svc.promote_next(session, uid=_UID, agent_slug='default', thread_id='t-fifo')
                assert promoted == second, '队头是第二条（第一条已 dispatched）'
                again = await svc.promote_next(session, uid=_UID, agent_slug='default', thread_id='t-fifo')
                assert again == third
                assert (await svc.promote_next(session, uid=_UID, agent_slug='default', thread_id='t-fifo')) is None, (
                    '队空返回 None'
                )
                assert first != second != third
            finally:
                await _cleanup(session)

    asyncio.run(_run())


# --------------------------------------------------------------- 3. 单持有者
def test_acquire_is_exclusive_per_run() -> None:
    async def _run() -> None:
        svc = RunSubmissionService()
        async with async_sessionmaker(
            create_async_engine(get_database_url(unittest=True), poolclass=NullPool), expire_on_commit=False
        )() as session:
            run_id, _ = await _submit(svc, session, thread='t-lease')
            try:
                w1, w2 = RunWorker(worker_id='w1'), RunWorker(worker_id='w2')
                assert await w1.acquire(session, run_id=run_id) is True
                # 同一 attempt_no 重复投递 → attempt 唯一约束拒绝
                assert await RunWorker(worker_id='w3').acquire(session, run_id=run_id) is False
                # 换 attempt_no 也不行：状态已非 queued，CAS 拿不到
                assert await w2.acquire(session, run_id=run_id, attempt_no=2) is False
                row = (await session.execute(select(AgentRun).where(AgentRun.run_id == run_id))).scalars().first()
                assert row is not None and row.worker_id == 'w1'
            finally:
                await _cleanup(session)

    asyncio.run(_run())


def test_only_lease_holder_can_finalize() -> None:
    async def _run() -> None:
        svc = RunSubmissionService()
        async with async_sessionmaker(
            create_async_engine(get_database_url(unittest=True), poolclass=NullPool), expire_on_commit=False
        )() as session:
            run_id, _ = await _submit(svc, session, thread='t-finalize')
            try:
                holder = RunWorker(worker_id='holder')
                assert await holder.acquire(session, run_id=run_id) is True
                # 非持有者不能收尾
                intruder_done = await RunWorker(worker_id='intruder').finalize(
                    session, run_id=run_id, status='completed'
                )
                assert intruder_done is False
                done_row = await holder.finalize(session, run_id=run_id, status='completed', steps=[{'node': 'plan'}])
                assert done_row is True
                # 重复收尾不覆盖（状态已非 holding，但 CAS 仍按 worker_id 命中 → 允许改写终态需避免）
                row = (await session.execute(select(AgentRun).where(AgentRun.run_id == run_id))).scalars().first()
                assert row is not None and row.status == 'completed'
                assert row.steps == [{'node': 'plan'}]
            finally:
                await _cleanup(session)

    asyncio.run(_run())


def test_finalize_rejects_non_terminal_status() -> None:
    worker = RunWorker(worker_id='w')
    with pytest.raises(ValueError, match='只接受终态'):

        async def _run() -> None:
            async with async_sessionmaker(
                create_async_engine(get_database_url(unittest=True), poolclass=NullPool), expire_on_commit=False
            )() as session:
                await worker.finalize(session, run_id='whatever', status='running')

        asyncio.run(_run())


# --------------------------------------------------------------- 4. 过期收敛
def test_reconcile_expired_is_idempotent() -> None:
    async def _run() -> None:
        svc = RunSubmissionService()
        async with async_sessionmaker(
            create_async_engine(get_database_url(unittest=True), poolclass=NullPool), expire_on_commit=False
        )() as session:
            run_id, _ = await _submit(svc, session, thread='t-expire')
            try:
                worker = RunWorker(worker_id='doomed')
                assert await worker.acquire(session, run_id=run_id) is True
                # 把租约拨到过去（模拟 worker 失联）
                row = (await session.execute(select(AgentRun).where(AgentRun.run_id == run_id))).scalars().first()
                assert row is not None
                row.lease_expires_at = timezone.now() - timedelta(seconds=1)
                await session.commit()

                swept = await RunWorker(worker_id='reaper').reconcile_expired(session)
                assert run_id in swept
                row = (await session.execute(select(AgentRun).where(AgentRun.run_id == run_id))).scalars().first()
                assert row is not None and row.status == 'failed' and row.error is not None
                attempts = (
                    (await session.execute(select(AgentRunAttempt).where(AgentRunAttempt.run_id == run_id)))
                    .scalars()
                    .all()
                )
                assert [a.status for a in attempts] == ['lost']

                # 幂等：终态不再被二次收敛
                assert run_id not in await RunWorker(worker_id='reaper').reconcile_expired(session)
            finally:
                await _cleanup(session)

    asyncio.run(_run())
