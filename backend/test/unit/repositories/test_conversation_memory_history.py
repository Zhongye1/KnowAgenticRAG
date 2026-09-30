from __future__ import annotations

import json

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.repositories.conversation_repository import (
    MEMORY_HISTORY_READ_RESPONSE_MAX_BYTES,
    ConversationRepository,
)
from ars.storage.postgres.models_business import Base, Conversation, Message, SubagentThread, ToolCall

pytestmark = pytest.mark.unit


@pytest_asyncio.fixture()
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        yield db
    await engine.dispose()


async def _conversation(db, *, thread_id: str, uid: str = "user-1", metadata: dict | None = None):
    conversation = Conversation(
        thread_id=thread_id,
        project_id=f"project-{thread_id}",
        uid=uid,
        agent_id="main",
        status="active",
        extra_metadata=metadata,
    )
    db.add(conversation)
    await db.flush()
    return conversation


async def test_memory_search_excludes_hidden_subagent_and_non_user_messages(session):
    visible = await _conversation(session, thread_id="visible")
    other = await _conversation(session, thread_id="other", uid="user-2")
    invocation = await _conversation(session, thread_id="invocation", metadata={"source": "agent_call"})
    parent = await _conversation(session, thread_id="parent")
    child = await _conversation(session, thread_id="child")
    session.add(
        SubagentThread(
            uid="user-1",
            parent_conversation_id=parent.id,
            child_conversation_id=child.id,
            child_thread_id="child",
            subagent_slug="worker",
            created_by_run_id="run-parent",
        )
    )
    session.add_all(
        [
            Message(conversation_id=visible.id, role="user", content="needle visible", message_type="text"),
            Message(conversation_id=visible.id, role="tool", content="needle tool", message_type="text"),
            Message(conversation_id=visible.id, role="assistant", content="needle result", message_type="tool_result"),
            Message(conversation_id=other.id, role="user", content="needle other", message_type="text"),
            Message(conversation_id=invocation.id, role="user", content="needle invocation", message_type="text"),
            Message(conversation_id=child.id, role="assistant", content="needle child", message_type="text"),
        ]
    )
    await session.commit()

    result = await ConversationRepository(session).search_memory_messages(uid="user-1", query="needle")

    assert [item["thread_id"] for item in result["items"]] == ["visible"]
    assert result["items"][0]["content"] == "needle visible"
    assert "truncated" not in result["items"][0]
    assert "truncated" not in result
    assert set(result["items"][0]) == {"thread_id", "title", "message_id", "role", "content"}


async def test_memory_read_uses_allowlist_and_only_explicit_toolcall_table(session):
    conversation = await _conversation(session, thread_id="visible")
    assistant = Message(
        conversation_id=conversation.id,
        role="assistant",
        content="safe assistant",
        message_type="text",
        extra_metadata={"tool_calls": [{"args": {"secret": "METADATA-SECRET"}}]},
        image_content="IMAGE-SECRET",
    )
    session.add_all(
        [
            Message(conversation_id=conversation.id, role="user", content="safe user", message_type="text"),
            assistant,
            Message(conversation_id=conversation.id, role="tool", content="TOOL-ROLE-SECRET", message_type="text"),
            Message(
                conversation_id=conversation.id,
                role="assistant",
                content="TOOL-TYPE-SECRET",
                message_type="tool_result",
            ),
        ]
    )
    await session.flush()
    session.add(
        ToolCall(
            message_id=assistant.id,
            langgraph_tool_call_id="call-1",
            tool_name="secret_tool",
            tool_input={"secret": "TOOLCALL-INPUT"},
            tool_output="TOOLCALL-OUTPUT",
            status="success",
        )
    )
    await session.commit()
    repository = ConversationRepository(session)

    default_result = await repository.read_memory_messages(uid="user-1", thread_id="visible")
    explicit_result = await repository.read_memory_messages(
        uid="user-1",
        thread_id="visible",
        include_tools=True,
    )

    default_json = json.dumps(default_result, ensure_ascii=False)
    explicit_json = json.dumps(explicit_result, ensure_ascii=False)
    assert [item["content"] for item in default_result["messages"]] == ["safe user", "safe assistant"]
    assert default_result["tool_calls"] == []
    assert "truncated" not in default_result
    assert all(set(item) == {"message_id", "role", "content"} for item in default_result["messages"])
    assert "METADATA-SECRET" not in default_json
    assert "IMAGE-SECRET" not in default_json
    assert "TOOL-ROLE-SECRET" not in default_json
    assert "TOOL-TYPE-SECRET" not in default_json
    assert "METADATA-SECRET" not in explicit_json
    assert "truncated" not in explicit_result["tool_calls"][0]
    assert set(explicit_result["tool_calls"][0]) == {
        "tool_call_id",
        "name",
        "input",
        "output",
        "status",
        "error",
    }
    assert explicit_result["tool_calls"][0]["input"] == '{"secret":"TOOLCALL-INPUT"}'
    assert explicit_result["tool_calls"][0]["output"] == "TOOLCALL-OUTPUT"


async def test_memory_read_enforces_utf8_and_final_response_budget(session):
    conversation = await _conversation(session, thread_id="large")
    session.add_all(
        [
            Message(
                conversation_id=conversation.id,
                role="user" if index % 2 == 0 else "assistant",
                content="记" * 20_000,
                message_type="text",
            )
            for index in range(20)
        ]
    )
    await session.commit()

    result = await ConversationRepository(session).read_memory_messages(uid="user-1", thread_id="large")
    encoded = json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    assert len(encoded) <= MEMORY_HISTORY_READ_RESPONSE_MAX_BYTES
    assert result["truncated"] is True
    assert all(len(item["content"].encode("utf-8")) <= 8 * 1024 for item in result["messages"])
    assert len(b"".join(item["content"].encode("utf-8") for item in result["messages"])) <= 32 * 1024
