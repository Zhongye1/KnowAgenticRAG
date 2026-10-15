"""无外部密钥地验证 shipping API、worker、SSE 与 PostgreSQL 因果链。"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import uuid

import asyncpg
import httpx
import pytest

from e2e_helpers import cancel_run, consume_events, delete_agent, postgres_dsn, wait_for_run
from test.live_api_cleanup import make_test_conversation_metadata, make_test_conversation_title
from ars.agents.backends.sandbox import ProvisionerSandboxBackend, get_sandbox_provider
from ars.workspace.paths import workspace_uid_dirname
from ars.config import get_skill_projection_dir

pytestmark = [pytest.mark.asyncio, pytest.mark.e2e, pytest.mark.slow]

EXPECTED_OUTPUT = "DETERMINISTIC_AGENT_E2E_OK"
EXPECTED_PRELOADED_SKILL_MARKER = "# 图片生成技能"
EXPECTED_PRELOADED_TOOL = "present_artifacts"
EXPECTED_TOOL_CALL_ID = "call-preloaded-tool"
PROVIDER_ID = "ci-replay"
MODEL_SPEC = f"{PROVIDER_ID}:deterministic-chat"


async def test_replay_rejects_requests_outside_deterministic_contract() -> None:
    valid_body = {
        "model": "deterministic-chat",
        "stream": True,
        "messages": [
            {"role": "system", "content": EXPECTED_PRELOADED_SKILL_MARKER},
            {"role": "user", "content": EXPECTED_OUTPUT},
        ],
        "tools": [{"type": "function", "function": {"name": EXPECTED_PRELOADED_TOOL}}],
    }
    cases = [
        ({}, valid_body, "invalid_authorization"),
        (
            {"Authorization": "Bearer ci-replay-key"},
            {**valid_body, "model": "other-model"},
            "invalid_model",
        ),
        (
            {"Authorization": "Bearer ci-replay-key"},
            {**valid_body, "stream": False},
            "stream_required",
        ),
        (
            {"Authorization": "Bearer ci-replay-key"},
            {**valid_body, "messages": [{"role": "user", "content": "wrong"}]},
            "expected_input_missing",
        ),
        (
            {"Authorization": "Bearer ci-replay-key"},
            {
                **valid_body,
                "messages": [{"role": "user", "content": EXPECTED_OUTPUT}],
            },
            "preloaded_skill_missing",
        ),
        (
            {"Authorization": "Bearer ci-replay-key"},
            {**valid_body, "tools": []},
            "preloaded_tool_missing",
        ),
        (
            {"Authorization": "Bearer ci-replay-key"},
            {
                **valid_body,
                "messages": [
                    *valid_body["messages"],
                    {
                        "role": "tool",
                        "tool_call_id": EXPECTED_TOOL_CALL_ID,
                        "content": "unexpected result",
                    },
                ],
            },
            "tool_execution_result_missing",
        ),
    ]

    async with httpx.AsyncClient(base_url="http://localhost:8765", timeout=5) as client:
        for headers, body, expected_error in cases:
            response = await client.post("/v1/chat/completions", headers=headers, json=body)
            assert response.status_code == 422, response.text
            assert response.json() == {"error": expected_error}


async def _create_provider(client: httpx.AsyncClient, headers: dict[str, str]) -> None:
    response = await client.post(
        "/api/system/model-providers",
        json={
            "provider_id": PROVIDER_ID,
            "display_name": "CI deterministic replay",
            "provider_type": "openai",
            "base_url": "http://api:8765/v1",
            "api_key": "ci-replay-key",
            "capabilities": ["chat"],
            "enabled_models": [
                {
                    "id": "deterministic-chat",
                    "display_name": "Deterministic chat",
                    "type": "chat",
                    "source": "manual",
                }
            ],
            "is_enabled": True,
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["provider_id"] == PROVIDER_ID


async def _delete_provider(client: httpx.AsyncClient, headers: dict[str, str]) -> None:
    response = await client.delete(f"/api/system/model-providers/{PROVIDER_ID}", headers=headers)
    assert response.status_code in {200, 404}, response.text


async def _run_deterministic(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    *,
    agent_slug: str,
    thread_id: str,
    attachment_file_ids: list[str] | None = None,
) -> dict:
    """提交无外部模型依赖的真实 worker Run 并等待终态。"""
    request_id = f"deterministic-hydrate-{uuid.uuid4()}"
    response = await client.post(
        "/api/agent/runs",
        json={
            "query": f"只输出 {EXPECTED_OUTPUT}",
            "agent_slug": agent_slug,
            "thread_id": thread_id,
            "meta": {
                "request_id": request_id,
                "attachment_file_ids": attachment_file_ids or [],
            },
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    run = await wait_for_run(client, headers, str(response.json()["run_id"]))
    assert run["status"] == "completed", run
    return run


async def _create_agent(client: httpx.AsyncClient, headers: dict[str, str], uid: str) -> str:
    slug = f"ci-deterministic-{uuid.uuid4().hex[:8]}"
    response = await client.post(
        "/api/agent",
        json={
            "name": f"Deterministic E2E {slug[-8:]}",
            "slug": slug,
            "backend_id": "ChatbotAgent",
            "description": "无外部密钥的 assembled-path 测试智能体",
            "config_json": {
                "context": {
                    "model": MODEL_SPEC,
                    "system_prompt": f"不要调用工具，只输出 {EXPECTED_OUTPUT}。",
                    "tools": [],
                    "knowledges": [],
                    "mcps": [],
                    "skills": ["image-gen"],
                    "preload_skills": ["image-gen"],
                    "subagents": [],
                }
            },
            "share_config": {
                "version": 2,
                "read_scope": {
                    "access_level": "user",
                    "department_ids": [],
                    "user_uids": [uid],
                },
                "manage_scope": None,
            },
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["agent"]["slug"] == slug
    return slug


async def _assert_persisted_causality(run_id: str, request_id: str) -> None:
    conn = await asyncpg.connect(postgres_dsn())
    try:
        row = await conn.fetchrow(
            """
            SELECT ar.status, ar.request_id, ar.output_message_id,
                   message.run_id AS output_run_id,
                   message.request_id AS output_request_id,
                   message.content AS output_content
            FROM agent_runs ar
            LEFT JOIN messages message ON message.id = ar.output_message_id
            WHERE ar.id = $1
            """,
            run_id,
        )
        assert row, f"agent_runs row missing for {run_id}"
        assert row["status"] == "completed"
        assert row["request_id"] == request_id
        assert row["output_message_id"] is not None
        assert row["output_run_id"] == run_id
        assert row["output_request_id"] == request_id
        assert row["output_content"] == EXPECTED_OUTPUT

        tool_call = await conn.fetchrow(
            """
            SELECT tc.langgraph_tool_call_id, tc.tool_name, tc.status, tc.tool_output
            FROM tool_calls tc
            JOIN messages message ON message.id = tc.message_id
            WHERE message.run_id = $1
            """,
            run_id,
        )
        assert tool_call, "预加载工具必须经过真实 ToolNode 执行并持久化"
        assert tool_call["langgraph_tool_call_id"] == EXPECTED_TOOL_CALL_ID
        assert tool_call["tool_name"] == EXPECTED_PRELOADED_TOOL
        assert tool_call["status"] == "success"
        assert tool_call["tool_output"]
    finally:
        await conn.close()


async def _assert_persistent_workdir_binding(run_id: str, thread_id: str) -> None:
    """Run 复用 Conversation 的 UserWorkspace Workdir 与线程运行域。"""
    conn = await asyncpg.connect(postgres_dsn())
    try:
        row = await conn.fetchrow(
            """
            SELECT project.workdir_path,
                   run.runtime_scope_id
            FROM conversations conversation
            JOIN projects project ON project.id = conversation.project_id AND project.uid = conversation.uid
            JOIN agent_runs run ON run.id = $1
            WHERE conversation.thread_id = $2
            """,
            run_id,
            thread_id,
        )
        assert row, f"workdir binding missing for {thread_id}"
        assert str(row["workdir_path"]).startswith("projects/")
        assert row["runtime_scope_id"] == thread_id
    finally:
        await conn.close()


async def _assert_persisted_execution_facts(run_id: str, agent_slug: str) -> None:
    """真实 worker 链路固化后的 manifest 指纹与 attempt 终止事实。"""
    conn = await asyncpg.connect(postgres_dsn())
    try:
        row = await conn.fetchrow(
            """
            SELECT manifest, manifest_fingerprint, manifest_recorded_at, started_at
            FROM agent_runs
            WHERE id = $1
            """,
            run_id,
        )
        assert row, f"agent_runs row missing for {run_id}"
        raw_manifest = row["manifest"]
        manifest = json.loads(raw_manifest) if isinstance(raw_manifest, str) else raw_manifest
        assert manifest is not None, "执行完成的 Run 必须已固化运行清单"
        assert manifest["manifest_version"] == 1
        assert manifest["agent"] == {"slug": agent_slug, "backend_id": "ChatbotAgent"}
        assert manifest["model"] == {"spec": MODEL_SPEC}
        assert len(manifest["resources"]["skills"]) == 1
        assert manifest["resources"]["skills"][0]["slug"] == "image-gen"
        assert manifest["resources"]["skills"][0]["content_hash"]
        assert row["manifest_recorded_at"] is not None
        assert row["manifest_recorded_at"] >= row["started_at"]

        serialized = json.dumps(manifest, ensure_ascii=False)
        # 用户正文、prompt 与 provider 密钥不得进入 manifest 直接字段。
        assert EXPECTED_OUTPUT not in serialized
        assert "不要调用工具" not in serialized
        assert "ci-replay-key" not in serialized
        assert EXPECTED_PRELOADED_SKILL_MARKER not in serialized
        assert len(manifest["config_digest"]) == 64

        expected_fingerprint = hashlib.sha256(
            json.dumps(manifest, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        assert row["manifest_fingerprint"] == expected_fingerprint

        attempts = await conn.fetch(
            """
            SELECT attempt_no, worker_id, outcome, finished_at
            FROM agent_run_attempts
            WHERE run_id = $1
            ORDER BY attempt_no
            """,
            run_id,
        )
        assert attempts, "completed Run 必须有执行占有事实"
        assert attempts[-1]["outcome"] == "completed"
        assert all(attempt["finished_at"] is not None for attempt in attempts)
        assert [attempt["attempt_no"] for attempt in attempts] == list(range(1, len(attempts) + 1))
    finally:
        await conn.close()


async def test_deterministic_agent_path_reaches_persisted_result(
    e2e_client: httpx.AsyncClient,
    e2e_headers: dict[str, str],
) -> None:
    me_response = await e2e_client.get("/api/auth/me", headers=e2e_headers)
    assert me_response.status_code == 200, me_response.text
    uid = str(me_response.json()["uid"])

    await _create_provider(e2e_client, e2e_headers)
    agent_slug: str | None = None
    thread_id: str | None = None
    run_id: str | None = None
    run_completed = False
    try:
        agent_slug = await _create_agent(e2e_client, e2e_headers, uid)
        projection_root = get_skill_projection_dir() / workspace_uid_dirname(uid)
        shutil.rmtree(projection_root, ignore_errors=True)
        assert not projection_root.exists(), "冷启动用例必须从缺失 uid Skill projection 开始"
        request_id = f"deterministic-e2e-{uuid.uuid4()}"
        run_response = await e2e_client.post(
            "/api/agent-invocation/agent-call/runs",
            json={
                "agent_slug": agent_slug,
                "messages": [{"role": "user", "content": f"只输出 {EXPECTED_OUTPUT}"}],
                "request_id": request_id,
                "async_mode": True,
            },
            headers=e2e_headers,
        )
        assert run_response.status_code == 200, run_response.text
        run_payload = run_response.json()
        run_id = str(run_payload["run_id"])
        thread_id = str(run_payload["thread_id"])

        event_counts = await consume_events(e2e_client, e2e_headers, run_id)
        assert event_counts.get("messages", 0) > 0, event_counts
        assert event_counts.get("end", 0) == 1, event_counts

        run = await wait_for_run(e2e_client, e2e_headers, run_id)
        assert run["status"] == "completed", run
        assert run["request_id"] == request_id
        assert projection_root.is_dir(), "worker bootstrap 必须在首次 Sandbox 创建前物化 uid projection"

        result = await e2e_client.get(f"/api/agent/runs/{run_id}/result", headers=e2e_headers)
        assert result.status_code == 200, result.text
        assert result.json()["output"] == EXPECTED_OUTPUT
        assert result.json()["request_id"] == request_id
        assert result.json()["thread_id"] == thread_id

        await _assert_persisted_causality(run_id, request_id)
        await _assert_persistent_workdir_binding(run_id, thread_id)
        await _assert_persisted_execution_facts(run_id, agent_slug)
        run_completed = True
    finally:
        if run_id and not run_completed:
            await cancel_run(e2e_client, e2e_headers, run_id)
        if thread_id:
            thread_delete = await e2e_client.delete(f"/api/chat/thread/{thread_id}", headers=e2e_headers)
            assert thread_delete.status_code in {200, 404}, thread_delete.text
        if agent_slug:
            await delete_agent(e2e_client, e2e_headers, agent_slug)
        await _delete_provider(e2e_client, e2e_headers)


async def test_attachment_is_written_to_user_workspace_workdir_and_survives_runtime_recreation(
    e2e_client: httpx.AsyncClient,
    e2e_headers: dict[str, str],
) -> None:
    me_response = await e2e_client.get("/api/auth/me", headers=e2e_headers)
    assert me_response.status_code == 200, me_response.text
    uid = str(me_response.json()["uid"])
    await _create_provider(e2e_client, e2e_headers)

    agent_slug: str | None = None
    thread_id: str | None = None
    workdir_path: str | None = None
    try:
        agent_slug = await _create_agent(e2e_client, e2e_headers, uid)
        thread_response = await e2e_client.post(
            "/api/chat/thread",
            json={
                "agent_id": agent_slug,
                "title": make_test_conversation_title("attachment-workdir"),
                "metadata": make_test_conversation_metadata("attachment-workdir", e2e=True),
            },
            headers=e2e_headers,
        )
        assert thread_response.status_code == 200, thread_response.text
        thread_payload = thread_response.json()
        thread_id = str(thread_payload.get("thread_id") or thread_payload["id"])
        workdir_path = str(thread_payload["workdir_path"])

        expected_content = f"sandbox hydrate {uuid.uuid4()}\n"
        file_name = f"hydrate-{uuid.uuid4().hex[:8]}.txt"
        upload_response = await e2e_client.post(
            "/api/chat/attachments/tmp",
            files={"file": (file_name, expected_content.encode(), "text/plain")},
            headers=e2e_headers,
        )
        assert upload_response.status_code == 200, upload_response.text
        uploaded = upload_response.json()
        confirm_response = await e2e_client.post(
            f"/api/chat/thread/{thread_id}/attachments/confirm",
            json={
                "attachments": [
                    {
                        "file_type": uploaded.get("file_type"),
                        "object_name": uploaded["object_name"],
                    }
                ]
            },
            headers=e2e_headers,
        )
        assert confirm_response.status_code == 200, confirm_response.text
        attachment = confirm_response.json()["attachments"][0]
        attachment_path = str(attachment["original_path"])
        assert attachment_path.startswith(f"/home/gem/user-data/{workdir_path}/uploads/"), attachment

        sandbox = ProvisionerSandboxBackend(thread_id=thread_id, uid=uid, workdir_path=workdir_path)
        uploaded_read = sandbox.read(attachment_path)
        assert uploaded_read.error is None, uploaded_read
        assert uploaded_read.file_data == {"content": expected_content.rstrip(), "encoding": "utf-8"}
        overwritten_content = f"agent overwrite {uuid.uuid4()}"
        overwrite_result = sandbox.edit(
            attachment_path,
            expected_content.rstrip(),
            overwritten_content,
        )
        assert overwrite_result.error is None, overwrite_result
        live_artifact = await e2e_client.get(attachment["original_artifact_url"], headers=e2e_headers)
        assert live_artifact.status_code == 200, live_artifact.text
        assert live_artifact.text.strip() == overwritten_content

        await _run_deterministic(
            e2e_client,
            e2e_headers,
            agent_slug=agent_slug,
            thread_id=thread_id,
            attachment_file_ids=[str(attachment["file_id"])],
        )

        read_result = sandbox.read(attachment_path)
        assert read_result.error is None, read_result
        assert read_result.file_data == {"content": overwritten_content, "encoding": "utf-8"}

        get_sandbox_provider().release(thread_id, uid=uid, workdir_path=workdir_path)
        await asyncio.sleep(int(os.getenv("SANDBOX_KEEPALIVE_INTERVAL_SECONDS", "30")) + 1)
        await _run_deterministic(
            e2e_client,
            e2e_headers,
            agent_slug=agent_slug,
            thread_id=thread_id,
        )
        sandbox = ProvisionerSandboxBackend(thread_id=thread_id, uid=uid, workdir_path=workdir_path)
        recreated_read = sandbox.read(attachment_path)
        assert recreated_read.error is None, recreated_read
        assert recreated_read.file_data == {"content": overwritten_content, "encoding": "utf-8"}

        delete_response = await e2e_client.delete(
            f"/api/chat/thread/{thread_id}/attachments/{attachment['file_id']}",
            headers=e2e_headers,
        )
        assert delete_response.status_code == 200, delete_response.text
        await _run_deterministic(
            e2e_client,
            e2e_headers,
            agent_slug=agent_slug,
            thread_id=thread_id,
        )
        missing_result = sandbox.read(attachment_path)
        assert missing_result.file_data is None
        assert missing_result.error and "does not exist" in missing_result.error.lower()
    finally:
        if thread_id:
            try:
                get_sandbox_provider().release(thread_id, uid=uid, workdir_path=workdir_path)
            except Exception:
                pass
            thread_delete = await e2e_client.delete(f"/api/chat/thread/{thread_id}", headers=e2e_headers)
            assert thread_delete.status_code in {200, 404}, thread_delete.text
        if agent_slug:
            await delete_agent(e2e_client, e2e_headers, agent_slug)
        await _delete_provider(e2e_client, e2e_headers)
