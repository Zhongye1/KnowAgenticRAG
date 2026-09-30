from __future__ import annotations

from datetime import timedelta

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.repositories.agent_run_repository import AgentRunRepository
from ars.storage.postgres.models_business import AgentRun, Base, Conversation, Message, SubagentThread
from ars.utils.datetime_utils import utc_now_naive

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]


@pytest_asyncio.fixture()
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        yield db
    await engine.dispose()


async def _bind_valid_output(
    db,
    repository: AgentRunRepository,
    run: AgentRun,
    *,
    worker_id: str,
    now,
) -> Message:
    """为运行中的 Run 创建并绑定满足因果约束的输出消息。"""

    if run.conversation_id is None:
        conversation = Conversation(
            thread_id=run.conversation_thread_id,
            project_id=f"project-{run.conversation_thread_id}",
            uid=run.uid,
            agent_id=run.agent_slug,
            status="active",
        )
        db.add(conversation)
        await db.flush()
        run.conversation_id = conversation.id

    message = Message(
        conversation_id=run.conversation_id,
        run_id=run.id,
        request_id=run.request_id,
        role="assistant",
        content="done",
    )
    db.add(message)
    await db.flush()
    await repository.set_output_message(run.id, message.id, worker_id=worker_id, now=now)
    return message


async def _seed_subagent_runs(db, *, relation_child_thread_id: str = "child-thread") -> AgentRun:
    child_run = AgentRun(
        id="child-run",
        conversation_thread_id="child-thread",
        runtime_scope_id="parent-thread",
        agent_slug="worker",
        uid="user-1",
        status="completed",
        request_id="child-req",
        conversation_id=20,
        created_by_run_id="parent-run",
        subagent_thread_relation_id=77,
        run_type="subagent",
        input_payload={},
    )
    db.add_all(
        [
            Conversation(
                id=10,
                thread_id="parent-thread",
                project_id="project-parent-thread",
                uid="user-1",
                agent_id="main",
                status="active",
            ),
            Conversation(
                id=20,
                thread_id="child-thread",
                project_id="project-parent-thread",
                uid="user-1",
                agent_id="worker",
                status="subagent",
            ),
            SubagentThread(
                id=77,
                uid="user-1",
                parent_conversation_id=10,
                child_conversation_id=20,
                child_thread_id=relation_child_thread_id,
                subagent_slug="worker",
                created_by_run_id="parent-run",
            ),
            AgentRun(
                id="parent-run",
                conversation_thread_id="parent-thread",
                runtime_scope_id="parent-thread",
                agent_slug="main",
                uid="user-1",
                status="completed",
                request_id="parent-req",
                conversation_id=10,
                run_type="chat",
                input_payload={},
            ),
            child_run,
        ]
    )
    await db.commit()
    return child_run


async def test_get_subagent_run_with_creator_returns_execution_pair(session):
    child_run = await _seed_subagent_runs(session)

    result = await AgentRunRepository(session).get_subagent_run_with_creator(
        uid="user-1",
        created_by_run_id="parent-run",
        run_id="child-run",
    )

    assert result is not None
    creator_run, persisted_child_run = result
    assert creator_run.id == "parent-run"
    assert persisted_child_run is child_run


async def test_get_subagent_run_with_creator_returns_none_for_relation_mismatch(session):
    await _seed_subagent_runs(session, relation_child_thread_id="other-child-thread")

    result = await AgentRunRepository(session).get_subagent_run_with_creator(
        uid="user-1",
        created_by_run_id="parent-run",
        run_id="child-run",
    )

    assert result is None


async def test_create_run_persists_origin_snapshot(session):
    run = await AgentRunRepository(session).create_run(
        run_id="origin-run",
        conversation_thread_id="thread-1",
        agent_slug="main",
        uid="user-1",
        request_id="origin-request",
        input_payload={"model_spec": "provider:model"},
        source="agent_call",
        channel="api",
        external_id="external-1",
        origin_metadata={"agent_invocation_meta": {"trace_id": "trace-1"}},
    )
    await session.commit()

    assert run.source == "agent_call"
    assert run.channel == "api"
    assert run.external_id == "external-1"
    assert run.origin_metadata == {"agent_invocation_meta": {"trace_id": "trace-1"}}
    assert run.runtime_scope_id == "thread-1"


