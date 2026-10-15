"""真实 PostgreSQL 上的 AgentRun lease ownership 与过期收敛测试。"""

from __future__ import annotations

import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from langchain.messages import AIMessage
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.repositories.agent_run_repository import AgentRunRepository
from ars.repositories.conversation_repository import ConversationRepository
from ars.services import chat_service, run_worker
from ars.storage.postgres.manager import AGENT_RUN_LEASE_SCHEMA_STATEMENTS, RUNTIME_SCOPE_SCHEMA_STATEMENTS
from ars.storage.postgres.models_business import AgentRun, Conversation, Message, Project, SubagentThread, User
from ars.utils.datetime_utils import utc_now_naive

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


@pytest_asyncio.fixture()
async def lease_database():
    engine = create_async_engine(os.environ["POSTGRES_URL"], pool_pre_ping=True)
    async with engine.begin() as connection:
        for _ in range(2):
            for statement in AGENT_RUN_LEASE_SCHEMA_STATEMENTS:
                await connection.execute(text(statement))
        await connection.execute(text(RUNTIME_SCOPE_SCHEMA_STATEMENTS[-1]))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield engine, session_factory
    finally:
        await engine.dispose()


@asynccontextmanager
async def _session_context(session_factory):
    async with session_factory() as db:
        try:
            yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise


async def _create_run(
    session_factory,
    *,
    status: str = "pending",
    worker_id: str | None = None,
    lease_expires_at=None,
) -> tuple[str, str, int]:
    run_id = str(uuid.uuid4())
    request_id = f"lease-{uuid.uuid4()}"
    thread_id = f"pytest-lease-{uuid.uuid4()}"
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
            content="lease input",
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
                input_payload={},
                status=status,
                run_type="chat",
                worker_id=worker_id,
                heartbeat_at=utc_now_naive() if worker_id else None,
                lease_expires_at=lease_expires_at,
            )
        )
        await db.commit()
        return run_id, thread_id, message.id


async def test_root_terminal_atomically_cancels_live_child_and_clears_lease(
    lease_database,
    monkeypatch: pytest.MonkeyPatch,
):
    """根 Run 终态提交不得留下仍占用共享 runtime 的子 Run。"""

    _, session_factory = lease_database
    now = utc_now_naive()
    parent_owner = "worker-tree-parent"
    child_owner = "worker-tree-child"
    parent_id, parent_thread_id, _ = await _create_run(session_factory)
    child_thread_id = f"pytest-tree-child-{uuid.uuid4()}"

    try:
        async with session_factory() as db:
            parent = await db.get(AgentRun, parent_id)
            parent_conversation = await db.get(Conversation, parent.conversation_id)
            assert parent_conversation is not None
            child_conversation = Conversation(
                thread_id=child_thread_id,
                uid=parent.uid,
                project_id=parent_conversation.project_id,
                agent_id="worker",
                status="subagent",
            )
            db.add(child_conversation)
            await db.flush()
            child_message = Message(
                conversation_id=child_conversation.id,
                role="user",
                content="long-running child",
                request_id=f"tree-child-{uuid.uuid4()}",
                delivery_status="dispatched",
            )
            db.add(child_message)
            await db.flush()
            relation = SubagentThread(
                uid=parent.uid,
                parent_conversation_id=parent_conversation.id,
                child_conversation_id=child_conversation.id,
                child_thread_id=child_thread_id,
                subagent_slug="worker",
                created_by_run_id=parent.id,
            )
            db.add(relation)
            await db.flush()
            child = AgentRun(
                id=str(uuid.uuid4()),
                conversation_thread_id=child_thread_id,
                runtime_scope_id=parent_thread_id,
                agent_slug="worker",
                uid=parent.uid,
                request_id=child_message.request_id,
                conversation_id=child_conversation.id,
                created_by_run_id=parent.id,
                subagent_thread_relation_id=relation.id,
                run_type="subagent",
                input_message_id=child_message.id,
                input_payload={},
                status="pending",
            )
            db.add(child)
            await db.flush()
            repo = AgentRunRepository(db)
            _, parent_acquired = await repo.mark_running(
                parent.id,
                worker_id=parent_owner,
                lease_seconds=60,
                now=now,
            )
            _, child_acquired = await repo.mark_running(
                child.id,
                worker_id=child_owner,
                lease_seconds=60,
                now=now,
            )
            child_id = child.id
            child_message_id = child_message.id
            await db.commit()

        monkeypatch.setattr(
            run_worker.pg_manager, "get_async_session_context", lambda: _session_context(session_factory)
        )
        publish_cancel = AsyncMock()
        monkeypatch.setattr(run_worker, "publish_cancel_signal", publish_cancel)

        transition = await run_worker.mark_run_terminal(
            parent_id,
            "failed",
            error_type="parent_failed",
            worker_id=parent_owner,
        )

        async with session_factory() as db:
            parent = await db.get(AgentRun, parent_id)
            child = await db.get(AgentRun, child_id)
            child_message = await db.get(Message, child_message_id)

        assert parent_acquired is True
        assert child_acquired is True
        assert transition.changed is True
        assert parent.status == "failed"
        assert child.status == "cancel_requested"
        assert child.error_type == "execution_tree_closed"
        assert child.worker_id == child_owner
        assert child.lease_expires_at is not None
        assert child_message.delivery_status == "dispatched"
        publish_cancel.assert_awaited_once_with(child_id)
    finally:
        await _cleanup_runs(session_factory, [parent_thread_id, child_thread_id])


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
        await db.execute(delete(SubagentThread).where(SubagentThread.child_thread_id.in_(thread_ids)))
        await db.execute(delete(Conversation).where(Conversation.thread_id.in_(thread_ids)))
        await db.execute(delete(Project).where(Project.id.in_({row.project_id for row in rows})))
        await db.execute(delete(User).where(User.uid.in_({row.uid for row in rows})))
        await db.commit()


