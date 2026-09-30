from __future__ import annotations

from pathlib import Path

import httpx
import pytest
from test.live_api_cleanup import make_test_conversation_metadata, make_test_conversation_title

pytestmark = [pytest.mark.asyncio, pytest.mark.e2e, pytest.mark.slow]


async def _create_thread(client: httpx.AsyncClient, headers: dict[str, str], agent_id: str) -> str:
    response = await client.post(
        "/api/chat/thread",
        json={
            "agent_id": agent_id,
            "title": make_test_conversation_title("attachment-state-e2e"),
            "metadata": make_test_conversation_metadata("attachment-state-e2e", e2e=True),
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    thread_id = payload.get("thread_id") or payload.get("id")
    assert thread_id, payload
    return str(thread_id)


async def _upload_attachment(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    *,
    thread_id: str,
    file_path: Path,
) -> dict:
    with file_path.open("rb") as handle:
        upload_response = await client.post(
            "/api/chat/attachments/tmp",
            files={"file": (file_path.name, handle)},
            headers=headers,
        )
    assert upload_response.status_code == 200, upload_response.text
    uploaded = upload_response.json()
    confirm_response = await client.post(
        f"/api/chat/thread/{thread_id}/attachments/confirm",
        json={
            "attachments": [
                {
                    "file_type": uploaded.get("file_type"),
                    "object_name": uploaded["object_name"],
                }
            ]
        },
        headers=headers,
    )
    assert confirm_response.status_code == 200, confirm_response.text
    return dict(confirm_response.json()["attachments"][0])


async def _list_attachments(client: httpx.AsyncClient, headers: dict[str, str], *, thread_id: str) -> list[dict]:
    response = await client.get(f"/api/chat/thread/{thread_id}/attachments", headers=headers)
    assert response.status_code == 200, response.text
    return list(response.json().get("attachments") or [])


async def test_attachment_confirm_is_reflected_in_thread_metadata(
    tmp_path: Path,
    e2e_client: httpx.AsyncClient,
    e2e_headers: dict[str, str],
    e2e_agent_context: dict[str, str | int],
):
    agent_slug = str(e2e_agent_context["agent_slug"])
    thread_id = await _create_thread(e2e_client, e2e_headers, agent_slug)

    test_file = tmp_path / "attachment-state.md"
    test_file.write_text(
        "# 测试文档\n\n这是一个用于附件状态验证的 Markdown 文件。\n\n- 第一点\n- 第二点\n",
        encoding="utf-8",
    )

    attachment_payload = await _upload_attachment(
        e2e_client,
        e2e_headers,
        thread_id=thread_id,
        file_path=test_file,
    )
    attachments = await _list_attachments(e2e_client, e2e_headers, thread_id=thread_id)
    attachment_names = {item.get("file_name") for item in attachments}
    assert test_file.name in attachment_names, attachments
    assert attachment_payload.get("file_name") == test_file.name, attachment_payload

    assert attachment_payload["original_path"].endswith(test_file.name)
