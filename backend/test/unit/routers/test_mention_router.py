from __future__ import annotations

import importlib
from types import SimpleNamespace

import pytest

router = importlib.import_module("server.routers.mention_router")


@pytest.mark.asyncio
async def test_thread_mentions_use_live_project_viewer(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_search(**kwargs):
        assert kwargs == {
            "thread_id": "thread-1",
            "query": "report",
            "sources": None,
            "current_user": user,
            "db": "db",
        }
        return [
            {
                "name": "report.md",
                "path": "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111/outputs/report.md",
                "is_dir": False,
                "source": "thread",
            }
        ]

    user = SimpleNamespace(uid="user-1")
    monkeypatch.setattr(router, "search_mentions", fake_search)

    results = await router.search_mention_files(
        thread_id="thread-1",
        query="report",
        sources=None,
        current_user=user,
        db="db",
    )

    assert [item["path"] for item in results] == [
        "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111/outputs/report.md",
    ]


@pytest.mark.asyncio
async def test_workspace_only_mentions_do_not_touch_project_viewer(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_search(**kwargs):
        assert kwargs["thread_id"] is None
        assert kwargs["query"] == "note"
        return []

    monkeypatch.setattr(router, "search_mentions", fake_search)

    assert (
        await router.search_mention_files(
            thread_id=None,
            query="note",
            sources=None,
            current_user=SimpleNamespace(uid="user-1"),
            db="db",
        )
        == []
    )