async def _create_live_child(
    session_factory,
    *,
    parent_id: str,
    runtime_scope_id: str,
    owner: str,
    now,
    lease_seconds: float,
) -> tuple[str, str, int]:
    child_thread_id = f"pytest-tree-child-{uuid.uuid4()}"
    async with session_factory() as db:
        parent = await db.get(AgentRun, parent_id)
        parent_conversation = await db.get(Conversation, parent.conversation_id)
        assert parent_conversation is not None
        child_conversation = Conversation(
            thread_id=child_thread_id,
            uid=parent.uid,
            project_id=parent_conversation.project_id,
            agent_id="worker",
            status="subagent",
        )
        db.add(child_conversation)
        await db.flush()
        child_message = Message(
            conversation_id=child_conversation.id,
            role="user",
            content="long-running child",
            request_id=f"tree-child-{uuid.uuid4()}",
            delivery_status="dispatched",
        )
        db.add(child_message)
        await db.flush()
        relation = SubagentThread(
            uid=parent.uid,
            parent_conversation_id=parent.conversation_id,
            child_conversation_id=child_conversation.id,
            child_thread_id=child_thread_id,
            subagent_slug="worker",
            created_by_run_id=parent.id,
        )
        db.add(relation)
        await db.flush()
        child = AgentRun(
            id=str(uuid.uuid4()),
            conversation_thread_id=child_thread_id,
            runtime_scope_id=runtime_scope_id,
            agent_slug="worker",
            uid=parent.uid,
            request_id=child_message.request_id,
            conversation_id=child_conversation.id,
            created_by_run_id=parent.id,
            subagent_thread_relation_id=relation.id,
            run_type="subagent",
            input_message_id=child_message.id,
            input_payload={},
            status="pending",
        )
        db.add(child)
        await db.flush()
        _, acquired = await AgentRunRepository(db).mark_running(
            child.id,
            worker_id=owner,
            lease_seconds=lease_seconds,
            now=now,
        )
        assert acquired is True
        child_id = child.id
        child_message_id = child_message.id
        await db.commit()
    return child_id, child_thread_id, child_message_id