async def test_create_subagent_run_persists_explicit_root_runtime_scope(session):
    run = await AgentRunRepository(session).create_run(
        run_id="child-run-scope",
        conversation_thread_id="child-thread",
        runtime_scope_id="root-thread",
        agent_slug="worker",
        uid="user-1",
        request_id="child-request-scope",
        input_payload={},
        run_type="subagent",
        created_by_run_id="root-run",
        subagent_thread_relation_id=1,
    )

    assert run.runtime_scope_id == "root-thread"


async def test_storage_migration_converges_every_nonterminal_run_without_runtime_cleanup(session):
    repository = AgentRunRepository(session)
    runs = [
        AgentRun(
            id="migration-pending",
            conversation_thread_id="thread-1",
            runtime_scope_id="thread-1",
            agent_slug="main",
            uid="user-1",
            status="pending",
            request_id="migration-request-pending",
            run_type="chat",
            input_payload={},
        ),
        AgentRun(
            id="migration-running",
            conversation_thread_id="thread-2",
            runtime_scope_id="thread-2",
            agent_slug="main",
            uid="user-1",
            status="running",
            request_id="migration-request-running",
            run_type="chat",
            input_payload={},
            worker_id="old-worker",
            heartbeat_at=utc_now_naive(),
            lease_expires_at=utc_now_naive() + timedelta(minutes=5),
        ),
    ]
    session.add_all(runs)
    await session.flush()

    migrated_ids = await repository.fail_nonterminal_for_storage_migration()

    assert migrated_ids == ["migration-pending", "migration-running"]
    for run in runs:
        assert run.status == "failed"
        assert run.error_type == "storage_migration"
        assert run.worker_id is None
        assert run.lease_expires_at is None
        assert run.runtime_cleanup_pending is False


async def test_set_output_message_rejects_wrong_causal_owner_and_accepts_exact_message(session):
    repository = AgentRunRepository(session)
    conversation = Conversation(
        thread_id="output-thread",
        project_id="project-output-thread",
        uid="user-1",
        agent_id="main",
        status="active",
    )
    other_conversation = Conversation(
        thread_id="other-output-thread",
        project_id="project-other-output-thread",
        uid="user-1",
        agent_id="main",
        status="active",
    )
    session.add_all([conversation, other_conversation])
    await session.flush()
    run = await repository.create_run(
        run_id="output-run",
        conversation_thread_id=conversation.thread_id,
        agent_slug="main",
        uid="user-1",
        request_id="output-request",
        input_payload={},
        conversation_id=conversation.id,
    )
    now = utc_now_naive()
    await repository.mark_running(
        run.id,
        worker_id="output-worker:attempt-1",
        lease_seconds=60,
        now=now,
    )
    candidates = [
        Message(
            conversation_id=other_conversation.id,
            run_id=run.id,
            request_id=run.request_id,
            role="assistant",
            content="other conversation",
        ),
        Message(
            conversation_id=conversation.id,
            run_id="other-run",
            request_id=run.request_id,
            role="assistant",
            content="other run",
        ),
        Message(
            conversation_id=conversation.id,
            run_id=run.id,
            request_id=run.request_id,
            role="user",
            content="wrong role",
        ),
        Message(
            conversation_id=conversation.id,
            run_id=None,
            request_id=run.request_id,
            role="assistant",
            content="missing run",
        ),
        Message(
            conversation_id=conversation.id,
            run_id=run.id,
            request_id="other-request",
            role="assistant",
            content="other request",
        ),
    ]
    session.add_all(candidates)
    await session.flush()

    for candidate in candidates:
        with pytest.raises(ValueError, match="同一 conversation"):
            await repository.set_output_message(
                run.id,
                candidate.id,
                worker_id="output-worker:attempt-1",
                now=now + timedelta(seconds=1),
            )
        assert run.output_message_id is None

    with pytest.raises(ValueError, match="同一 conversation"):
        await repository.set_output_message(
            run.id,
            999_999,
            worker_id="output-worker:attempt-1",
            now=now + timedelta(seconds=1),
        )
    with pytest.raises(ValueError, match="lease owner"):
        await repository.set_output_message(
            run.id,
            candidates[0].id,
            worker_id="output-worker:attempt-2",
            now=now + timedelta(seconds=1),
        )

    exact = await _bind_valid_output(
        session,
        repository,
        run,
        worker_id="output-worker:attempt-1",
        now=now + timedelta(seconds=1),
    )
    rebound = await repository.set_output_message(
        run.id,
        exact.id,
        worker_id="output-worker:attempt-1",
        now=now + timedelta(seconds=2),
    )

    assert rebound is run
    assert run.output_message_id == exact.id


