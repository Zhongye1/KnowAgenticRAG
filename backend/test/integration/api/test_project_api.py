from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import text
from test.live_api_cleanup import (
    make_test_conversation_metadata,
    make_test_conversation_title,
    make_test_resource_id,
)
from ars.storage.postgres.manager import pg_manager

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _default_agent_slug(test_client, headers: dict[str, str]) -> str:
    response = await test_client.get("/api/agent/default", headers=headers)
    assert response.status_code == 200, response.text
    agent = response.json()["agent"]
    return str(agent.get("slug") or agent["agent_id"])


@pytest_asyncio.fixture()
async def linked_directory(test_client, admin_headers):
    """创建并在用例结束后删除 linked Project 使用的目录。"""

    directory_name = f"pytest-linked-{uuid.uuid4().hex[:10]}"
    response = await test_client.post(
        "/api/workspace/directory",
        headers=admin_headers,
        json={"parent_path": "/", "name": directory_name},
    )
    assert response.status_code == 200, response.text
    try:
        yield directory_name
    finally:
        response = await test_client.request(
            "DELETE",
            "/api/workspace/file",
            headers=admin_headers,
            params={"path": directory_name},
        )
        assert response.status_code in {200, 404}, response.text


async def test_default_thread_creates_implicit_project_with_exclusive_binding(test_client, admin_headers):
    response = await test_client.post(
        "/api/chat/thread",
        headers=admin_headers,
        json={
            "agent_id": await _default_agent_slug(test_client, admin_headers),
            "title": make_test_conversation_title("implicit-project"),
            "metadata": make_test_conversation_metadata("implicit-project"),
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["project_id"]
    assert payload["workdir_path"].startswith("projects/")

    async with pg_manager.get_async_session_context() as db:
        row = (
            await db.execute(
                text(
                    "SELECT c.project_id, p.selection_status, p.directory_mode, p.workdir_path "
                    "FROM conversations c JOIN projects p ON p.id = c.project_id AND p.uid = c.uid "
                    "WHERE c.thread_id = :thread_id"
                ),
                {"thread_id": payload["id"]},
            )
        ).one()
    assert row.project_id == payload["project_id"]
    assert row.selection_status == "implicit"
    assert row.directory_mode == "managed"
    assert row.workdir_path == payload["workdir_path"]


async def test_linked_project_and_thread_selection_keep_directory_bytes(
    test_client,
    admin_headers,
    linked_directory,
):
    directory_name = linked_directory
    project_response = await test_client.post(
        "/api/projects",
        headers=admin_headers,
        json={
            "request_id": make_test_resource_id("linked-project"),
            "name": "Linked",
            "workdir": {"mode": "linked", "path": directory_name},
        },
    )
    assert project_response.status_code == 200, project_response.text
    project = project_response.json()

    thread_response = await test_client.post(
        "/api/chat/thread",
        headers=admin_headers,
        json={
            "agent_id": await _default_agent_slug(test_client, admin_headers),
            "project_id": project["id"],
            "title": make_test_conversation_title("linked-project"),
            "metadata": make_test_conversation_metadata("linked-project"),
        },
    )
    assert thread_response.status_code == 200, thread_response.text
    thread = thread_response.json()
    assert thread["project_id"] == project["id"]
    assert thread["workdir_path"] == directory_name

    rebind = await test_client.put(
        f"/api/chat/thread/{thread['id']}",
        headers=admin_headers,
        json={"project_id": str(uuid.uuid4())},
    )
    assert rebind.status_code == 422, rebind.text

    legacy_direct_path = await test_client.post(
        "/api/chat/thread",
        headers=admin_headers,
        json={
            "agent_id": await _default_agent_slug(test_client, admin_headers),
            "workdir_path": directory_name,
        },
    )
    assert legacy_direct_path.status_code == 422, legacy_direct_path.text

    duplicate = await test_client.post(
        "/api/projects",
        headers=admin_headers,
        json={
            "request_id": make_test_resource_id("duplicate-linked-project"),
            "name": "Duplicate",
            "workdir": {"mode": "linked", "path": directory_name},
        },
    )
    assert duplicate.status_code == 200, duplicate.text
    assert duplicate.json()["id"] != project["id"]
    assert duplicate.json()["workdir_path"] == directory_name

    invalid_paths = ["/", "../outside", f"{directory_name}/missing"]
    for path in invalid_paths:
        invalid = await test_client.post(
            "/api/projects",
            headers=admin_headers,
            json={
                "request_id": make_test_resource_id("invalid-linked-project"),
                "name": "Invalid",
                "workdir": {"mode": "linked", "path": path},
            },
        )
        assert invalid.status_code in {400, 404}, (path, invalid.text)