async def test_expired_root_reconciliation_cancels_live_child_before_runtime_release(
    lease_database,
    monkeypatch: pytest.MonkeyPatch,
):
    """失联根 Run 必须先持久收敛执行树，再释放共享 runtime。"""

    _, session_factory = lease_database
    now = utc_now_naive()
    parent_id, parent_thread_id, _ = await _create_run(session_factory)
    child_thread_id = ""
    try:
        async with session_factory() as db:
            _, acquired = await AgentRunRepository(db).mark_running(
                parent_id,
                worker_id="worker-expired-tree-parent",
                lease_seconds=10,
                now=now,
            )
            await db.commit()
        assert acquired is True
        child_id, child_thread_id, child_message_id = await _create_live_child(
            session_factory,
            parent_id=parent_id,
            runtime_scope_id=parent_thread_id,
            owner="worker-live-tree-child",
            now=now,
            lease_seconds=120,
        )

        monkeypatch.setattr(
            run_worker.pg_manager, "get_async_session_context", lambda: _session_context(session_factory)
        )
        publish_cancel = AsyncMock()
        release_runtime = AsyncMock(return_value=False)
        monkeypatch.setattr(run_worker, "publish_cancel_signal", publish_cancel)
        monkeypatch.setattr(run_worker, "_release_runtime_if_idle", release_runtime)

        reconciled_ids = await run_worker.reconcile_expired_run_leases(now=now + timedelta(seconds=11))

        async with session_factory() as db:
            parent = await db.get(AgentRun, parent_id)
            child = await db.get(AgentRun, child_id)
            child_message = await db.get(Message, child_message_id)

        assert reconciled_ids == [parent_id]
        assert parent.status == "failed"
        assert child.status == "cancel_requested"
        assert child.worker_id == "worker-live-tree-child"
        assert child.lease_expires_at is not None
        assert child_message.delivery_status == "dispatched"
        publish_cancel.assert_awaited_once_with(child_id)
        release_runtime.assert_awaited_once()
        assert release_runtime.await_args.args[0].id == parent_id
    finally:
        await _cleanup_runs(session_factory, [parent_thread_id, child_thread_id])


async def test_agent_run_lease_schema_evolution_is_idempotent(lease_database):
    engine, _ = lease_database
    async with engine.connect() as connection:
        columns = set(
            (
                await connection.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_name = 'agent_runs' "
                        "AND column_name IN ('worker_id', 'heartbeat_at', 'lease_expires_at')"
                    )
                )
            ).scalars()
        )
        index_exists = await connection.scalar(
            text(
                "SELECT EXISTS (SELECT 1 FROM pg_indexes "
                "WHERE tablename = 'agent_runs' AND indexname = 'ix_agent_runs_status_lease_expires')"
            )
        )

    assert columns == {"worker_id", "heartbeat_at", "lease_expires_at"}
    assert index_exists is True