async def test_completed_transition_rejects_missing_output_binding(session):
    repository = AgentRunRepository(session)
    run = await repository.create_run(
        run_id="missing-output-run",
        conversation_thread_id="missing-output-thread",
        agent_slug="main",
        uid="user-1",
        request_id="missing-output-request",
        input_payload={},
    )
    now = utc_now_naive()
    await repository.mark_running(
        run.id,
        worker_id="missing-output-worker:attempt-1",
        lease_seconds=60,
        now=now,
    )

    with pytest.raises(ValueError, match="完成前必须绑定"):
        await repository.set_terminal_status(
            run.id,
            status="completed",
            worker_id="missing-output-worker:attempt-1",
            now=now + timedelta(seconds=1),
        )

    assert run.status == "running"
    assert run.worker_id == "missing-output-worker:attempt-1"


async def _seed_thread_run(db, *, thread_id: str, run_id: str, status: str, run_type: str = "chat"):
    run = AgentRun(
        id=run_id,
        conversation_thread_id=thread_id,
        runtime_scope_id=thread_id,
        agent_slug="main",
        uid="user-1",
        status=status,
        request_id=f"req-{run_id}",
        run_type=run_type,
        created_by_run_id="root-run" if run_type == "subagent" else None,
        subagent_thread_relation_id=1 if run_type == "subagent" else None,
        input_payload={},
    )
    db.add(run)
    await db.flush()
    return run


async def test_get_latest_top_level_runs_for_threads_picks_latest_chat_resume(session):
    await _seed_thread_run(session, thread_id="t1", run_id="t1-old", status="completed")
    await _seed_thread_run(session, thread_id="t1", run_id="t1-running", status="running")
    await _seed_thread_run(session, thread_id="t2", run_id="t2-sub", status="running", run_type="subagent")
    await _seed_thread_run(session, thread_id="t2", run_id="t2-done", status="completed")
    await session.commit()

    result = await AgentRunRepository(session).get_latest_top_level_runs_for_threads("user-1", ["t1", "t2"])

    assert result["t1"] == ("t1-running", "running")
    assert result["t2"] == ("t2-done", "completed")


async def test_get_latest_top_level_runs_for_threads_scopes_by_user(session):
    await _seed_thread_run(session, thread_id="t1", run_id="t1-done", status="completed")
    session.add(
        AgentRun(
            id="t1-other",
            conversation_thread_id="t1",
            runtime_scope_id="t1",
            agent_slug="main",
            uid="user-2",
            status="running",
            request_id="req-other",
            run_type="chat",
            input_payload={},
        )
    )
    await session.commit()

    result = await AgentRunRepository(session).get_latest_top_level_runs_for_threads("user-1", ["t1"])

    assert result["t1"] == ("t1-done", "completed")


async def test_get_latest_top_level_runs_for_threads_empty_input(session):
    result = await AgentRunRepository(session).get_latest_top_level_runs_for_threads("user-1", [])
    assert result == {}


