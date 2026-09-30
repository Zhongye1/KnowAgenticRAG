from __future__ import annotations

import json
import os
import uuid

import asyncpg
import pytest
from ars.services.run_queue_service import append_run_stream_event, get_redis_client

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


def _postgres_dsn() -> str:
    return os.getenv("POSTGRES_URL", "postgresql+asyncpg://postgres:postgres@postgres:5432/ars").replace(
        "+asyncpg", ""
    )


async def _collect_sse_payloads(response) -> list[tuple[str, dict, str | None]]:
    event = "message"
    event_id = None
    data_lines: list[str] = []
    payloads: list[tuple[str, dict, str | None]] = []

    async for line in response.aiter_lines():
        if not line:
            if data_lines:
                payloads.append((event, json.loads("\n".join(data_lines)), event_id))
                if event == "end":
                    return payloads
            event = "message"
            event_id = None
            data_lines = []
            continue
        if line.startswith(":"):
            continue
        if line.startswith("event:"):
            event = line.removeprefix("event:").strip() or "message"
        elif line.startswith("id:"):
            event_id = line.removeprefix("id:").strip()
        elif line.startswith("data:"):
            data_lines.append(line.removeprefix("data:").strip())

    return payloads


async def test_run_events_verbose_false_returns_compact_payload(test_client, standard_user):
    uid = str(standard_user["user"]["uid"])
    run_id = str(uuid.uuid4())
    thread_id = str(uuid.uuid4())
    request_id = f"req-{uuid.uuid4()}"

    conn = await asyncpg.connect(_postgres_dsn())
    try:
        await conn.execute(
            """
            INSERT INTO agent_runs
                (id, conversation_thread_id, agent_slug, uid, request_id, input_payload, status, run_type)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
            """,
            run_id,
            thread_id,
            "deep-research",
            uid,
            request_id,
            json.dumps({"query": "写一个冒泡排序"}, ensure_ascii=False),
            "completed",
            "chat",
        )
    finally:
        await conn.close()

    try:
        await append_run_stream_event(
            run_id,
            "metadata",
            {
                "request_id": request_id,
                "agent_slug": "deep-research",
                "backend_id": "ChatbotAgent",
                "uid": uid,
                "run_type": "chat",
                "source": "chat",
            },
            thread_id=thread_id,
        )
        await append_run_stream_event(
            run_id,
            "custom",
            {
                "name": "ars.agent_state",
                "chunk": {
                    "request_id": request_id,
                    "response": None,
                    "thread_id": thread_id,
                    "status": "agent_state",
                    "agent_state": {
                        "todos": [],
                        "files": {},
                        "artifacts": [],
                        "subagent_runs": [],
                    },
                    "meta": {"uid": uid},
                },
                "agent_state": {
                    "todos": [],
                    "files": {},
                    "artifacts": [],
                    "subagent_runs": [],
                },
            },
            thread_id=thread_id,
        )
        await append_run_stream_event(
            run_id,
            "messages",
            {
                "items": [
                    {
                        "request_id": request_id,
                        "response": "你",
                        "thread_id": thread_id,
                        "status": "loading",
                        "stream_event": {
                            "type": "tool_call",
                            "message_id": "msg-1",
                            "tool_call_id": "call-1",
                            "name": "ls",
                            "args": {"path": "/home/gem/user-data/outputs"},
                            "thread_id": thread_id,
                            "namespace": [],
                        },
                        "metadata": {
                            "langfuse_user_id": uid,
                            "langgraph_checkpoint_ns": "model:checkpoint",
                        },
                    }
                ]
            },
            thread_id=thread_id,
        )
        await append_run_stream_event(
            run_id,
            "end",
            {"status": "completed", "chunk": {"status": "finished", "request_id": request_id, "meta": {"uid": uid}}},
            thread_id=thread_id,
        )

        async with test_client.stream(
            "GET",
            f"/api/agent/runs/{run_id}/events",
            params={"verbose": "false"},
            headers=standard_user["headers"],
        ) as response:
            assert response.status_code == 200, response.text
            payloads = await _collect_sse_payloads(response)

        assert {event for event, _payload, _event_id in payloads} == {"metadata", "messages", "end"}

        metadata_event = next(item for item in payloads if item[0] == "metadata")
        assert metadata_event[1]["payload"] == {"run_type": "chat", "source": "chat"}

        message_event = next(item for item in payloads if item[0] == "messages")
        message_chunk = message_event[1]["payload"]["items"][0]
        assert message_event[1]["request_id"] == request_id
        assert message_event[2]
        assert "request_id" not in message_chunk
        assert "metadata" not in message_chunk
        assert "response" not in message_chunk
        assert "thread_id" not in message_chunk
        assert message_chunk["stream_event"]["tool_call_id"] == "call-1"
        assert "thread_id" not in message_chunk["stream_event"]
        assert "namespace" not in message_chunk["stream_event"]

        end_event = next(item for item in payloads if item[0] == "end")
        assert end_event[1]["request_id"] == request_id
        assert end_event[1]["payload"]["status"] == "completed"
        assert "request_id" not in end_event[1]["payload"]["chunk"]
        assert "meta" not in end_event[1]["payload"]["chunk"]
    finally:
        redis = await get_redis_client()
        await redis.delete(f"run:events:{run_id}")
        conn = await asyncpg.connect(_postgres_dsn())
        try:
            await conn.execute("DELETE FROM agent_runs WHERE id = $1", run_id)
        finally:
            await conn.close()
