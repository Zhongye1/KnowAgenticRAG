from types import SimpleNamespace

import pytest

from server.routers import chat_router


@pytest.mark.asyncio
async def test_artifact_route_returns_realtime_workdir_response(monkeypatch):
    sentinel = object()
    captured = {}

    async def fake_resolve(**kwargs):
        captured.update(kwargs)
        return sentinel

    monkeypatch.setattr(chat_router, "resolve_thread_artifact_view", fake_resolve)
    user = SimpleNamespace(uid="user-1")
    db = object()
    result = await chat_router.get_thread_artifact(
        thread_id="thread-1",
        path="home/gem/projects/project-workdir-1/report.txt",
        download=False,
        preview=True,
        db=db,
        current_user=user,
    )

    assert result is sentinel
    assert captured == {
        "thread_id": "thread-1",
        "current_uid": "user-1",
        "db": db,
        "path": "home/gem/projects/project-workdir-1/report.txt",
        "download": False,
        "preview": True,
    }