async def test_heartbeat_and_terminal_transition_require_exact_attempt_owner(
    lease_database,
    monkeypatch: pytest.MonkeyPatch,
):
    _, session_factory = lease_database
    now = utc_now_naive()
    owner = "worker-stable:attempt-owner"
    other_owner = "worker-stable:attempt-other"
    run_id, thread_id, message_id = await _create_run(session_factory)
    monkeypatch.setattr(run_worker.pg_manager, "get_async_session_context", lambda: _session_context(session_factory))

    try:
        async with session_factory() as db:
            run, acquired = await AgentRunRepository(db).mark_running(
                run_id,
                worker_id=owner,
                lease_seconds=60,
                now=now,
            )
            await db.commit()
        assert acquired is True
        assert run.worker_id == owner

        async with session_factory() as db:
            other_renewed = await AgentRunRepository(db).renew_lease(
                run_id,
                worker_id=other_owner,
                lease_seconds=60,
                now=now + timedelta(seconds=10),
            )
            await db.commit()
        async with session_factory() as db:
            owner_renewed = await AgentRunRepository(db).renew_lease(
                run_id,
                worker_id=owner,
                lease_seconds=60,
                now=now + timedelta(seconds=10),
            )
            await db.commit()

        async with session_factory() as db:
            persisted_before_completion = await db.get(AgentRun, run_id)
            wrong_output = Message(
                conversation_id=persisted_before_completion.conversation_id,
                run_id=run_id,
                request_id=f"wrong-{persisted_before_completion.request_id}",
                role="assistant",
                content="wrong request output",
            )
            exact_output = Message(
                conversation_id=persisted_before_completion.conversation_id,
                run_id=run_id,
                request_id=persisted_before_completion.request_id,
                role="assistant",
                content="exact run output",
            )
            db.add_all([wrong_output, exact_output])
            await db.flush()
            repository = AgentRunRepository(db)
            with pytest.raises(ValueError, match="同一 conversation"):
                await repository.set_output_message(
                    run_id,
                    wrong_output.id,
                    worker_id=owner,
                    now=now + timedelta(seconds=11),
                )
            assert persisted_before_completion.output_message_id is None
            await repository.set_output_message(
                run_id,
                exact_output.id,
                worker_id=owner,
                now=now + timedelta(seconds=11),
            )
            exact_output_id = exact_output.id
            await db.commit()

        missing_owner = await run_worker.mark_run_terminal(run_id, "failed")
        other_owner_result = await run_worker.mark_run_terminal(run_id, "failed", worker_id=other_owner)
        owner_result = await run_worker.mark_run_terminal(run_id, "completed", worker_id=owner)

        async with session_factory() as db:
            persisted_run = await db.get(AgentRun, run_id)
            persisted_message = await db.get(Message, message_id)

        assert other_renewed is False
        assert owner_renewed is True
        assert missing_owner.changed is False
        assert other_owner_result.changed is False
        assert owner_result.changed is True
        assert persisted_run.status == "completed"
        assert persisted_run.output_message_id == exact_output_id
        assert persisted_run.worker_id is None
        assert persisted_run.heartbeat_at is None
        assert persisted_run.lease_expires_at is None
        assert persisted_message.delivery_status == "complete"
    finally:
        await _cleanup_runs(session_factory, [thread_id])


@pytest.mark.parametrize(
    ("run_status", "lease_offset"),
    [("running", -1), ("cancel_requested", 60)],
)
async def test_invalid_attempt_cannot_leave_assistant_message(
    lease_database,
    run_status: str,
    lease_offset: int,
):
    """过期或已取消 attempt 必须在任何 assistant Message 写入前被拒绝。"""

    _, session_factory = lease_database
    now = utc_now_naive()
    owner = f"worker-invalid:{run_status}"
    run_id, thread_id, _ = await _create_run(
        session_factory,
        status=run_status,
        worker_id=owner,
        lease_expires_at=now + timedelta(seconds=lease_offset),
    )

    class FakeGraph:
        async def aget_state(self, _config):
            return SimpleNamespace(values={"messages": [AIMessage(id=f"output-{run_id}", content="must rollback")]})

    class FakeAgent:
        async def get_graph(self, *, context):
            assert context is fake_context
            return FakeGraph()

    fake_context = object()
    try:
        async with session_factory() as db:
            run = await db.get(AgentRun, run_id)
            with pytest.raises(ValueError, match="有效 AgentRun lease owner"):
                await chat_service.save_messages_from_langgraph_state(
                    agent_instance=FakeAgent(),
                    thread_id=thread_id,
                    conv_repo=ConversationRepository(db),
                    config_dict={"configurable": {"thread_id": thread_id, "uid": run.uid}},
                    context=fake_context,
                    run_id=run_id,
                    request_id=run.request_id,
                    worker_id=owner,
                    complete_run=True,
                )

        async with session_factory() as db:
            persisted_run = await db.get(AgentRun, run_id)
            assistant_messages = list(
                (await db.scalars(select(Message).where(Message.run_id == run_id, Message.role == "assistant"))).all()
            )

        assert persisted_run.output_message_id is None
        assert persisted_run.status == run_status
        assert assistant_messages == []
    finally:
        await _cleanup_runs(session_factory, [thread_id])