async def test_set_terminal_status_persists_token_usage_only_for_winner(session):
    repo = AgentRunRepository(session)
    run = await repo.create_run(
        run_id="usage-run",
        conversation_thread_id="thread-1",
        agent_slug="main",
        uid="user-1",
        request_id="usage-request",
        input_payload={},
    )
    usage = {
        "schema_version": 2,
        "models": {"provider:model": {}},
        "total": {"input_tokens": 10, "output_tokens": 2, "total_tokens": 12},
    }
    now = utc_now_naive()
    _, acquired = await repo.mark_running(
        run.id,
        worker_id="worker-usage:attempt-1",
        lease_seconds=60,
        now=now,
    )
    await _bind_valid_output(
        session,
        repo,
        run,
        worker_id="worker-usage:attempt-1",
        now=now + timedelta(milliseconds=500),
    )

    persisted, changed = await repo.set_terminal_status(
        run.id,
        status="completed",
        token_usage=usage,
        worker_id="worker-usage:attempt-1",
        now=now + timedelta(seconds=1),
    )
    loser, loser_changed = await repo.set_terminal_status(
        run.id,
        status="failed",
        token_usage={"total": {"input_tokens": 999}},
    )

    assert acquired is True
    assert changed is True
    assert persisted.token_usage == usage
    assert loser_changed is False
    assert loser.token_usage == usage


async def test_owned_run_requires_exact_owner_for_terminal_transition(session):
    repo = AgentRunRepository(session)
    run = await repo.create_run(
        run_id="owned-run",
        conversation_thread_id="owned-thread",
        agent_slug="main",
        uid="user-1",
        request_id="owned-request",
        input_payload={},
    )
    now = utc_now_naive()
    _, acquired = await repo.mark_running(
        run.id,
        worker_id="worker-1:attempt-1",
        lease_seconds=60,
        now=now,
    )
    acquired_lease_expires_at = run.lease_expires_at
    await _bind_valid_output(
        session,
        repo,
        run,
        worker_id="worker-1:attempt-1",
        now=now + timedelta(milliseconds=500),
    )

    _, missing_owner_changed = await repo.set_terminal_status(run.id, status="failed")
    _, other_owner_changed = await repo.set_terminal_status(
        run.id,
        status="failed",
        worker_id="worker-1:attempt-2",
    )
    persisted, owner_changed = await repo.set_terminal_status(
        run.id,
        status="completed",
        worker_id="worker-1:attempt-1",
    )

    assert acquired is True
    assert acquired_lease_expires_at == now + timedelta(seconds=60)
    assert missing_owner_changed is False
    assert other_owner_changed is False
    assert owner_changed is True
    assert persisted.status == "completed"
    assert persisted.worker_id is None
    assert persisted.heartbeat_at is None
    assert persisted.lease_expires_at is None


async def test_attempt_owner_blocks_duplicate_until_retry_release(session):
    repo = AgentRunRepository(session)
    run = await repo.create_run(
        run_id="retry-run",
        conversation_thread_id="retry-thread",
        agent_slug="main",
        uid="user-1",
        request_id="retry-request",
        input_payload={},
    )
    now = utc_now_naive()

    _, first_acquired = await repo.mark_running(
        run.id,
        worker_id="worker-1:attempt-1",
        lease_seconds=60,
        now=now,
    )
    _, duplicate_acquired = await repo.mark_running(
        run.id,
        worker_id="worker-1:attempt-2",
        lease_seconds=60,
        now=now + timedelta(seconds=1),
    )
    released = await repo.release_lease_for_retry(
        run.id,
        worker_id="worker-1:attempt-1",
        now=now + timedelta(seconds=1),
    )
    _, blocked_before_cleanup = await repo.mark_running(
        run.id,
        worker_id="worker-1:attempt-2",
        lease_seconds=60,
        now=now + timedelta(seconds=2),
    )
    run.runtime_cleanup_pending = False
    await session.flush()
    _, retry_acquired = await repo.mark_running(
        run.id,
        worker_id="worker-1:attempt-2",
        lease_seconds=60,
        now=now + timedelta(seconds=3),
    )

    assert first_acquired is True
    assert duplicate_acquired is False
    assert released is True
    assert blocked_before_cleanup is False
    assert retry_acquired is True
    assert run.status == "running"
    assert run.worker_id == "worker-1:attempt-2"


