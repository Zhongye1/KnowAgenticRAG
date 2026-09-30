from types import SimpleNamespace

import pytest

from ars.services import workspace_service as svc

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]


class _ProjectRepository:
    def __init__(self, _db):
        pass

    async def list_selectable_workdir_paths_for_user(self, uid: str) -> list[str]:
        assert uid == "user-1"
        return ["projects/client", "projects/group/nested", "outside"]


async def test_project_tree_hides_anonymous_directories_and_keeps_selected_ancestors(monkeypatch):
    monkeypatch.setattr(svc, "ProjectRepository", _ProjectRepository)
    entries = [
        {"path": "/projects/", "is_dir": True},
        {"path": "/projects/anonymous/", "is_dir": True},
        {"path": "/projects/client/", "is_dir": True},
        {"path": "/projects/client/report.txt", "is_dir": False},
        {"path": "/projects/group/", "is_dir": True},
        {"path": "/projects/group/nested/", "is_dir": True},
        {"path": "/projects/orphan.txt", "is_dir": False},
        {"path": "/notes/", "is_dir": True},
    ]

    filtered = await svc._filter_project_tree_entries(
        entries,
        uid="user-1",
        db=SimpleNamespace(),
    )

    assert [entry["path"] for entry in filtered] == [
        "/projects/",
        "/projects/client/",
        "/projects/client/report.txt",
        "/projects/group/",
        "/projects/group/nested/",
        "/notes/",
    ]


async def test_selected_projects_root_exposes_its_complete_subtree(monkeypatch):
    class _RootProjectRepository:
        def __init__(self, _db):
            pass

        async def list_selectable_workdir_paths_for_user(self, _uid: str) -> list[str]:
            return ["projects"]

    monkeypatch.setattr(svc, "ProjectRepository", _RootProjectRepository)
    entries = [
        {"path": "/projects/anonymous/", "is_dir": True},
        {"path": "/projects/anonymous/report.txt", "is_dir": False},
    ]

    assert await svc._filter_project_tree_entries(
        entries,
        uid="user-1",
        db=SimpleNamespace(),
    ) == entries


async def test_tree_without_projects_descendants_does_not_query_projects(monkeypatch):
    class _UnexpectedRepository:
        def __init__(self, _db):
            raise AssertionError("普通 Workspace 目录不应读取 Project")

    monkeypatch.setattr(svc, "ProjectRepository", _UnexpectedRepository)
    entries = [{"path": "/notes/readme.md", "is_dir": False}]

    assert await svc._filter_project_tree_entries(
        entries,
        uid="user-1",
        db=SimpleNamespace(),
    ) == entries


async def test_project_picker_tree_keeps_unbound_project_directories(monkeypatch):
    """Project 选目录用途绕过展示投影，但仍复用 Workspace 文件边界。"""

    entries = [{"path": "/projects/unbound/", "name": "unbound", "is_dir": True}]
    monkeypatch.setattr(svc, "_workspace_backend", lambda _user: SimpleNamespace())
    monkeypatch.setattr(svc, "_list_workspace_directory", lambda *_args, **_kwargs: entries)

    result = await svc.list_workspace_tree(
        path="/projects",
        include_unbound_project_dirs=True,
        current_user=SimpleNamespace(uid="user-1"),
        db=SimpleNamespace(),
    )

    assert result == {"entries": entries}