async def test_interrupt_message_and_run_terminal_commit_together(lease_database):
    """真实事务中断点必须同时推进 Message 与 Run 终态。"""
    _, session_factory = lease_database
    owner = "worker-interrupt:attempt-owner"
    run_id, thread_id, _ = await _create_run(session_factory)

    class FakeGraph:
        async def aget_state(self, _config):
            return SimpleNamespace(values={"messages": [AIMessage(id=f"output-{run_id}", content="waiting")]})

    class FakeAgent:
        async def get_graph(self, *, context):
            return FakeGraph()

    try:
        async with session_factory() as db:
            run, acquired = await AgentRunRepository(db).mark_running(
                run_id,
                worker_id=owner,
                lease_seconds=60,
            )
            await db.commit()
            request_id = run.request_id
            uid = run.uid
        assert acquired is True

        async with session_factory() as db:
            committed = await chat_service.save_messages_from_langgraph_state(
                agent_instance=FakeAgent(),
                thread_id=thread_id,
                conv_repo=ConversationRepository(db),
                config_dict={"configurable": {"thread_id": thread_id, "uid": uid}},
                context=object(),
                run_id=run_id,
                request_id=request_id,
                worker_id=owner,
                interrupt_run=True,
                interrupt_error_type="ask_user_question_required",
                interrupt_error_message="请选择",
            )
        assert committed is True

        async with session_factory() as db:
            run = await db.get(AgentRun, run_id)
            output_message = await db.get(Message, run.output_message_id)

        assert run.status == "interrupted"
        assert run.error_type == "ask_user_question_required"
        assert output_message.content == "waiting"
    finally:
        await _cleanup_runs(session_factory, [thread_id])


async def test_expired_owner_cannot_finish_or_publish_retry_before_reconciliation(lease_database):
    """真实行锁下，过期 attempt 不能抢在 reconciler 前改写结局。"""
    _, session_factory = lease_database
    now = utc_now_naive()
    owner = "worker-expired:attempt-owner"
    run_id, thread_id, message_id = await _create_run(session_factory)

    try:
        async with session_factory() as db:
            _, acquired = await AgentRunRepository(db).mark_running(
                run_id,
                worker_id=owner,
                lease_seconds=10,
                now=now,
            )
            await db.commit()

        async with session_factory() as db:
            released = await AgentRunRepository(db).release_lease_for_retry(
                run_id,
                worker_id=owner,
                now=now + timedelta(seconds=11),
            )
            await db.commit()
        async with session_factory() as db:
            _, completed = await AgentRunRepository(db).set_terminal_status(
                run_id,
                status="completed",
                worker_id=owner,
                now=now + timedelta(seconds=11),
            )
            await db.commit()
        async with session_factory() as db:
            reconciled, cancelled_descendants = await AgentRunRepository(db).reconcile_expired_leases(
                now=now + timedelta(seconds=11)
            )
            await db.commit()

        async with session_factory() as db:
            persisted_run = await db.get(AgentRun, run_id)
            persisted_message = await db.get(Message, message_id)

        assert acquired is True
        assert released is False
        assert completed is False
        assert [run.id for run in reconciled] == [run_id]
        assert cancelled_descendants == []
        assert persisted_run.status == "failed"
        assert persisted_run.error_type == "worker_lease_expired"
        assert persisted_message.delivery_status == "failed"
    finally:
        await _cleanup_runs(session_factory, [thread_id])