async def test_expired_owner_cannot_finish_or_release_before_reconciliation(session):
    """过期 attempt 不能抢在 reconciler 前伪装成功或触发自动重试。"""
    repo = AgentRunRepository(session)
    run = await repo.create_run(
        run_id="expired-owner-run",
        conversation_thread_id="expired-owner-thread",
        agent_slug="main",
        uid="user-1",
        request_id="expired-owner-request",
        input_payload={},
    )
    now = utc_now_naive()
    _, acquired = await repo.mark_running(
        run.id,
        worker_id="worker-expired:attempt-1",
        lease_seconds=10,
        now=now,
    )

    released = await repo.release_lease_for_retry(
        run.id,
        worker_id="worker-expired:attempt-1",
        now=now + timedelta(seconds=11),
    )
    _, completed = await repo.set_terminal_status(
        run.id,
        status="completed",
        worker_id="worker-expired:attempt-1",
        now=now + timedelta(seconds=11),
    )
    reconciled, cancelled_descendants = await repo.reconcile_expired_leases(now=now + timedelta(seconds=11))

    assert acquired is True
    assert released is False
    assert completed is False
    assert [item.id for item in reconciled] == [run.id]
    assert cancelled_descendants == []
    assert run.status == "failed"
    assert run.error_type == "worker_lease_expired"


async def test_pending_cancel_is_terminal_without_fake_worker_expiry(session):
    """从未执行的 pending Run 由用户取消后直接形成 cancelled 事实。"""
    conversation = Conversation(
        thread_id="cancel-pending-thread",
        project_id="project-cancel-pending-thread",
        uid="user-1",
        agent_id="main",
        status="active",
    )
    session.add(conversation)
    await session.flush()
    message = Message(
        conversation_id=conversation.id,
        role="user",
        content="cancel before worker",
        delivery_status="dispatched",
    )
    session.add(message)
    await session.flush()
    repo = AgentRunRepository(session)
    run = await repo.create_run(
        run_id="cancel-pending-run",
        conversation_thread_id=conversation.thread_id,
        agent_slug="main",
        uid="user-1",
        request_id="cancel-pending-request",
        input_payload={},
        conversation_id=conversation.id,
        input_message_id=message.id,
    )

    cancelled, cancelled_ids = await repo.request_cancel_execution_tree(
        run_id=run.id,
        uid="user-1",
        cascade_descendants=False,
    )
    reconciled, cancelled_descendants = await repo.reconcile_expired_leases(now=utc_now_naive() + timedelta(minutes=5))
    await session.refresh(message)

    assert cancelled is run
    assert cancelled_ids == [run.id]
    assert run.status == "cancelled"
    assert run.error_type == "cancelled"
    assert run.worker_id is None
    assert run.lease_expires_at is None
    assert message.delivery_status == "cancelled"
    assert reconciled == []
    assert cancelled_descendants == []


async def test_durable_cancel_wins_terminal_race_for_live_owner(session):
    """cancel_requested 提交后，同一 owner 也只能确认 cancelled。"""
    repo = AgentRunRepository(session)
    run = await repo.create_run(
        run_id="cancel-race-run",
        conversation_thread_id="cancel-race-thread",
        agent_slug="main",
        uid="user-1",
        request_id="cancel-race-request",
        input_payload={},
    )
    now = utc_now_naive()
    _, acquired = await repo.mark_running(
        run.id,
        worker_id="worker-cancel:attempt-1",
        lease_seconds=60,
        now=now,
    )
    requested, cancelled_ids = await repo.request_cancel_execution_tree(
        run_id=run.id,
        uid="user-1",
        cascade_descendants=False,
    )

    _, completed = await repo.set_terminal_status(
        run.id,
        status="completed",
        worker_id="worker-cancel:attempt-1",
        now=now + timedelta(seconds=1),
    )
    persisted, cancelled = await repo.set_terminal_status(
        run.id,
        status="cancelled",
        error_type="cancelled",
        worker_id="worker-cancel:attempt-1",
        now=now + timedelta(seconds=1),
    )

    assert acquired is True
    assert cancelled_ids == [run.id]
    assert requested is run
    assert completed is False
    assert cancelled is True
    assert persisted.status == "cancelled"


