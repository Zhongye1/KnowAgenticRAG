"""真实 PostgreSQL 上的 AgentRun 运行清单与 RunAttempt 事实测试。"""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import timedelta

import pytest
import pytest_asyncio
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.repositories.agent_run_repository import AgentRunRepository
from ars.storage.postgres.manager import AGENT_RUN_FACT_SCHEMA_STATEMENTS
from ars.storage.postgres.models_business import AgentRun, AgentRunAttempt, Conversation, Message, Project, User
from ars.utils.datetime_utils import utc_now_naive

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


@pytest_asyncio.fixture()
async def fact_database():
    engine = create_async_engine(os.environ["POSTGRES_URL"], pool_pre_ping=True)
    async with engine.begin() as connection:
        for _ in range(2):
            for statement in AGENT_RUN_FACT_SCHEMA_STATEMENTS:
                await connection.execute(text(statement))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield engine, session_factory
    finally:
        await engine.dispose()


async def _create_run(session_factory, *, status: str = "pending") -> tuple[str, str]:
    run_id = str(uuid.uuid4())
    request_id = f"fact-{uuid.uuid4()}"
    thread_id = f"pytest-fact-{uuid.uuid4()}"
    uid = f"pytest-user-{uuid.uuid4()}"
    project_id = str(uuid.uuid4())
    async with session_factory() as db:
        db.add(User(username=uid, uid=uid, password_hash="test"))
        await db.flush()
        db.add(
            Project(
                id=project_id,
                uid=uid,
                selection_status="implicit",
                workdir_path=f"projects/{project_id}",
                directory_mode="managed",
            )
        )
        await db.flush()
        conversation = Conversation(
            thread_id=thread_id,
            uid=uid,
            project_id=project_id,
            agent_id="main",
            status="active",
        )
        db.add(conversation)
        await db.flush()
        message = Message(
            conversation_id=conversation.id,
            role="user",
            content="fact input",
            request_id=request_id,
            delivery_status="dispatched",
        )
        db.add(message)
        await db.flush()
        db.add(
            AgentRun(
                id=run_id,
                conversation_thread_id=thread_id,
                runtime_scope_id=thread_id,
                agent_slug="main",
                uid=uid,
                request_id=request_id,
                conversation_id=conversation.id,
                input_message_id=message.id,
                input_payload={"model_spec": "provider/model-a"},
                status=status,
                run_type="chat",
            )
        )
        await db.commit()
        return run_id, thread_id


async def _cleanup_runs(session_factory, thread_ids: list[str]) -> None:
    async with session_factory() as db:
        rows = (
            await db.execute(
                select(Conversation.project_id, Conversation.uid).where(Conversation.thread_id.in_(thread_ids))
            )
        ).all()
        conversation_ids = list(
            (await db.scalars(select(Conversation.id).where(Conversation.thread_id.in_(thread_ids)))).all()
        )
        if conversation_ids:
            await db.execute(delete(Message).where(Message.conversation_id.in_(conversation_ids)))
        await db.execute(delete(AgentRun).where(AgentRun.conversation_thread_id.in_(thread_ids)))
        await db.execute(delete(Conversation).where(Conversation.thread_id.in_(thread_ids)))
        await db.execute(delete(Project).where(Project.id.in_([row.project_id for row in rows])))
        await db.execute(delete(User).where(User.uid.in_([row.uid for row in rows])))
        await db.commit()


async def _persisted_attempts(session_factory, run_id: str) -> list[AgentRunAttempt]:
    async with session_factory() as db:
        return await AgentRunRepository(db).list_run_attempts(run_id)


async def test_run_fact_schema_evolution_is_idempotent(fact_database):
    engine, _ = fact_database
    async with engine.connect() as connection:
        columns = set(
            (
                await connection.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_name = 'agent_runs' "
                        "AND column_name IN ('manifest', 'manifest_fingerprint', 'manifest_recorded_at')"
                    )
                )
            ).scalars()
        )
        attempt_table_exists = await connection.scalar(
            text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_run_attempts')")
        )
        unique_index_exists = await connection.scalar(
            text(
                "SELECT EXISTS (SELECT 1 FROM pg_indexes "
                "WHERE tablename = 'agent_run_attempts' "
                "AND indexname = 'uq_agent_run_attempts_run_attempt_no')"
            )
        )

    assert columns == {"manifest", "manifest_fingerprint", "manifest_recorded_at"}
    assert attempt_table_exists is True
    assert unique_index_exists is True