async def test_pending_cancel_is_terminal_and_durable_cancel_wins_completion_race(lease_database):
    """未执行取消直接完成；已执行取消在终态行锁竞争中优先于 completed。"""
    _, session_factory = lease_database
    now = utc_now_naive()
    pending_run_id, pending_thread_id, pending_message_id = await _create_run(session_factory)
    running_run_id, running_thread_id, running_message_id = await _create_run(session_factory)
    owner = "worker-cancel:attempt-owner"

    try:
        async with session_factory() as db:
            pending_uid = (await db.get(AgentRun, pending_run_id)).uid
            pending, pending_cancelled_ids = await AgentRunRepository(db).request_cancel_execution_tree(
                run_id=pending_run_id,
                uid=pending_uid,
                cascade_descendants=False,
            )
            await db.commit()
        async with session_factory() as db:
            pending_reconciled, cancelled_descendants = await AgentRunRepository(db).reconcile_expired_leases(
                now=now + timedelta(minutes=5)
            )
            await db.commit()

        async with session_factory() as db:
            _, acquired = await AgentRunRepository(db).mark_running(
                running_run_id,
                worker_id=owner,
                lease_seconds=60,
                now=now,
            )
            await db.commit()
        async with session_factory() as db:
            running_uid = (await db.get(AgentRun, running_run_id)).uid
            requested, running_cancelled_ids = await AgentRunRepository(db).request_cancel_execution_tree(
                run_id=running_run_id,
                uid=running_uid,
                cascade_descendants=False,
            )
            await db.commit()
        async with session_factory() as db:
            _, completed = await AgentRunRepository(db).set_terminal_status(
                running_run_id,
                status="completed",
                worker_id=owner,
                now=now + timedelta(seconds=1),
            )
            await db.commit()
        async with session_factory() as db:
            _, cancelled = await AgentRunRepository(db).set_terminal_status(
                running_run_id,
                status="cancelled",
                error_type="cancelled",
                worker_id=owner,
                now=now + timedelta(seconds=1),
            )
            await db.commit()

        async with session_factory() as db:
            pending_persisted = await db.get(AgentRun, pending_run_id)
            pending_message = await db.get(Message, pending_message_id)
            running_persisted = await db.get(AgentRun, running_run_id)
            running_message = await db.get(Message, running_message_id)

        assert pending.status == "cancelled"
        assert pending_cancelled_ids == [pending_run_id]
        assert pending_reconciled == []
        assert cancelled_descendants == []
        assert pending_persisted.status == "cancelled"
        assert pending_message.delivery_status == "cancelled"
        assert acquired is True
        assert requested.status == "cancel_requested"
        assert running_cancelled_ids == [running_run_id]
        assert completed is False
        assert cancelled is True
        assert running_persisted.status == "cancelled"
        assert running_message.delivery_status == "cancelled"
    finally:
        await _cleanup_runs(session_factory, [pending_thread_id, running_thread_id])


async def test_concurrent_reconciliation_fails_each_expired_lease_once_and_projects_message_failure(
    lease_database,
    monkeypatch: pytest.MonkeyPatch,
):
    _, session_factory = lease_database
    now = utc_now_naive()
    live = await _create_run(
        session_factory,
        status="running",
        worker_id="worker-live:attempt",
        lease_expires_at=now + timedelta(minutes=5),
    )
    expired_running = await _create_run(
        session_factory,
        status="running",
        worker_id="worker-dead:running",
        lease_expires_at=now - timedelta(seconds=1),
    )
    expired_cancel = await _create_run(
        session_factory,
        status="cancel_requested",
        worker_id="worker-dead:cancel",
        lease_expires_at=now - timedelta(seconds=1),
    )
    all_runs = [live, expired_running, expired_cancel]
    monkeypatch.setattr(run_worker.pg_manager, "get_async_session_context", lambda: _session_context(session_factory))

    try:
        results = await asyncio.gather(
            run_worker.reconcile_expired_run_leases(now=now),
            run_worker.reconcile_expired_run_leases(now=now),
        )
        repeated = await run_worker.reconcile_expired_run_leases(now=now)
        reconciled_ids = [run_id for result in results for run_id in result]

        async with session_factory() as db:
            persisted_runs = {
                run.id: run
                for run in (
                    await db.scalars(select(AgentRun).where(AgentRun.id.in_([item[0] for item in all_runs])))
                ).all()
            }
            persisted_messages = {
                message.id: message
                for message in (
                    await db.scalars(select(Message).where(Message.id.in_([item[2] for item in all_runs])))
                ).all()
            }

        assert sorted(reconciled_ids) == sorted([expired_running[0], expired_cancel[0]])
        assert repeated == []
        assert persisted_runs[live[0]].status == "running"
        assert persisted_runs[live[0]].worker_id == "worker-live:attempt"
        for run_id, _, message_id in (expired_running, expired_cancel):
            run = persisted_runs[run_id]
            assert run.status == "failed"
            assert run.error_type == "worker_lease_expired"
            assert "at-least-once" in run.error_message
            assert run.worker_id is None
            assert run.heartbeat_at is None
            assert run.lease_expires_at is None
            assert persisted_messages[message_id].delivery_status == "failed"
    finally:
        await _cleanup_runs(session_factory, [item[1] for item in all_runs])