async def test_terminal_root_atomically_cancels_active_execution_tree_descendants(session):
    repo = AgentRunRepository(session)
    now = utc_now_naive()
    parent = await repo.create_run(
        run_id="tree-parent-run",
        conversation_thread_id="tree-runtime",
        runtime_scope_id="tree-runtime",
        agent_slug="main",
        uid="user-1",
        request_id="tree-parent-request",
        input_payload={},
    )
    child = await repo.create_run(
        run_id="tree-child-run",
        conversation_thread_id="tree-child-thread",
        runtime_scope_id="tree-runtime",
        agent_slug="worker",
        uid="user-1",
        request_id="tree-child-request",
        input_payload={},
        created_by_run_id=parent.id,
        subagent_thread_relation_id=1,
        run_type="subagent",
    )
    await repo.mark_running(parent.id, worker_id="parent-worker", lease_seconds=60, now=now)
    await repo.mark_running(child.id, worker_id="child-worker", lease_seconds=60, now=now)

    parent.status = "failed"
    parent.finished_at = now
    cancelled = await repo.cancel_active_execution_tree_descendants(parent)

    assert cancelled == [(child.id, child.conversation_thread_id)]
    assert child.status == "cancel_requested"
    assert child.error_type == "execution_tree_closed"
    assert child.worker_id == "child-worker"
    assert child.heartbeat_at is not None
    assert child.lease_expires_at is not None


async def _seed_running_run(db, *, run_id: str = "attempt-run", request_id: str = "attempt-request") -> AgentRun:
    run = await AgentRunRepository(db).create_run(
        run_id=run_id,
        conversation_thread_id="attempt-thread",
        agent_slug="main",
        uid="user-1",
        request_id=request_id,
        input_payload={},
    )
    await db.flush()
    return run


async def test_mark_running_creates_single_attempt_for_initial_claim_and_live_owner(session):
    repository = AgentRunRepository(session)
    run = await _seed_running_run(session)
    now = utc_now_naive()

    _, first_acquired = await repository.mark_running(run.id, worker_id="worker-a:token-1", lease_seconds=60, now=now)
    _, second_acquired = await repository.mark_running(
        run.id, worker_id="worker-a:token-1", lease_seconds=60, now=now + timedelta(seconds=1)
    )
    attempts = await repository.list_run_attempts(run.id)

    assert first_acquired is True
    assert second_acquired is True
    assert [attempt.attempt_no for attempt in attempts] == [1]
    assert attempts[0].worker_id == "worker-a:token-1"
    assert attempts[0].finished_at is None


async def test_retry_release_then_reclaim_uses_new_attempt_no_and_keeps_old_fact(session):
    repository = AgentRunRepository(session)
    run = await _seed_running_run(session)
    now = utc_now_naive()

    await repository.mark_running(run.id, worker_id="worker-a:token-1", lease_seconds=60, now=now)
    released = await repository.release_lease_for_retry(
        run.id, worker_id="worker-a:token-1", now=now + timedelta(seconds=1)
    )
    _, blocked_before_cleanup = await repository.mark_running(
        run.id, worker_id="worker-b:token-2", lease_seconds=60, now=now + timedelta(seconds=2)
    )
    run.runtime_cleanup_pending = False
    await session.flush()
    await repository.mark_running(
        run.id, worker_id="worker-b:token-2", lease_seconds=60, now=now + timedelta(seconds=3)
    )
    attempts = await repository.list_run_attempts(run.id)

    assert released is True
    assert blocked_before_cleanup is False
    assert [attempt.attempt_no for attempt in attempts] == [1, 2]
    assert attempts[0].outcome == "retry_released"
    assert attempts[0].finished_at is not None
    assert attempts[1].worker_id == "worker-b:token-2"
    assert attempts[1].outcome is None


async def test_terminal_status_finishes_owner_attempt_with_matching_outcome(session):
    repository = AgentRunRepository(session)
    run = await _seed_running_run(session, run_id="terminal-attempt-run", request_id="terminal-attempt-request")
    now = utc_now_naive()

    await repository.mark_running(run.id, worker_id="worker-a:token-1", lease_seconds=60, now=now)
    await _bind_valid_output(
        session,
        repository,
        run,
        worker_id="worker-a:token-1",
        now=now + timedelta(seconds=1),
    )
    _, changed = await repository.set_terminal_status(
        run.id, status="completed", worker_id="worker-a:token-1", now=now + timedelta(seconds=2)
    )
    attempts = await repository.list_run_attempts(run.id)

    assert changed is True
    assert len(attempts) == 1
    assert attempts[0].outcome == "completed"
    assert attempts[0].finished_at is not None


