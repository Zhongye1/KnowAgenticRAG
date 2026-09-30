"""
Integration tests for chat router endpoints.
"""

from __future__ import annotations

import asyncio
import base64
import io
import uuid
from pathlib import PurePosixPath

import pytest
from PIL import Image

from test.live_api_cleanup import make_test_conversation_metadata, make_test_conversation_title

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _upload_project_file(
    test_client,
    headers,
    thread_id: str,
    name: str,
    content: bytes,
    *,
    parent_path: str = "/",
    artifact_path: bool = False,
) -> str:
    response = await test_client.post(
        "/api/viewer/filesystem/upload",
        data={"thread_id": thread_id, "parent_path": parent_path},
        files={"files": (name, content, "text/plain")},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    entry = response.json()["entries"][0]
    if not artifact_path:
        return entry["path"]
    marker = f"/api/chat/thread/{thread_id}/artifacts/"
    assert entry["artifact_url"].startswith(marker)
    return f"/{entry['artifact_url'][len(marker) :]}"


async def test_chat_endpoints_require_authentication(test_client):
    assert (await test_client.get("/api/chat/threads")).status_code == 401
    assert (await test_client.get("/api/agent")).status_code == 401


async def test_image_upload_composites_transparent_png_pixels_on_white(test_client, admin_headers):
    image = Image.new("RGBA", (2, 2), (255, 255, 255, 0))
    image.putpixel((0, 0), (50, 87, 244, 0))
    image.putpixel((1, 0), (50, 87, 244, 255))

    with io.BytesIO() as buffer:
        image.save(buffer, format="PNG")
        image_bytes = buffer.getvalue()

    response = await test_client.post(
        "/api/chat/image/upload",
        headers=admin_headers,
        files={"file": ("transparent.png", image_bytes, "image/png")},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["success"] is True
    assert payload["mime_type"] == "image/png"

    processed_data = base64.b64decode(payload["image_content"])
    with Image.open(io.BytesIO(processed_data)) as processed_image:
        rgb_image = processed_image.convert("RGB")

    assert rgb_image.getpixel((0, 0)) == (255, 255, 255)
    assert rgb_image.getpixel((1, 0)) == (50, 87, 244)


async def test_legacy_direct_thread_attachment_upload_is_removed(test_client, admin_headers):
    response = await test_client.post(
        f"/api/chat/thread/{uuid.uuid4()}/attachments",
        headers=admin_headers,
        files={"file": ("legacy.txt", b"legacy", "text/plain")},
    )

    assert response.status_code == 405


async def test_development_thread_file_browse_routes_are_removed(test_client, admin_headers):
    thread_id = await _create_thread_for_user(test_client, admin_headers)
    path = await _upload_project_file(test_client, admin_headers, thread_id, "removed-route.txt", b"content")

    list_response = await test_client.get(
        f"/api/chat/thread/{thread_id}/files",
        params={"path": "/"},
        headers=admin_headers,
    )
    content_response = await test_client.get(
        f"/api/chat/thread/{thread_id}/files/content",
        params={"path": path},
        headers=admin_headers,
    )

    assert list_response.status_code == 404
    assert content_response.status_code == 404


async def test_thread_artifact_uses_image_signature_for_content_type(test_client, admin_headers):
    thread_id = await _create_thread_for_user(test_client, admin_headers)
    image = Image.new("RGBA", (2, 2), (255, 255, 255, 0))

    with io.BytesIO() as buffer:
        image.save(buffer, format="PNG")
        image_bytes = buffer.getvalue()

    upload_response = await test_client.post(
        "/api/chat/attachments/tmp",
        headers=admin_headers,
        files={"file": ("mislabeled.jpg", image_bytes, "image/jpeg")},
    )

    assert upload_response.status_code == 200, upload_response.text
    uploaded = upload_response.json()
    confirm_response = await test_client.post(
        f"/api/chat/thread/{thread_id}/attachments/confirm",
        headers=admin_headers,
        json={
            "attachments": [
                {
                    "file_type": uploaded.get("file_type"),
                    "object_name": uploaded["object_name"],
                }
            ]
        },
    )
    assert confirm_response.status_code == 200, confirm_response.text
    attachment = confirm_response.json()["attachments"][0]

    artifact_response = await test_client.get(attachment["original_artifact_url"], headers=admin_headers)

    assert artifact_response.status_code == 200, artifact_response.text
    assert artifact_response.headers["content-type"].startswith("image/png")
    assert artifact_response.content.startswith(b"\x89PNG\r\n\x1a\n")


async def test_thread_artifact_preview_http_preserves_raw_download(test_client, standard_user):
    headers = standard_user["headers"]
    thread_id = await _create_thread_for_user(test_client, headers)
    content = b"# artifact preview\n"
    artifact_path = await _upload_project_file(
        test_client,
        headers,
        thread_id,
        f"preview-{uuid.uuid4().hex[:8]}.md",
        content,
        artifact_path=True,
    )
    artifact_url = f"/api/chat/thread/{thread_id}/artifacts/{artifact_path.lstrip('/')}"

    preview_response = await test_client.get(
        artifact_url,
        params={"preview": "true"},
        headers=headers,
    )
    assert preview_response.status_code == 200, preview_response.text
    assert preview_response.headers["content-type"].startswith("application/json")
    assert preview_response.json() == {
        "content": content.decode(),
        "preview_type": "markdown",
        "supported": True,
        "message": None,
        "truncated": False,
        "limit": 250_000,
    }

    raw_response = await test_client.get(artifact_url, headers=headers)
    assert raw_response.status_code == 200, raw_response.text
    assert raw_response.content == content
    assert raw_response.headers["content-type"].startswith("text/markdown")


async def _create_thread_for_user(test_client, headers: dict[str, str]) -> str:
    agents_resp = await test_client.get("/api/agent", headers=headers)
    assert agents_resp.status_code == 200, agents_resp.text
    agents = agents_resp.json().get("agents", [])
    if not agents:
        pytest.skip("No agents available for chat router integration tests.")

    agent_id = agents[0].get("agent_id") or agents[0].get("slug")
    if not agent_id:
        pytest.skip("Agent payload missing slug field.")

    create_resp = await test_client.post(
        "/api/chat/thread",
        json={
            "agent_id": agent_id,
            "title": make_test_conversation_title("chat-router"),
            "metadata": make_test_conversation_metadata("chat-router"),
        },
        headers=headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    payload = create_resp.json()
    thread_id = payload.get("thread_id") or payload.get("id")
    assert thread_id, f"Create thread response missing thread identifier: {payload}"
    return thread_id


async def test_thread_tool_approval_mode_is_saved_in_conversation_metadata(test_client, admin_headers):
    thread_id = await _create_thread_for_user(test_client, admin_headers)

    update_response = await test_client.put(
        f"/api/chat/thread/{thread_id}",
        headers=admin_headers,
        json={"tool_approval_mode": "always_trust"},
    )

    assert update_response.status_code == 200, update_response.text
    assert update_response.json()["metadata"]["tool_approval_mode"] == "always_trust"

    list_response = await test_client.get("/api/chat/threads", headers=admin_headers)
    assert list_response.status_code == 200, list_response.text
    thread = next(item for item in list_response.json() if item["id"] == thread_id)
    assert thread["metadata"]["tool_approval_mode"] == "always_trust"


async def test_thread_tool_approval_mode_rejects_unknown_value(test_client, admin_headers):
    thread_id = await _create_thread_for_user(test_client, admin_headers)

    response = await test_client.put(
        f"/api/chat/thread/{thread_id}",
        headers=admin_headers,
        json={"tool_approval_mode": "unknown"},
    )

    assert response.status_code == 422, response.text


async def test_thread_list_exposes_thread_status(test_client, admin_headers):
    thread_id = await _create_thread_for_user(test_client, admin_headers)

    list_response = await test_client.get("/api/chat/threads", headers=admin_headers)
    assert list_response.status_code == 200, list_response.text
    thread = next(item for item in list_response.json() if item["id"] == thread_id)
    assert thread["thread_status"] in {"done", "ready", "loading"}


async def test_mark_thread_viewed_returns_thread_status(test_client, admin_headers):
    thread_id = await _create_thread_for_user(test_client, admin_headers)

    response = await test_client.post(f"/api/chat/thread/{thread_id}/viewed", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["thread_status"] in {"done", "ready", "loading"}


async def test_mark_thread_viewed_requires_ownership(test_client, standard_user, admin_headers):
    headers = standard_user["headers"]
    thread_id = await _create_thread_for_user(test_client, headers)

    response = await test_client.post(f"/api/chat/thread/{thread_id}/viewed", headers=admin_headers)
    assert response.status_code == 404, response.text


async def test_admin_can_read_default_agent(test_client, admin_headers):
    response = await test_client.get("/api/agent/default", headers=admin_headers)
    assert response.status_code == 200, response.text
    agent = response.json()["agent"]
    assert agent["is_default"] is True
    assert agent["agent_id"]


async def test_agent_detail_filters_configurable_items_by_role(
    test_client,
    admin_headers,
    standard_user,
):
    agents_response = await test_client.get("/api/agent", headers=standard_user["headers"])
    assert agents_response.status_code == 200, agents_response.text
    agents = agents_response.json().get("agents", [])
    if not agents:
        pytest.skip("No agents are registered in the system.")

    agent_id = agents[0].get("agent_id") or agents[0].get("slug")
    if not agent_id:
        pytest.skip("Agent payload missing slug field.")

    user_agent_response = await test_client.get(f"/api/agent/{agent_id}", headers=standard_user["headers"])
    assert user_agent_response.status_code == 200, user_agent_response.text
    user_items = user_agent_response.json()["agent"].get("configurable_items", {})
    assert "summary_threshold" not in user_items
    assert "summary_keep_messages" not in user_items
    assert "summary_prompt" not in user_items
    assert "summary_tool_result_token_limit" not in user_items
    assert "max_execution_steps" not in user_items

    admin_agent_response = await test_client.get(f"/api/agent/{agent_id}", headers=admin_headers)
    assert admin_agent_response.status_code == 200, admin_agent_response.text
    admin_items = admin_agent_response.json()["agent"].get("configurable_items", {})
    assert "summary_threshold" in admin_items
    assert "summary_keep_messages" in admin_items
    assert "summary_prompt" in admin_items
    assert "summary_tool_result_token_limit" in admin_items
    assert "max_execution_steps" in admin_items


async def test_setting_default_agent_requires_admin(test_client, admin_headers, standard_user):
    agents_response = await test_client.get("/api/agent", headers=admin_headers)
    assert agents_response.status_code == 200, agents_response.text
    agents = agents_response.json().get("agents", [])

    if not agents:
        pytest.skip("No agents are registered in the system.")

    candidate_agent_id = agents[0].get("agent_id") or agents[0].get("slug")
    if not candidate_agent_id:
        pytest.skip("Agent payload missing slug field.")

    forbidden_response = await test_client.post(
        f"/api/agent/{candidate_agent_id}/set_default",
        headers=standard_user["headers"],
    )
    assert forbidden_response.status_code == 403

    update_response = await test_client.post(
        f"/api/agent/{candidate_agent_id}/set_default",
        headers=admin_headers,
    )
    assert update_response.status_code == 200, update_response.text
    agent = update_response.json()["agent"]
    assert agent["agent_id"] == candidate_agent_id
    assert agent["is_default"] is True


async def test_save_thread_artifact_to_workspace_copies_output_file(test_client, standard_user):
    headers = standard_user["headers"]
    thread_id = await _create_thread_for_user(test_client, headers)
    filename = f"artifact-{uuid.uuid4().hex[:8]}.md"
    source_path = await _upload_project_file(
        test_client,
        headers,
        thread_id,
        filename,
        b"# artifact\n",
        artifact_path=True,
    )

    response = await test_client.post(
        f"/api/chat/thread/{thread_id}/artifacts/save",
        json={"path": source_path, "destination_path": "/saved_artifacts"},
        headers=headers,
    )
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload["name"] == filename
    assert payload["source_path"] == source_path
    assert payload["saved_path"] == f"/home/gem/user-data/saved_artifacts/{filename}"

    download_response = await test_client.get(payload["saved_artifact_url"], headers=headers)
    assert download_response.status_code == 200, download_response.text
    assert download_response.text == "# artifact\n"


async def test_save_thread_artifact_to_selected_workspace_directory(test_client, standard_user):
    headers = standard_user["headers"]
    thread_id = await _create_thread_for_user(test_client, headers)
    filename = f"artifact-{uuid.uuid4().hex[:8]}.md"
    source_path = await _upload_project_file(
        test_client,
        headers,
        thread_id,
        filename,
        b"# selected destination\n",
        artifact_path=True,
    )
    destination_name = f"exports-{uuid.uuid4().hex[:8]}"
    directory = await test_client.post(
        "/api/workspace/directory",
        json={"parent_path": "/", "name": destination_name},
        headers=headers,
    )
    assert directory.status_code == 200, directory.text

    response = await test_client.post(
        f"/api/chat/thread/{thread_id}/artifacts/save",
        json={"path": source_path, "destination_path": f"/{destination_name}"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["saved_path"] == f"/home/gem/user-data/{destination_name}/{filename}"

    download_response = await test_client.get(payload["saved_artifact_url"], headers=headers)
    assert download_response.status_code == 200, download_response.text
    assert download_response.text == "# selected destination\n"


async def test_save_thread_artifact_to_workspace_auto_renames_conflicts(test_client, standard_user):
    headers = standard_user["headers"]
    thread_id = await _create_thread_for_user(test_client, headers)
    filename = f"artifact-{uuid.uuid4().hex[:8]}.txt"
    renamed_filename = filename.replace(".txt", " (1).txt")

    source_path = await _upload_project_file(
        test_client,
        headers,
        thread_id,
        filename,
        b"first\n",
        artifact_path=True,
    )

    directory = await test_client.post(
        "/api/viewer/filesystem/directory",
        json={"thread_id": thread_id, "parent_path": "/", "name": "second-source"},
        headers=headers,
    )
    assert directory.status_code == 200, directory.text
    second_source_path = await _upload_project_file(
        test_client,
        headers,
        thread_id,
        filename,
        b"second\n",
        parent_path=directory.json()["entry"]["path"],
        artifact_path=True,
    )
    save_url = f"/api/chat/thread/{thread_id}/artifacts/save"
    first_response, second_response = await asyncio.gather(
        test_client.post(save_url, json={"path": source_path}, headers=headers),
        test_client.post(save_url, json={"path": second_source_path}, headers=headers),
    )
    assert first_response.status_code == 200, first_response.text
    assert second_response.status_code == 200, second_response.text

    first_payload = first_response.json()
    second_payload = second_response.json()
    assert {first_payload["saved_path"], second_payload["saved_path"]} == {
        f"/home/gem/user-data/saved_artifacts/{filename}",
        f"/home/gem/user-data/saved_artifacts/{renamed_filename}",
    }

    first_download = await test_client.get(first_payload["saved_artifact_url"], headers=headers)
    second_download = await test_client.get(second_payload["saved_artifact_url"], headers=headers)
    assert {first_download.content, second_download.content} == {b"first\n", b"second\n"}


async def test_save_thread_artifact_to_workspace_rejects_invalid_paths(test_client, standard_user):
    headers = standard_user["headers"]
    thread_id = await _create_thread_for_user(test_client, headers)

    invalid_response = await test_client.post(
        f"/api/chat/thread/{thread_id}/artifacts/save",
        json={"path": "/home/gem/user-data/not-allowed/demo.txt"},
        headers=headers,
    )
    assert invalid_response.status_code == 404, invalid_response.text

    directory = await test_client.post(
        "/api/viewer/filesystem/directory",
        json={"thread_id": thread_id, "parent_path": "/", "name": "nested-dir"},
        headers=headers,
    )
    assert directory.status_code == 200, directory.text
    child_path = await _upload_project_file(
        test_client,
        headers,
        thread_id,
        "child.txt",
        b"child",
        parent_path=directory.json()["entry"]["path"],
        artifact_path=True,
    )
    directory_path = str(PurePosixPath(child_path).parent)
    directory_response = await test_client.post(
        f"/api/chat/thread/{thread_id}/artifacts/save",
        json={"path": directory_path},
        headers=headers,
    )
    assert directory_response.status_code == 400, directory_response.text