async def test_attempt_history_survives_retry_takeover_and_reconciliation(fact_database):
    """重试、接管与失联收敛各自留下不可改写的 attempt 事实。"""
    _, session_factory = fact_database
    now = utc_now_naive()
    owner_a = "worker-a:token-1"
    owner_b = "worker-b:token-2"
    run_id, thread_id = await _create_run(session_factory)

    try:
        async with session_factory() as db:
            repository = AgentRunRepository(db)
            _, first_claim = await repository.mark_running(run_id, worker_id=owner_a, lease_seconds=60, now=now)
            await db.commit()
        assert first_claim is True

        async with session_factory() as db:
            repository = AgentRunRepository(db)
            renewed = await repository.renew_lease(
                run_id, worker_id=owner_a, lease_seconds=60, now=now + timedelta(seconds=10)
            )
            await db.commit()
        assert renewed is True

        async with session_factory() as db:
            repository = AgentRunRepository(db)
            released = await repository.release_lease_for_retry(
                run_id, worker_id=owner_a, now=now + timedelta(seconds=11)
            )
            await db.commit()
        assert released is True

        async with session_factory() as db:
            run = await db.get(AgentRun, run_id)
            assert run is not None
            assert run.runtime_cleanup_pending is True
            run.runtime_cleanup_pending = False
            await db.commit()

        async with session_factory() as db:
            repository = AgentRunRepository(db)
            _, second_claim = await repository.mark_running(
                run_id, worker_id=owner_b, lease_seconds=5, now=now + timedelta(seconds=12)
            )
            await db.commit()
        assert second_claim is True

        reconciled_at = now + timedelta(seconds=30)
        async with session_factory() as db:
            repository = AgentRunRepository(db)
            reconciled, cancelled_descendants = await repository.reconcile_expired_leases(now=reconciled_at)
            await db.commit()

        attempts = await _persisted_attempts(session_factory, run_id)

        assert [run.id for run in reconciled] == [run_id]
        assert cancelled_descendants == []
        assert [attempt.attempt_no for attempt in attempts] == [1, 2]
        first, second = attempts
        assert first.worker_id == owner_a
        assert first.outcome == "retry_released"
        assert first.finished_at is not None
        assert first.finished_at < second.finished_at
        assert first.heartbeat_at == now + timedelta(seconds=10)
        assert second.worker_id == owner_b
        assert second.outcome == "lease_expired"
        assert second.error_type == "worker_lease_expired"
        assert second.finished_at == reconciled_at
    finally:
        await _cleanup_runs(session_factory, [thread_id])


async def test_concurrent_claims_produce_single_valid_attempt(fact_database):
    """真实行锁下并发 claim 只有一个 attempt 获得有效执行权。"""
    _, session_factory = fact_database
    now = utc_now_naive()
    run_id, thread_id = await _create_run(session_factory)

    async def claim(worker_id: str) -> bool:
        async with session_factory() as db:
            repository = AgentRunRepository(db)
            _, acquired = await repository.mark_running(run_id, worker_id=worker_id, lease_seconds=60, now=now)
            await db.commit()
            return acquired

    try:
        results = await asyncio.gather(
            claim("worker-race:token-1"),
            claim("worker-race:token-2"),
            claim("worker-race:token-3"),
        )
        attempts = await _persisted_attempts(session_factory, run_id)

        assert results.count(True) == 1
        assert len(attempts) == 1
        assert attempts[0].attempt_no == 1
        assert attempts[0].worker_id in {"worker-race:token-1", "worker-race:token-2", "worker-race:token-3"}
        assert attempts[0].finished_at is None
    finally:
        await _cleanup_runs(session_factory, [thread_id])


