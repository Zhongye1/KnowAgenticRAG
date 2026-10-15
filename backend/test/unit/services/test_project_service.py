from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ars.services import project_service as svc
from ars.workspace.paths import ensure_user_workspace, user_workspace_dir

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]


class _Db:
    def __init__(self):
        self.items = []
        self.commits = 0

    def add(self, item):
        self.items.append(item)

    async def flush(self):
        return None

    async def commit(self):
        self.commits += 1

    async def execute(self, _statement, _params=None):
        return None

    async def scalar(self, _statement):
        return None


async def test_linked_project_accepts_existing_nested_directory(monkeypatch, tmp_path: Path):
    monkeypatch.setattr("ars.workspace.paths.get_user_data_dir", lambda: tmp_path)
    ensure_user_workspace("user-1")
    target = user_workspace_dir("user-1") / "client" / "demo"
    target.mkdir(parents=True)
    marker = target / "keep.txt"
    marker.write_text("keep", encoding="utf-8")
    db = _Db()

    result = await svc.create_project_view(
        uid="user-1",
        request_id="request-linked",
        name="Demo",
        directory_mode="linked",
        workdir_path="client/demo",
        db=db,
    )

    assert result["workdir_path"] == "client/demo"
    assert result["directory_mode"] == "linked"
    assert marker.read_text(encoding="utf-8") == "keep"
    assert db.commits == 1


async def test_linked_project_accepts_directory_below_projects(monkeypatch, tmp_path: Path):
    monkeypatch.setattr("ars.workspace.paths.get_user_data_dir", lambda: tmp_path)
    ensure_user_workspace("user-1")
    (user_workspace_dir("user-1") / "projects" / "manual").mkdir(parents=True)

    result = await svc.create_project_view(
        uid="user-1",
        request_id="request-projects-manual",
        name="Manual",
        directory_mode="linked",
        workdir_path="projects/manual",
        db=_Db(),
    )

    assert result["workdir_path"] == "projects/manual"
    assert result["directory_mode"] == "linked"


@pytest.mark.parametrize("path", ["agents", "agents/skills", "projects"])
async def test_linked_project_accepts_any_existing_non_root_directory(
    monkeypatch, tmp_path: Path, path: str
):
    monkeypatch.setattr("ars.workspace.paths.get_user_data_dir", lambda: tmp_path)
    ensure_user_workspace("user-1")
    (user_workspace_dir("user-1") / path).mkdir(parents=True, exist_ok=True)

    result = await svc.create_project_view(
        uid="user-1",
        request_id=f"request-{path}",
        name="Any directory",
        directory_mode="linked",
        workdir_path=path,
        db=_Db(),
    )

    assert result["workdir_path"] == path


async def test_multiple_projects_can_share_one_existing_directory(monkeypatch, tmp_path: Path):
    monkeypatch.setattr("ars.workspace.paths.get_user_data_dir", lambda: tmp_path)
    ensure_user_workspace("user-1")
    target = user_workspace_dir("user-1") / "shared"
    target.mkdir()
    db = _Db()

    first = await svc.create_project_view(
        uid="user-1",
        request_id="request-shared-1",
        name="Shared one",
        directory_mode="linked",
        workdir_path="shared",
        db=db,
    )
    second = await svc.create_project_view(
        uid="user-1",
        request_id="request-shared-2",
        name="Shared two",
        directory_mode="linked",
        workdir_path="shared",
        db=db,
    )

    assert first["id"] != second["id"]
    assert first["workdir_path"] == second["workdir_path"] == "shared"


@pytest.mark.parametrize(
    ("directory_mode", "workdir_path"),
    [("managed", None), ("managed", "clients/acme"), ("linked", None), ("linked", "")],
)
async def test_manual_project_requires_selected_directory(directory_mode: str, workdir_path: str | None):
    with pytest.raises(HTTPException) as exc:
        await svc.create_project_view(
            uid="user-1",
            request_id="request-manual-without-directory",
            name="Invalid",
            directory_mode=directory_mode,
            workdir_path=workdir_path,
            db=_Db(),
        )

    assert exc.value.status_code == 422
    assert exc.value.detail == "手动创建项目必须选择目录"


@pytest.mark.parametrize("path", ["/", "../outside", "/tmp/host"])
async def test_linked_project_rejects_root_or_outside_paths(monkeypatch, tmp_path: Path, path: str):
    monkeypatch.setattr("ars.workspace.paths.get_user_data_dir", lambda: tmp_path)
    ensure_user_workspace("user-1")

    with pytest.raises(HTTPException) as exc:
        await svc.create_project_view(
            uid="user-1",
            request_id=f"request-{path}",
            name="Invalid",
            directory_mode="linked",
            workdir_path=path,
            db=_Db(),
        )

    assert exc.value.status_code in {400, 404}


async def test_linked_project_rejects_file_and_symlink(monkeypatch, tmp_path: Path):
    monkeypatch.setattr("ars.workspace.paths.get_user_data_dir", lambda: tmp_path)
    ensure_user_workspace("user-1")
    workspace = user_workspace_dir("user-1")
    (workspace / "file.txt").write_text("x", encoding="utf-8")
    outside = tmp_path / "outside"
    outside.mkdir()
    (workspace / "link").symlink_to(outside, target_is_directory=True)

    for path in ("file.txt", "link"):
        with pytest.raises(HTTPException) as exc:
            await svc.create_project_view(
                uid="user-1",
                request_id=f"request-{path}",
                name="Invalid",
                directory_mode="linked",
                workdir_path=path,
                db=_Db(),
            )
        assert exc.value.status_code == 400


async def test_history_candidates_only_expose_resolved_directory_shortcuts(monkeypatch):
    updated_at = datetime(2026, 8, 22, 12, 0, 0)
    first = SimpleNamespace(
        thread_id="thread-1",
        title="奇怪标题",
        agent_id="agent-1",
        updated_at=updated_at,
    )
    same_directory = SimpleNamespace(
        thread_id="thread-2",
        title="同目录旧对话",
        agent_id="agent-1",
        updated_at=updated_at,
    )
    linked = SimpleNamespace(
        thread_id="thread-3",
        title="客户资料",
        agent_id="agent-2",
        updated_at=updated_at,
    )

    class _ProjectRepository:
        def __init__(self, _db):
            pass

        async def list_history_candidates(self, uid):
            assert uid == "user-1"
            return [
                (first, "projects/shared"),
                (same_directory, "projects/shared"),
                (linked, "clients/acme"),
            ]

    monkeypatch.setattr(svc, "ProjectRepository", _ProjectRepository)
    result = await svc.list_history_candidates_view(
        uid="user-1",
        db=_Db(),
    )

    assert result == {
        "items": [
            {
                "thread_id": "thread-1",
                "title": "奇怪标题",
                "agent_id": "agent-1",
                "workdir_path": "projects/shared",
                "updated_at": "2026-08-22T12:00:00",
            },
            {
                "thread_id": "thread-3",
                "title": "客户资料",
                "agent_id": "agent-2",
                "workdir_path": "clients/acme",
                "updated_at": "2026-08-22T12:00:00",
            },
        ],
        "has_more": False,
    }