async def test_reconcile_closes_open_attempt_as_lease_expired(session):
    repository = AgentRunRepository(session)
    run = await _seed_running_run(session, run_id="reconcile-run", request_id="reconcile-request")
    now = utc_now_naive()

    await repository.mark_running(run.id, worker_id="worker-dead:token-1", lease_seconds=10, now=now)
    reconciled, cancelled_descendants = await repository.reconcile_expired_leases(now=now + timedelta(seconds=11))
    attempts = await repository.list_run_attempts(run.id)

    assert [item.id for item in reconciled] == [run.id]
    assert cancelled_descendants == []
    assert len(attempts) == 1
    assert attempts[0].outcome == "lease_expired"
    assert attempts[0].error_type == "worker_lease_expired"


async def test_record_run_manifest_is_write_once_and_requires_live_owner(session):
    repository = AgentRunRepository(session)
    run = await _seed_running_run(session, run_id="manifest-run", request_id="manifest-request")
    now = utc_now_naive()

    await repository.mark_running(run.id, worker_id="worker-a:token-1", lease_seconds=60, now=now)

    with pytest.raises(ValueError, match="lease owner"):
        await repository.record_run_manifest(
            run.id,
            manifest={"version": 1},
            fingerprint="a" * 64,
            worker_id="worker-b:token-2",
            now=now + timedelta(seconds=1),
        )

    _, recorded = await repository.record_run_manifest(
        run.id,
        manifest={"version": 1, "agent": {"slug": "main"}},
        fingerprint="b" * 64,
        worker_id="worker-a:token-1",
        now=now + timedelta(seconds=2),
    )
    _, rewritten = await repository.record_run_manifest(
        run.id,
        manifest={"version": 1, "agent": {"slug": "changed"}},
        fingerprint="c" * 64,
        worker_id="worker-a:token-1",
        now=now + timedelta(seconds=3),
    )
    attempts = await repository.list_run_attempts(run.id)

    assert recorded is True
    assert rewritten is False
    assert run.manifest == {"version": 1, "agent": {"slug": "main"}}
    assert run.manifest_fingerprint == "b" * 64
    assert run.manifest_recorded_at == now + timedelta(seconds=2)
    # manifest 固化不得额外制造执行占有事实。
    assert len(attempts) == 1

    with pytest.raises(ValueError, match="lease owner"):
        await repository.record_run_manifest(
            run.id,
            manifest={"version": 1},
            fingerprint="d" * 64,
            worker_id="worker-a:token-1",
            now=now + timedelta(seconds=61),
        )


async def test_lock_memory_write_requires_current_top_level_lease_owner(session):
    repository = AgentRunRepository(session)
    run = await _seed_running_run(session, run_id="memory-run", request_id="memory-request")
    now = utc_now_naive()
    await repository.mark_running(run.id, worker_id="worker-a:token-1", lease_seconds=60, now=now)

    locked = await repository.lock_memory_write(
        run.id,
        uid="user-1",
        worker_id="worker-a:token-1",
        conversation_thread_id="attempt-thread",
        request_id="memory-request",
        now=now + timedelta(seconds=1),
    )

    assert locked is run
    with pytest.raises(ValueError, match="lease owner"):
        await repository.lock_memory_write(
            run.id,
            uid="user-1",
            worker_id="worker-b:token-2",
            conversation_thread_id="attempt-thread",
            request_id="memory-request",
            now=now + timedelta(seconds=2),
        )
    with pytest.raises(ValueError, match="同一顶层 Run"):
        await repository.lock_memory_write(
            run.id,
            uid="other-user",
            worker_id="worker-a:token-1",
            conversation_thread_id="attempt-thread",
            request_id="memory-request",
            now=now + timedelta(seconds=2),
        )
