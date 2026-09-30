"""
Conversation thread status mapping and viewed-marking unit tests.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.repositories.conversation_repository import ConversationRepository, UNVIEWED_RUN_MARKER
from ars.services import conversation_service as svc
from ars.storage.postgres.models_business import AgentRun, Base, Conversation, Project

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


async def _seed_conversation(db, *, thread_id: str, last_viewed_run_id: str | None = None) -> Conversation:
    project_id = f"project-{thread_id}"
    db.add(
        Project(
            id=project_id,
            uid="user-1",
            selection_status="implicit",
            workdir_path=f"projects/workdir-{thread_id}",
            directory_mode="managed",
        )
    )
    conversation = Conversation(
        thread_id=thread_id,
        project_id=project_id,
        uid="user-1",
        agent_id="main",
        title=f"conv-{thread_id}",
        status="active",
        extra_metadata={},
        last_viewed_run_id=last_viewed_run_id,
    )
    db.add(conversation)
    await db.flush()
    return conversation


async def _seed_run(db, *, thread_id: str, run_id: str, status: str, run_type: str = "chat") -> AgentRun:
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


@pytest.mark.parametrize(
    ("run_id", "run_status", "last_viewed_run_id", "expected"),
    [
        (None, None, None, "done"),
        ("r1", "running", None, "loading"),
        ("r1", "pending", None, "loading"),
        ("r1", "cancel_requested", None, "loading"),
        ("r1", "completed", None, "ready"),
        ("r1", "completed", "r1", "done"),
        ("r1", "failed", None, "ready"),
        ("r1", "cancelled", None, "ready"),
        ("r1", "interrupted", None, "ready"),
        ("r1", "interrupted", "r1", "done"),
    ],
)
async def test_thread_status_mapping(run_id, run_status, last_viewed_run_id, expected):
    assert svc._thread_status(run_id, run_status, last_viewed_run_id) == expected


async def test_list_threads_view_maps_run_states(session):
    await _seed_conversation(session, thread_id="thread-running")
    await _seed_run(session, thread_id="thread-running", run_id="run-running", status="running")

    await _seed_conversation(session, thread_id="thread-ready")
    await _seed_run(session, thread_id="thread-ready", run_id="run-ready", status="completed")

    await _seed_conversation(session, thread_id="thread-done", last_viewed_run_id="run-done")
    await _seed_run(session, thread_id="thread-done", run_id="run-done", status="completed")

    await _seed_conversation(session, thread_id="thread-no-run")
    await session.commit()

    items = await svc.list_threads_view(db=session, current_uid="user-1", agent_slug=None, limit=100)
    status_by_id = {item["id"]: item["thread_status"] for item in items}

    assert status_by_id["thread-running"] == "loading"
    assert status_by_id["thread-ready"] == "ready"
    assert status_by_id["thread-done"] == "done"
    assert status_by_id["thread-no-run"] == "done"


async def test_list_threads_view_uses_joined_projects_without_per_thread_lookup(session, monkeypatch):
    """线程列表批量联查 Project，不按 Conversation 逐条解析。"""

    await _seed_conversation(session, thread_id="thread-one")
    await _seed_conversation(session, thread_id="thread-two")
    await session.commit()

    async def reject_individual_lookup(**_kwargs):
        raise AssertionError("线程列表不应逐条查询 Project")

    monkeypatch.setattr(svc, "resolve_conversation_workdir_path", reject_individual_lookup)

    items = await svc.list_threads_view(db=session, current_uid="user-1", agent_slug=None, limit=100)

    assert {item["id"] for item in items} == {"thread-one", "thread-two"}


async def test_list_threads_view_ignores_subagent_and_other_users(session):
    await _seed_conversation(session, thread_id="thread-main")
    await _seed_run(session, thread_id="thread-main", run_id="run-main", status="completed")
    await _seed_run(session, thread_id="thread-main", run_id="run-sub", status="running", run_type="subagent")
    await _seed_conversation(session, thread_id="thread-other-user")
    db = session
    db.add(
        AgentRun(
            id="run-other",
            conversation_thread_id="thread-other-user",
            runtime_scope_id="thread-other-user",
            agent_slug="main",
            uid="user-2",
            status="running",
            request_id="req-other",
            run_type="chat",
            input_payload={},
        )
    )
    await db.commit()

    items = await svc.list_threads_view(db=session, current_uid="user-1", agent_slug=None, limit=100)
    status_by_id = {item["id"]: item["thread_status"] for item in items}

    assert status_by_id["thread-main"] == "ready"
    assert status_by_id["thread-other-user"] == "done"


async def test_latest_run_wins_when_multiple_runs_exist(session):
    await _seed_conversation(session, thread_id="thread-latest", last_viewed_run_id="run-old")
    await _seed_run(session, thread_id="thread-latest", run_id="run-old", status="completed")
    await _seed_run(session, thread_id="thread-latest", run_id="run-new", status="completed")
    await session.commit()

    items = await svc.list_threads_view(db=session, current_uid="user-1", agent_slug=None, limit=100)
    item = next(item for item in items if item["id"] == "thread-latest")

    assert item["thread_status"] == "ready"


async def test_mark_thread_viewed_turns_ready_to_done(session):
    await _seed_conversation(session, thread_id="thread-view")
    await _seed_run(session, thread_id="thread-view", run_id="run-view", status="completed")
    await session.commit()

    before = await svc.list_threads_view(db=session, current_uid="user-1", agent_slug=None, limit=100)
    assert next(item for item in before if item["id"] == "thread-view")["thread_status"] == "ready"

    result = await svc.mark_thread_viewed_view(db=session, thread_id="thread-view", current_uid="user-1")
    assert result["thread_status"] == "done"

    after = await svc.list_threads_view(db=session, current_uid="user-1", agent_slug=None, limit=100)
    assert next(item for item in after if item["id"] == "thread-view")["thread_status"] == "done"


async def test_mark_thread_viewed_keeps_loading_when_run_active(session):
    await _seed_conversation(session, thread_id="thread-active")
    await _seed_run(session, thread_id="thread-active", run_id="run-active", status="running")
    await session.commit()

    result = await svc.mark_thread_viewed_view(db=session, thread_id="thread-active", current_uid="user-1")

    assert result["thread_status"] == "loading"


async def test_new_thread_creation_uses_unviewed_marker(session):
    conversation = await ConversationRepository(session).add_conversation(
        uid="user-1",
        agent_id="main",
        title="new-thread",
        thread_id="thread-new",
        project_id="11111111-1111-4111-8111-111111111111",
    )

    assert conversation.last_viewed_run_id == UNVIEWED_RUN_MARKER


async def test_new_thread_creation_cannot_seed_attachment_records(session):
    conversation = await ConversationRepository(session).add_conversation(
        uid="user-1",
        agent_id="main",
        thread_id="thread-reserved-metadata",
        metadata={"attachments": [{"bucket_name": "private", "object_name": "secret"}]},
        project_id="22222222-2222-4222-8222-222222222222",
    )

    assert conversation.extra_metadata["attachments"] == []


async def test_create_thread_view_rejects_client_attachment_metadata():
    with pytest.raises(svc.HTTPException, match="服务端保留字段"):
        await svc.create_thread_view(
            agent_slug="main",
            request_id=None,
            title="malicious",
            metadata={"attachments": [{"bucket_name": "private", "object_name": "secret"}]},
            db=None,
            current_uid="user-1",
        )


async def test_create_thread_replay_restores_managed_workdir(monkeypatch):
    project = SimpleNamespace(
        id="project-1",
        uid="user-1",
        selection_status="implicit",
        directory_mode="managed",
        workdir_path="projects/11111111-1111-4111-8111-111111111111",
    )
    conversation = SimpleNamespace(
        id=1,
        thread_id="thread-1",
        uid="user-1",
        agent_id="main",
        title="title",
        status="active",
        is_pinned=False,
        project_id=project.id,
        created_at=SimpleNamespace(isoformat=lambda: "created"),
        updated_at=SimpleNamespace(isoformat=lambda: "updated"),
        extra_metadata={},
    )

    class _Db:
        async def execute(self, _statement):
            return SimpleNamespace(scalar_one_or_none=lambda: SimpleNamespace(uid="user-1"))

    class _AgentRepository:
        def __init__(self, _db):
            pass

        async def get_visible_by_slug(self, **_kwargs):
            return SimpleNamespace(slug="main", backend_id="ChatbotAgent")

    class _ConversationRepository:
        def __init__(self, _db):
            pass

        async def get_conversation_by_creation_request_id(self, _uid, _request_id):
            return conversation

    class _ProjectRepository:
        def __init__(self, _db):
            pass

        async def get_for_user(self, _project_id, _uid):
            return project

    restored = []

    async def ensure_available(**kwargs):
        restored.append(kwargs["conversation"].thread_id)
        return project.workdir_path

    async def serialize_thread(_conversation, **_kwargs):
        return {"id": _conversation.thread_id}

    monkeypatch.setattr(svc, "AgentRepository", _AgentRepository)
    monkeypatch.setattr(svc, "ConversationRepository", _ConversationRepository)
    monkeypatch.setattr(svc, "ProjectRepository", _ProjectRepository)
    monkeypatch.setattr(svc, "ensure_conversation_workdir_available", ensure_available)
    monkeypatch.setattr(svc, "_serialize_thread", serialize_thread)

    result = await svc.create_thread_view(
        agent_slug="main",
        request_id="request-1",
        title="title",
        metadata={},
        project_id=None,
        db=_Db(),
        current_uid="user-1",
    )

    assert result == {"id": "thread-1"}
    assert restored == ["thread-1"]


async def test_marker_thread_with_terminal_run_shows_ready_then_done(session):
    await _seed_conversation(session, thread_id="thread-marker", last_viewed_run_id=UNVIEWED_RUN_MARKER)
    await _seed_run(session, thread_id="thread-marker", run_id="run-marker", status="completed")
    await session.commit()

    before = await svc.list_threads_view(db=session, current_uid="user-1", agent_slug=None, limit=100)
    assert next(item for item in before if item["id"] == "thread-marker")["thread_status"] == "ready"

    await svc.mark_thread_viewed_view(db=session, thread_id="thread-marker", current_uid="user-1")
    after = await svc.list_threads_view(db=session, current_uid="user-1", agent_slug=None, limit=100)
    assert next(item for item in after if item["id"] == "thread-marker")["thread_status"] == "done"
