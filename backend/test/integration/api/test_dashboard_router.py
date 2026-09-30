"""
Integration tests for dashboard router endpoints.
"""

from __future__ import annotations

import os
import uuid

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from ars.config.runtime import knowledge_capability_enabled
from ars.storage.postgres.models_business import Conversation

from test.live_api_cleanup import make_test_conversation_metadata, make_test_conversation_title

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _set_conversation_statuses(subagent_thread_id: str, deleted_thread_id: str) -> None:
    """使用绑定当前测试事件循环的一次性引擎写入状态事实。"""
    engine = create_async_engine(os.environ["POSTGRES_URL"])
    try:
        session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
        async with session_factory() as db:
            await db.execute(
                update(Conversation).where(Conversation.thread_id == subagent_thread_id).values(status="subagent")
            )
            await db.execute(
                update(Conversation).where(Conversation.thread_id == deleted_thread_id).values(status="deleted")
            )
            await db.commit()
    finally:
        await engine.dispose()


async def test_dashboard_requires_authentication(test_client):
    response = await test_client.get("/api/dashboard/conversations")
    assert response.status_code == 401


async def test_standard_user_is_forbidden(test_client, standard_user):
    response = await test_client.get("/api/dashboard/conversations", headers=standard_user["headers"])
    assert response.status_code == 403


async def test_admin_can_fetch_conversations(test_client, admin_headers):
    response = await test_client.get("/api/dashboard/conversations", headers=admin_headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert set(data) == {"items", "total", "limit", "offset"}
    assert isinstance(data["items"], list)
    assert data["total"] >= len(data["items"])


async def test_admin_can_fetch_conversation_filter_options(test_client, admin_headers):
    response = await test_client.get("/api/dashboard/conversations/options", headers=admin_headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert set(data) == {"users", "agents"}
    assert all("is_deleted" in item for item in data["users"])
    assert all("is_deleted" in item for item in data["agents"])


async def test_dashboard_rejects_invalid_query_ranges(test_client, admin_headers):
    responses = [
        await test_client.get("/api/dashboard/stats/threads?time_range=365days", headers=admin_headers),
        await test_client.get("/api/dashboard/conversations?limit=0", headers=admin_headers),
        await test_client.get("/api/dashboard/conversations?offset=-1", headers=admin_headers),
    ]

    assert [response.status_code for response in responses] == [422, 422, 422]


async def test_admin_can_fetch_stats(test_client, admin_headers):
    """Test that the timeseries stats endpoint returns consistent values."""
    response = await test_client.get(
        "/api/dashboard/stats/calls/timeseries?type=models&time_range=14days",
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total_count"] >= 0
    assert len(data["data"]) == 14
    assert isinstance(data["categories"], list)


async def test_knowledge_stats_matches_runtime_capability(test_client, admin_headers):
    response = await test_client.get("/api/dashboard/stats/knowledge", headers=admin_headers)

    if not knowledge_capability_enabled():
        assert response.status_code == 404, response.text
        return

    assert response.status_code == 200, response.text
    assert set(response.json()) == {
        "total_databases",
        "total_files",
        "total_nodes",
        "total_storage_size",
        "databases_by_type",
        "file_type_distribution",
    }


async def test_admin_can_fetch_thread_analytics(test_client, admin_headers):
    """Test that thread analytics endpoint returns complete statistics schema."""
    response = await test_client.get(
        "/api/dashboard/stats/threads?time_range=30days",
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert "summary" in data
    assert "daily_trends" in data
    assert "depth_distribution" in data
    assert "agent_distribution" in data
    assert "top_users" in data
    assert "status_distribution" in data
    assert len(data["daily_trends"]) == 30
    assert data["summary"]["total_threads"] >= 0


async def test_dashboard_http_applies_subagent_and_deleted_conversation_scopes(test_client, admin_headers):
    default_agent = await test_client.get("/api/agent/default", headers=admin_headers)
    assert default_agent.status_code == 200, default_agent.text
    agent = default_agent.json()["agent"]
    agent_id = str(agent.get("slug") or agent["agent_id"])
    marker = f"dashboard-scope-{uuid.uuid4().hex[:10]}"

    async def analytics(*, include_subagents: bool) -> dict:
        response = await test_client.get(
            "/api/dashboard/stats/threads",
            params={
                "time_range": "30days",
                "agent_id": agent_id,
                "include_subagents": str(include_subagents).lower(),
            },
            headers=admin_headers,
        )
        assert response.status_code == 200, response.text
        return response.json()

    baseline_default = await analytics(include_subagents=False)
    baseline_including_subagents = await analytics(include_subagents=True)
    thread_ids = []
    for status in ("active", "subagent", "deleted"):
        response = await test_client.post(
            "/api/chat/thread",
            headers=admin_headers,
            json={
                "agent_id": agent_id,
                "title": make_test_conversation_title(f"{marker}-{status}"),
                "metadata": make_test_conversation_metadata(marker),
            },
        )
        assert response.status_code == 200, response.text
        thread_ids.append(str(response.json().get("thread_id") or response.json()["id"]))

    await _set_conversation_statuses(thread_ids[1], thread_ids[2])

    default_scope = await analytics(include_subagents=False)
    subagent_scope = await analytics(include_subagents=True)
    assert default_scope["summary"]["total_threads"] == baseline_default["summary"]["total_threads"] + 1
    assert subagent_scope["summary"]["total_threads"] == baseline_including_subagents["summary"]["total_threads"] + 2

    default_audit = await test_client.get(
        "/api/dashboard/conversations",
        params={"search": marker, "limit": 10},
        headers=admin_headers,
    )
    deleted_audit = await test_client.get(
        "/api/dashboard/conversations",
        params={"search": marker, "status": "deleted", "limit": 10},
        headers=admin_headers,
    )
    assert default_audit.status_code == 200, default_audit.text
    assert deleted_audit.status_code == 200, deleted_audit.text
    assert {item["thread_id"] for item in default_audit.json()["items"]} == set(thread_ids[:2])
    assert {item["thread_id"] for item in deleted_audit.json()["items"]} == {thread_ids[2]}


async def test_admin_can_fetch_feedbacks(test_client, admin_headers):
    """Test that feedback endpoint returns 200 and handles the User join correctly."""
    response = await test_client.get("/api/dashboard/feedbacks", headers=admin_headers)
    assert response.status_code == 200, f"feedbacks failed: {response.text}"
    assert isinstance(response.json(), list)