async def test_nonterminal_run_shape_constraint_preserves_terminal_legacy_rows(lease_database):
    """数据库允许历史终态形状，但拒绝新的非法非终态写入。"""
    _, session_factory = lease_database
    suffix = uuid.uuid4().hex
    legacy_id = f"shape-legacy-{suffix}"
    async with session_factory() as db:
        legacy = AgentRun(
            id=legacy_id,
            conversation_thread_id=f"legacy-thread-{suffix}",
            runtime_scope_id=f"foreign-scope-{suffix}",
            agent_slug="main",
            uid=f"shape-user-{suffix}",
            status="completed",
            request_id=f"shape-legacy-request-{suffix}",
            run_type="subagent",
            input_payload={},
        )
        db.add(legacy)
        await db.commit()

        db.add(
            AgentRun(
                id=f"shape-invalid-{suffix}",
                conversation_thread_id=f"invalid-thread-{suffix}",
                runtime_scope_id=f"foreign-scope-{suffix}",
                agent_slug="main",
                uid=f"shape-user-{suffix}",
                status="pending",
                request_id=f"shape-invalid-request-{suffix}",
                run_type="chat",
                input_payload={},
            )
        )
        with pytest.raises(IntegrityError):
            await db.flush()
        await db.rollback()

        persisted = await db.get(AgentRun, legacy_id)
        assert persisted is not None
        await db.delete(persisted)
        await db.commit()


async def test_cancel_execution_tree_locks_root_before_descendants(lease_database):
    """取消执行树等待 root 时不能提前持有 child 行锁。"""
    _, session_factory = lease_database
    suffix = uuid.uuid4().hex
    application_name = f"ars-lock-order-{suffix}"
    now = utc_now_naive()
    root_id, root_thread, _ = await _create_run(session_factory)
    async with session_factory() as db:
        uid = (await db.get(AgentRun, root_id)).uid
    child_id, child_thread, _ = await _create_live_child(
        session_factory,
        parent_id=root_id,
        runtime_scope_id=root_thread,
        owner="worker-lock-child",
        now=now,
        lease_seconds=60,
    )

    cancel_started = asyncio.Event()

    async def cancel_tree():
        async with session_factory() as db:
            await db.execute(
                text("SELECT set_config('application_name', :name, true)"),
                {"name": application_name},
            )
            cancel_started.set()
            _run, cancelled_ids = await AgentRunRepository(db).request_cancel_execution_tree(
                run_id=root_id,
                uid=uid,
                cascade_descendants=True,
            )
            await db.commit()
            return cancelled_ids

    cancel_task = None
    try:
        async with session_factory() as root_locker:
            await root_locker.execute(select(AgentRun).where(AgentRun.id == root_id).with_for_update())
            cancel_task = asyncio.create_task(cancel_tree())
            await asyncio.wait_for(cancel_started.wait(), timeout=2)

            async with session_factory() as observer:
                for _ in range(100):
                    wait_event = await observer.scalar(
                        text("SELECT wait_event_type FROM pg_stat_activity WHERE application_name = :name"),
                        {"name": application_name},
                    )
                    if wait_event == "Lock":
                        break
                    await asyncio.sleep(0.02)
                else:
                    pytest.fail("取消事务没有在 root 行锁上等待")

            async with session_factory() as child_probe:
                assert await child_probe.scalar(
                    select(AgentRun).where(AgentRun.id == child_id).with_for_update(nowait=True)
                )
                await child_probe.rollback()
            await root_locker.rollback()

        assert await asyncio.wait_for(cancel_task, timeout=5) == [root_id, child_id]
        async with session_factory() as db:
            statuses = dict(
                (
                    await db.execute(select(AgentRun.id, AgentRun.status).where(AgentRun.id.in_([root_id, child_id])))
                ).all()
            )
        assert statuses == {root_id: "cancelled", child_id: "cancel_requested"}
    finally:
        if cancel_task is not None and not cancel_task.done():
            cancel_task.cancel()
            await asyncio.gather(cancel_task, return_exceptions=True)
        await _cleanup_runs(session_factory, [root_thread, child_thread])
