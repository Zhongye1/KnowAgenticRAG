from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ars.services import workdir_service as svc
from ars.workspace.workdir import Workdir


def test_workdir_access_resolves_only_scope_relative_paths():
    workspace = object()
    workdir = Workdir("projects/11111111-1111-4111-8111-111111111111", workspace)
    access = svc.AuthorizedWorkdir(
        conversation_id=1,
        thread_id="thread-1",
        uid="user-1",
        workdir=workdir,
        project_id="project-1",
        directory_mode="managed",
    )

    assert access.workdir.workspace is workspace
    assert access.workdir.resolve_path("/") == "/projects/11111111-1111-4111-8111-111111111111"
    assert (
        access.workdir.resolve_path("/outputs/report.md")
        == "/projects/11111111-1111-4111-8111-111111111111/outputs/report.md"
    )
    assert (
        access.workdir.scope_path("/projects/11111111-1111-4111-8111-111111111111/outputs/report.md")
        == "/outputs/report.md"
    )
    for invalid in ("relative.txt", "/../escape", "\\escape"):
        with pytest.raises(ValueError):
            access.workdir.resolve_path(invalid)


@pytest.mark.asyncio
async def test_binding_uses_project_workdir(monkeypatch: pytest.MonkeyPatch):
    conversation = SimpleNamespace(
        id=1,
        thread_id="thread-1",
        uid="user-1",
        status="active",
        project_id="project-1",
    )

    class _ConversationRepository:
        def __init__(self, _db):
            pass

        async def get_conversation_by_thread_id(self, _thread_id):
            return conversation

    opened = {}

    class _Workdir:
        relative_path = "projects/11111111-1111-4111-8111-111111111111"
        root_path = f"/{relative_path}"
        workspace = SimpleNamespace(uid="user-1")

        @classmethod
        def open_existing(cls, uid, workdir_path):
            opened.update(uid=uid, workdir_path=workdir_path)
            return cls()

    class _ProjectRepository:
        def __init__(self, _db):
            pass

        async def get_for_user(self, project_id, uid):
            assert (project_id, uid) == ("project-1", "user-1")
            return SimpleNamespace(
                id="project-1",
                workdir_path="projects/11111111-1111-4111-8111-111111111111",
                directory_mode="managed",
            )

    monkeypatch.setattr(svc, "ConversationRepository", _ConversationRepository)
    monkeypatch.setattr(svc, "ProjectRepository", _ProjectRepository)
    monkeypatch.setattr(svc, "Workdir", _Workdir)

    binding = await svc.resolve_authorized_workdir(thread_id="thread-1", uid="user-1", db=object())

    assert binding.workdir_path == "projects/11111111-1111-4111-8111-111111111111"
    assert binding.workdir.root_path == "/projects/11111111-1111-4111-8111-111111111111"
    assert binding.workdir.workspace.uid == "user-1"
    assert opened == {"uid": "user-1", "workdir_path": "projects/11111111-1111-4111-8111-111111111111"}


@pytest.mark.asyncio
async def test_binding_rejects_cross_user_conversation(monkeypatch: pytest.MonkeyPatch):
    conversation = SimpleNamespace(
        id=1,
        thread_id="thread-1",
        uid="other-user",
        status="active",
        project_id="project-1",
    )

    class _ConversationRepository:
        def __init__(self, _db):
            pass

        async def get_conversation_by_thread_id(self, _thread_id):
            return conversation

    monkeypatch.setattr(svc, "ConversationRepository", _ConversationRepository)

    with pytest.raises(HTTPException) as exc:
        await svc.resolve_authorized_workdir(thread_id="thread-1", uid="user-1", db=object())

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_binding_resolves_project_workdir_without_conversation_path(monkeypatch: pytest.MonkeyPatch):
    conversation = SimpleNamespace(
        id=1,
        thread_id="thread-1",
        uid="user-1",
        status="active",
        project_id="project-1",
    )

    class _ConversationRepository:
        def __init__(self, _db):
            pass

        async def get_conversation_by_thread_id(self, _thread_id):
            return conversation

    class _ProjectRepository:
        def __init__(self, _db):
            pass

        async def get_for_user(self, project_id, uid):
            assert (project_id, uid) == ("project-1", "user-1")
            return SimpleNamespace(
                id="project-1",
                workdir_path="client/demo",
                directory_mode="linked",
            )

    class _Workdir:
        relative_path = "client/demo"

        @classmethod
        def open_existing(cls, uid, workdir_path):
            assert (uid, workdir_path) == ("user-1", "client/demo")
            return cls()

    monkeypatch.setattr(svc, "ConversationRepository", _ConversationRepository)
    monkeypatch.setattr(svc, "ProjectRepository", _ProjectRepository)
    monkeypatch.setattr(svc, "Workdir", _Workdir)

    binding = await svc.resolve_authorized_workdir(thread_id="thread-1", uid="user-1", db=object())

    assert binding.project_id == "project-1"
    assert binding.directory_mode == "linked"
    assert binding.workdir_path == "client/demo"


@pytest.mark.asyncio
async def test_ensure_linked_workdir_opens_existing_without_materializing(monkeypatch: pytest.MonkeyPatch):
    conversation = SimpleNamespace(project_id="project-1")

    async def resolve_binding(**_kwargs):
        return "client/demo", SimpleNamespace(directory_mode="linked")

    opened = []

    class _Workdir:
        @classmethod
        def open_existing(cls, uid, workdir_path):
            opened.append((uid, workdir_path))

    monkeypatch.setattr(svc, "resolve_conversation_workdir_binding", resolve_binding)
    monkeypatch.setattr(svc, "Workdir", _Workdir)
    monkeypatch.setattr(
        svc,
        "ensure_bound_user_workdir",
        lambda *_args: pytest.fail("linked Workdir 不能走 managed 物化"),
    )

    result = await svc.ensure_conversation_workdir_available(
        conversation=conversation,
        uid="user-1",
        db=object(),
    )

    assert result == "client/demo"
    assert opened == [("user-1", "client/demo")]
