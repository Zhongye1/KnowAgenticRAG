from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.repositories.conversation_repository import ConversationRepository
from ars.storage.postgres.models_business import Base

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


async def test_new_conversation_persists_only_project_binding(session):
    conversation = await ConversationRepository(session).add_conversation(
        uid="oidc:user@example.com",
        agent_id="main",
        thread_id="thread-1",
        project_id="11111111-1111-4111-8111-111111111111",
    )

    assert conversation.project_id == "11111111-1111-4111-8111-111111111111"
    assert not hasattr(conversation, "workdir_path")


async def test_conversation_repository_rejects_removed_workdir_argument(session):
    with pytest.raises(TypeError, match="workdir_path"):
        await ConversationRepository(session).add_conversation(
            uid="user-1",
            agent_id="main",
            thread_id="thread-legacy-path",
            project_id="22222222-2222-4222-8222-222222222222",
            workdir_path="projects/22222222-2222-4222-8222-222222222222",
        )


async def test_conversation_requires_project_binding(session):
    with pytest.raises(TypeError, match="project_id"):
        await ConversationRepository(session).add_conversation(
            uid="user-1",
            agent_id="main",
            thread_id="thread-missing-binding",
        )


async def test_failed_conversation_flush_does_not_create_unbound_workdir(session, monkeypatch):
    monkeypatch.setattr(session, "flush", AsyncMock(side_effect=RuntimeError("db failure")))

    with pytest.raises(RuntimeError, match="db failure"):
        await ConversationRepository(session).add_conversation(
            uid="user-1",
            agent_id="main",
            thread_id="thread-failed",
            project_id="33333333-3333-4333-8333-333333333333",
        )


async def test_failed_commit_does_not_change_project_binding(session, monkeypatch):
    monkeypatch.setattr(session, "commit", AsyncMock(side_effect=RuntimeError("commit failure")))

    with pytest.raises(RuntimeError, match="commit failure"):
        await ConversationRepository(session).create_conversation(
            uid="user-1",
            agent_id="main",
            thread_id="thread-commit-failed",
            project_id="44444444-4444-4444-8444-444444444444",
        )


async def test_outer_transaction_rollback_removes_new_conversation(session):
    await ConversationRepository(session).add_conversation(
        uid="user-1",
        agent_id="main",
        thread_id="thread-outer-rollback",
        project_id="55555555-5555-4555-8555-555555555555",
    )
    await session.rollback()

    assert await ConversationRepository(session).get_conversation_by_thread_id("thread-outer-rollback") is None
