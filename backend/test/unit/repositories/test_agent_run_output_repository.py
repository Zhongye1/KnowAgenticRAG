from __future__ import annotations

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.repositories.agent_run_output_repository import AgentRunOutputRepository
from ars.storage.postgres.models_business import AgentRun, Base, Conversation, Message

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]


@pytest_asyncio.fixture()
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        yield db
    await engine.dispose()


async def _seed_messages(session):
    conversation = Conversation(
        thread_id="thread-1",
        project_id="project-thread-1",
        uid="user-1",
        agent_id="main",
        status="active",
    )
    run = AgentRun(
        id="run-1",
        conversation_thread_id="thread-1",
        runtime_scope_id="thread-1",
        agent_slug="main",
        uid="user-1",
        status="completed",
        request_id="request-1",
        run_type="chat",
        input_payload={},
    )
    other_run = AgentRun(
        id="run-2",
        conversation_thread_id="thread-1",
        runtime_scope_id="thread-1",
        agent_slug="main",
        uid="user-1",
        status="completed",
        request_id="request-2",
        run_type="chat",
        input_payload={},
    )
    session.add_all([conversation, run, other_run])
    await session.flush()

    created_at = datetime(2026, 8, 15, 12, 0, 0)
    first = Message(
        conversation_id=conversation.id,
        run_id=run.id,
        role="assistant",
        content="run-1 first",
        created_at=created_at,
    )
    last = Message(
        conversation_id=conversation.id,
        run_id=run.id,
        role="assistant",
        content="run-1 last",
        created_at=created_at + timedelta(seconds=1),
    )
    adjacent = Message(
        conversation_id=conversation.id,
        run_id=other_run.id,
        role="assistant",
        content="run-2 later",
        created_at=created_at + timedelta(seconds=2),
    )
    non_assistant = Message(
        conversation_id=conversation.id,
        run_id=run.id,
        role="tool",
        content="run-1 tool later",
        created_at=created_at + timedelta(seconds=3),
    )
    session.add_all([first, last, adjacent, non_assistant])
    await session.commit()
    return conversation, first, last, adjacent, non_assistant


async def test_explicit_output_requires_same_conversation_run_and_assistant_role(session):
    conversation, first, _, adjacent, non_assistant = await _seed_messages(session)
    repository = AgentRunOutputRepository(session)

    exact = await repository.get_output_message(
        run_id="run-1",
        conversation_id=conversation.id,
        output_message_id=first.id,
    )
    adjacent_result = await repository.get_output_message(
        run_id="run-1",
        conversation_id=conversation.id,
        output_message_id=adjacent.id,
    )
    role_result = await repository.get_output_message(
        run_id="run-1",
        conversation_id=conversation.id,
        output_message_id=non_assistant.id,
    )

    assert exact is first
    assert adjacent_result is None
    assert role_result is None


async def test_legacy_fallback_only_selects_latest_assistant_from_same_run(session):
    conversation, _, last, _, _ = await _seed_messages(session)

    result = await AgentRunOutputRepository(session).get_output_message(
        run_id="run-1",
        conversation_id=conversation.id,
        output_message_id=None,
        allow_legacy_fallback=True,
    )

    assert result is last


async def test_unbound_non_completed_run_never_reads_orphan_assistant_message(session):
    conversation, _, _, _, _ = await _seed_messages(session)

    result = await AgentRunOutputRepository(session).get_output_message(
        run_id="run-1",
        conversation_id=conversation.id,
        output_message_id=None,
        allow_legacy_fallback=False,
    )

    assert result is None