async def test_duplicate_attempt_no_rejected_by_unique_constraint(fact_database):
    """(run_id, attempt_no) 唯一约束是执行占有事实的数据库级失败面。"""
    _, session_factory = fact_database
    now = utc_now_naive()
    run_id, thread_id = await _create_run(session_factory)

    try:
        async with session_factory() as db:
            repository = AgentRunRepository(db)
            _, acquired = await repository.mark_running(
                run_id, worker_id="worker-uq:token-1", lease_seconds=60, now=now
            )
            await db.commit()
        assert acquired is True

        async with session_factory() as db:
            db.add(
                AgentRunAttempt(
                    run_id=run_id,
                    attempt_no=1,
                    worker_id="worker-forged:token-x",
                    started_at=now,
                )
            )
            with pytest.raises(IntegrityError):
                await db.flush()
            await db.rollback()

        attempts = await _persisted_attempts(session_factory, run_id)
        assert [attempt.worker_id for attempt in attempts] == ["worker-uq:token-1"]
    finally:
        await _cleanup_runs(session_factory, [thread_id])


async def test_manifest_write_once_keeps_original_fingerprint_after_config_change(fact_database):
    """配置变化后重放不能改写历史 Run 的 manifest 与指纹。"""
    _, session_factory = fact_database
    now = utc_now_naive()
    owner = "worker-manifest:token-1"
    run_id, thread_id = await _create_run(session_factory)

    try:
        async with session_factory() as db:
            repository = AgentRunRepository(db)
            await repository.mark_running(run_id, worker_id=owner, lease_seconds=60, now=now)
            await db.commit()

        original_manifest = {"manifest_version": 1, "model": {"spec": "provider/model-a"}}
        original_fingerprint = "a" * 64
        async with session_factory() as db:
            repository = AgentRunRepository(db)
            _, recorded = await repository.record_run_manifest(
                run_id,
                manifest=original_manifest,
                fingerprint=original_fingerprint,
                worker_id=owner,
                now=now + timedelta(seconds=1),
            )
            await db.commit()
        assert recorded is True

        async with session_factory() as db:
            repository = AgentRunRepository(db)
            _, rewritten = await repository.record_run_manifest(
                run_id,
                manifest={"manifest_version": 1, "model": {"spec": "provider/model-changed"}},
                fingerprint="b" * 64,
                worker_id=owner,
                now=now + timedelta(seconds=2),
            )
            await db.commit()
        assert rewritten is False

        async with session_factory() as db:
            persisted_run = await db.get(AgentRun, run_id)

        assert persisted_run.manifest == original_manifest
        assert persisted_run.manifest_fingerprint == original_fingerprint
        assert persisted_run.manifest_recorded_at == now + timedelta(seconds=1)
    finally:
        await _cleanup_runs(session_factory, [thread_id])


async def test_manifest_rejects_stale_owner_and_expired_lease(fact_database):
    """非 owner 或过期 lease 不能固化 manifest；历史 Run 的 NULL 保持 unknown。"""
    _, session_factory = fact_database
    now = utc_now_naive()
    run_id, thread_id = await _create_run(session_factory)
    legacy_run_id, legacy_thread_id = await _create_run(session_factory)

    try:
        async with session_factory() as db:
            repository = AgentRunRepository(db)
            await repository.mark_running(run_id, worker_id="worker-live:token-1", lease_seconds=60, now=now)
            await db.commit()

        async with session_factory() as db:
            repository = AgentRunRepository(db)
            with pytest.raises(ValueError, match="lease owner"):
                await repository.record_run_manifest(
                    run_id,
                    manifest={"manifest_version": 1},
                    fingerprint="a" * 64,
                    worker_id="worker-stale:token-2",
                    now=now + timedelta(seconds=1),
                )
            await db.rollback()

        async with session_factory() as db:
            repository = AgentRunRepository(db)
            with pytest.raises(ValueError, match="lease owner"):
                await repository.record_run_manifest(
                    run_id,
                    manifest={"manifest_version": 1},
                    fingerprint="a" * 64,
                    worker_id="worker-live:token-1",
                    now=now + timedelta(seconds=61),
                )
            await db.rollback()

        async with session_factory() as db:
            active_run = await db.get(AgentRun, run_id)
            legacy_run = await db.get(AgentRun, legacy_run_id)

        assert active_run.manifest is None
        assert active_run.manifest_fingerprint is None
        # 历史 Run 未固化 manifest 的事实保持 unknown，不会被补写。
        assert legacy_run.manifest is None
        assert legacy_run.manifest_recorded_at is None
        assert await _persisted_attempts(session_factory, legacy_run_id) == []
    finally:
        await _cleanup_runs(session_factory, [thread_id, legacy_thread_id])
