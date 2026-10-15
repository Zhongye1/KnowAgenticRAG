from __future__ import annotations

import json
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest
from langchain.messages import AIMessageChunk, HumanMessage

from ars.services import chat_service as svc
from ars.services.input_message_service import build_chat_input_message


@pytest.fixture
def stub_system_options(monkeypatch: pytest.MonkeyPatch):
    async def get_system_options(_option, _db=None):
        return {
            "enable_content_guard": False,
            "enable_content_guard_llm": False,
            "content_guard_llm_model": "",
        }

    monkeypatch.setattr(type(svc.system_options), "get", get_system_options)


@pytest.fixture
def stub_content_guard(monkeypatch: pytest.MonkeyPatch):
    class FakeGuard:
        async def check(self, _content):
            return False

        async def check_with_keywords(self, _content):
            return False

    monkeypatch.setattr(svc.content_guard, "configured", lambda *_args: FakeGuard())


async def _fake_normalize_agent_context_config(context, **_kwargs):
    return dict(context or {})


async def _fake_save_messages_from_langgraph_state(
    *,
    agent_instance,
    thread_id,
    conv_repo,
    config_dict,
    context,
    trace_info,
    run_id=None,
    request_id=None,
    worker_id=None,
    complete_run=False,
    interrupt_run=False,
    interrupt_error_type=None,
    interrupt_error_message=None,
    token_usage=None,
):
    del agent_instance, thread_id, conv_repo, config_dict, context, trace_info
    del run_id, request_id, worker_id, interrupt_error_type, interrupt_error_message, token_usage
    return complete_run or interrupt_run


async def _fake_guard_check(_content):
    return False


async def _fake_guard_check_with_keywords(_content):
    return False


async def _fake_interrupts(agent, langgraph_config, make_chunk, meta, thread_id, context):
    if False:
        yield None
    return


def _patch_stream_scaffolding(
    monkeypatch: pytest.MonkeyPatch,
    *,
    agent,
    runtime_context: dict | None = None,
    conversation: SimpleNamespace | None = None,
    save_messages=None,
    build_run_context=None,
    get_trace_info=None,
    flush_langfuse=None,
):
    resolved_conversation = conversation or SimpleNamespace(
        id=1,
        uid="user-1",
        agent_id="test-agent",
        status="active",
        project_id="11111111-1111-4111-8111-111111111111",
        extra_metadata={},
    )
    if not hasattr(resolved_conversation, "project_id"):
        resolved_conversation.project_id = "11111111-1111-4111-8111-111111111111"

    async def fake_resolve_agent_runtime(**_kwargs):
        return (
            SimpleNamespace(slug="test-agent", backend_id="ChatbotAgent"),
            agent,
            runtime_context or {},
            resolved_conversation,
        )

    async def fake_resolve_workdir(**_kwargs):
        return "projects/11111111-1111-4111-8111-111111111111"

    monkeypatch.setattr(svc, "_resolve_agent_runtime", fake_resolve_agent_runtime)
    monkeypatch.setattr(svc, "resolve_conversation_workdir_path", fake_resolve_workdir)
    monkeypatch.setattr(svc, "normalize_agent_context_config", _fake_normalize_agent_context_config)
    monkeypatch.setattr(
        _FakeConvRepo,
        "default_attachments",
        list((resolved_conversation.extra_metadata or {}).get("attachments", [])),
    )
    monkeypatch.setattr(svc, "ConversationRepository", _FakeConvRepo)
    monkeypatch.setattr(
        svc, "save_messages_from_langgraph_state", save_messages or _fake_save_messages_from_langgraph_state
    )
    monkeypatch.setattr(svc.content_guard, "check", _fake_guard_check)
    monkeypatch.setattr(svc.content_guard, "check_with_keywords", _fake_guard_check_with_keywords)
    monkeypatch.setattr(svc, "check_and_handle_interrupts", _fake_interrupts)
    monkeypatch.setattr(svc, "get_user_skills_root_dir", lambda _uid: None)

    class FakeSandboxBackend:
        def __init__(self, **_kwargs):
            pass

        def ensure_available(self):
            return "sandbox-1"

    monkeypatch.setattr(svc, "ProvisionerSandboxBackend", FakeSandboxBackend)
    monkeypatch.setattr(
        svc,
        "_build_langfuse_run_context",
        build_run_context or (lambda **kwargs: SimpleNamespace(callbacks=[], metadata={}, tags=[], trace_id=None)),
    )
    monkeypatch.setattr(svc, "get_trace_info", get_trace_info or (lambda _run_context: {}))
    monkeypatch.setattr(svc, "flush_langfuse", flush_langfuse or (lambda: None))


class _FakeContext:
    def __init__(self):
        self.thread_id = ""
        self.uid = ""
        self.temperature = None

    def update(self, data: dict):
        for key, value in data.items():
            setattr(self, key, value)


class _FakeSession:
    def __init__(self):
        self.commit_count = 0

    async def commit(self):
        self.commit_count += 1


class _FakeConvRepo:
    default_attachments: list[dict] = []

    def __init__(self, _db):
        self.saved_messages: list[dict] = []
        self.conversations: dict[str, SimpleNamespace] = {}

    def _conversation(self, thread_id: str) -> SimpleNamespace:
        return self.conversations.setdefault(
            thread_id,
            SimpleNamespace(
                id=1,
                uid="user-1",
                agent_id="test-agent",
                thread_id=thread_id,
                status="active",
                project_id="11111111-1111-4111-8111-111111111111",
                extra_metadata={},
            ),
        )

    async def add_message_by_thread_id(
        self,
        *,
        thread_id: str,
        role: str,
        content: str,
        message_type: str = "text",
        extra_metadata: dict | None = None,
        image_content: str | None = None,
        run_id: str | None = None,
        request_id: str | None = None,
    ):
        self.saved_messages.append(
            {
                "thread_id": thread_id,
                "role": role,
                "content": content,
                "message_type": message_type,
                "extra_metadata": extra_metadata,
                "image_content": image_content,
                "run_id": run_id,
                "request_id": request_id,
            }
        )
        return SimpleNamespace(id=1)

    async def get_conversation_by_thread_id(self, thread_id: str):
        return self._conversation(thread_id)

    async def get_attachments_by_request_id(self, conversation_id: int, request_id: str):
        return []

    async def get_attachments(self, conversation_id: int):
        del conversation_id
        return [dict(item) for item in self.default_attachments]


def test_main_run_discards_configured_subagent_runtime_markers() -> None:
    input_context = {
        "parent_thread_id": "other-parent",
        "is_subagent_runtime": True,
        "temperature": 0.1,
    }

    svc._apply_subagent_runtime_context(input_context, {"run_type": "chat"})

    assert input_context == {"temperature": 0.1}


def test_subagent_attachment_root_rejects_same_path_from_different_project() -> None:
    """共享目录路径不能替代 Project 执行树身份。"""

    child = SimpleNamespace(uid="user-1", project_id="project-child", workdir_path="projects/shared")
    root = SimpleNamespace(uid="user-1", project_id="project-root", workdir_path="projects/shared")

    with pytest.raises(ValueError, match="Project Workdir"):
        svc._validate_subagent_attachment_root(
            root_conversation=root,
            conversation=child,
            uid="user-1",
        )


def test_build_langfuse_run_context_reads_evaluation_from_invocation_meta(monkeypatch: pytest.MonkeyPatch):
    calls: dict[str, object] = {}

    def fake_build_run_context(**kwargs):
        calls.update(kwargs)
        return SimpleNamespace(metadata=kwargs.get("extra_metadata") or {}, tags=kwargs.get("extra_tags") or [])

    monkeypatch.setattr(svc, "build_run_context", fake_build_run_context)

    result = svc._build_langfuse_run_context(
        current_user=SimpleNamespace(id=1, uid="user-1", username="alice", department_id=7),
        thread_id="thread-1",
        agent_id="agent-a",
        request_id="req-1",
        operation="agent_chat_stream",
        meta={
            "source": "agent_evaluation",
            "agent_invocation_meta": {
                "evaluation": {
                    "dataset_name": "dataset-a",
                    "dataset_item_id": "item-1",
                    "experiment_name": "exp-1",
                }
            },
        },
    )

    assert result.metadata == {
        "source": "agent_evaluation",
        "feature": "agent_evaluation",
        "evaluation_dataset_name": "dataset-a",
        "evaluation_dataset_item_id": "item-1",
        "evaluation_experiment_name": "exp-1",
    }
    assert result.tags == ["agent_evaluation", "dataset:dataset-a", "experiment:exp-1"]
    assert "evaluation" not in result.metadata


@pytest.mark.asyncio
async def test_stream_agent_chat_commits_before_stream_and_persists_langfuse_context(
    stub_system_options,
    stub_content_guard,
    monkeypatch: pytest.MonkeyPatch,
):
    calls: dict[str, object] = {}
    db = _FakeSession()

    class FakeAgent:
        context_schema = _FakeContext

        async def stream_messages_with_state(self, messages, input_context=None, **kwargs):
            assert db.commit_count == 1
            calls["stream_messages"] = messages
            calls["stream_input_context"] = input_context
            calls["stream_kwargs"] = kwargs
            yield "messages", (AIMessageChunk(content="hello"), {"node": "llm"})

        async def get_graph(self, *, context=None):
            class FakeGraph:
                async def aget_state(self, config):
                    return SimpleNamespace(values={"messages": [], "files": {}, "artifacts": []})

            return FakeGraph()

    async def fake_save_messages_from_langgraph_state(
        *,
        agent_instance,
        thread_id,
        conv_repo,
        config_dict,
        context,
        trace_info,
        run_id=None,
        request_id=None,
        worker_id=None,
        complete_run=False,
        interrupt_run=False,
        interrupt_error_type=None,
        interrupt_error_message=None,
        token_usage=None,
    ):
        calls["saved_state"] = {
            "thread_id": thread_id,
            "config_dict": config_dict,
            "context": context,
            "trace_info": trace_info,
            "run_id": run_id,
            "request_id": request_id,
            "worker_id": worker_id,
            "complete_run": complete_run,
            "interrupt_run": interrupt_run,
            "interrupt_error_type": interrupt_error_type,
            "interrupt_error_message": interrupt_error_message,
            "token_usage": token_usage,
        }
        return complete_run or interrupt_run

    _patch_stream_scaffolding(
        monkeypatch,
        agent=FakeAgent(),
        runtime_context={
            "temperature": 0.1,
        },
        conversation=SimpleNamespace(
            id=1,
            uid="user-1",
            agent_id="test-agent",
            status="active",
            extra_metadata={
                "attachments": [
                    {
                        "file_id": "file-1",
                        "file_name": "current.txt",
                        "path": "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111/uploads/current.txt",
                        "request_id": "req-1",
                    },
                    {
                        "file_id": "file-2",
                        "file_name": "history.txt",
                        "path": "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111/uploads/history.txt",
                        "request_id": "req-old",
                    },
                ]
            },
        ),
        save_messages=fake_save_messages_from_langgraph_state,
        build_run_context=lambda **kwargs: SimpleNamespace(
            callbacks=["handler-1"],
            metadata={"langfuse_user_id": kwargs["current_user"].uid, "langfuse_session_id": kwargs["thread_id"]},
            tags=["ars", "chat"],
            trace_id="trace-seeded",
        ),
        get_trace_info=lambda _run_context: {
            "langfuse_trace_id": "trace-runtime",
            "langfuse_session_id": "thread-1",
        },
        flush_langfuse=lambda: calls.setdefault("flushed", True),
    )

    chunks = []
    async for chunk in svc.stream_agent_chat(
        agent_slug="test-agent",
        thread_id="thread-1",
        meta={"request_id": "req-1"},
        input_message=build_chat_input_message("hello"),
        current_user=SimpleNamespace(id=1, uid="user-1", role="user", department_id="dept-1"),
        db=db,
    ):
        chunks.append(json.loads(chunk.decode("utf-8")))

    assert (
        calls["stream_input_context"].items()
        >= {
            "temperature": 0.1,
            "uid": "user-1",
            "thread_id": "thread-1",
            "run_id": None,
            "request_id": "req-1",
        }.items()
    )
    assert calls["stream_kwargs"] == {
        "callbacks": ["handler-1"],
        "metadata": {"langfuse_user_id": "user-1", "langfuse_session_id": "thread-1"},
        "tags": ["ars", "chat"],
    }
    model_message = calls["stream_messages"][0]
    assert model_message.content.startswith("hello\n\n<attachment_context>")
    assert "current.txt" in model_message.content
    assert "history.txt" in model_message.content
    assert calls["saved_state"]["trace_info"] == {
        "langfuse_trace_id": "trace-runtime",
        "langfuse_session_id": "thread-1",
    }
    assert calls["saved_state"]["context"].thread_id == "thread-1"
    assert calls["saved_state"]["context"].uid == "user-1"
    assert calls["saved_state"]["context"].temperature == 0.1
    assert calls["saved_state"]["complete_run"] is True
    assert chunks[-1]["status"] == "finished"
    assert calls["stream_input_context"]["workdir_relative_path"] == "projects/11111111-1111-4111-8111-111111111111"
    assert (
        calls["stream_input_context"]["workdir_path"]
        == "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111"
    )
    assert calls["stream_input_context"]["runtime_scope_id"] == "thread-1"
    [init_attachment] = chunks[0]["msg"]["extra_metadata"]["attachments"]
    assert init_attachment["file_name"] == "current.txt"
    assert init_attachment["path"].endswith("/uploads/current.txt")
    assert calls["flushed"] is True
    assert isinstance(calls["stream_messages"][0], HumanMessage)


@pytest.mark.asyncio
async def test_stream_agent_chat_creates_conversation_before_reading_workdir(
    stub_system_options,
    stub_content_guard,
    monkeypatch: pytest.MonkeyPatch,
):
    class FakeAgent:
        context_schema = _FakeContext

        async def stream_messages_with_state(self, messages, input_context=None, **kwargs):
            del messages, input_context, kwargs
            yield "messages", (AIMessageChunk(content="created"), {"node": "llm"})

        async def get_graph(self, *, context=None):
            del context

            class FakeGraph:
                async def aget_state(self, _config):
                    return SimpleNamespace(values={"messages": []})

            return FakeGraph()

    _patch_stream_scaffolding(monkeypatch, agent=FakeAgent())
    repository_holder: dict[str, _FakeConvRepo] = {}

    class NewThreadConversationRepository(_FakeConvRepo):
        def __init__(self, db):
            super().__init__(db)
            repository_holder["repo"] = self

        async def get_conversation_by_thread_id(self, thread_id: str):
            del thread_id
            return None

    async def resolve_new_thread(**_kwargs):
        return (
            SimpleNamespace(slug="test-agent", backend_id="ChatbotAgent"),
            FakeAgent(),
            {},
            None,
        )

    async def create_project(**_kwargs):
        return SimpleNamespace(
            id="11111111-1111-4111-8111-111111111111",
            workdir_path="projects/11111111-1111-4111-8111-111111111111",
        )

    async def add_conversation(self, **kwargs):
        conversation = self._conversation(kwargs["thread_id"])
        conversation.project_id = kwargs["project_id"]
        return conversation

    NewThreadConversationRepository.add_conversation = add_conversation

    monkeypatch.setattr(svc, "ConversationRepository", NewThreadConversationRepository)
    monkeypatch.setattr(svc, "_resolve_agent_runtime", resolve_new_thread)
    monkeypatch.setattr(svc, "create_implicit_project", create_project)
    monkeypatch.setattr(svc, "ensure_bound_user_workdir", lambda _uid, _path: None)

    async def resolve_path(*, conversation, **_kwargs):
        assert conversation.project_id == "11111111-1111-4111-8111-111111111111"
        return "projects/11111111-1111-4111-8111-111111111111"

    monkeypatch.setattr(svc, "resolve_conversation_workdir_path", resolve_path)

    chunks = []
    async for chunk in svc.stream_agent_chat(
        agent_slug="test-agent",
        thread_id="new-thread",
        meta={"request_id": "new-request"},
        input_message=build_chat_input_message("hello"),
        current_user=SimpleNamespace(id=1, uid="user-1", role="user", department_id="dept-1"),
        db=_FakeSession(),
    ):
        chunks.append(json.loads(chunk.decode("utf-8")))

    assert chunks[-1]["status"] == "finished"
    conversation = repository_holder["repo"].conversations["new-thread"]
    assert conversation.project_id == "11111111-1111-4111-8111-111111111111"


@pytest.mark.asyncio
async def test_stream_agent_chat_sandbox_bootstrap_failure_prevents_agent_execution(
    stub_system_options,
    stub_content_guard,
    monkeypatch: pytest.MonkeyPatch,
):
    agent_started = False

    class FakeAgent:
        context_schema = _FakeContext

        async def stream_messages_with_state(self, messages, input_context=None, **kwargs):
            nonlocal agent_started
            del messages, input_context, kwargs
            agent_started = True
            yield "messages", (AIMessageChunk(content="must not run"), {"node": "llm"})

    @asynccontextmanager
    async def fake_session_context():
        yield _FakeSession()

    async def fake_save_partial_message(*_args, **_kwargs):
        return None

    _patch_stream_scaffolding(
        monkeypatch,
        agent=FakeAgent(),
        conversation=SimpleNamespace(
            id=1,
            uid="user-1",
            agent_id="test-agent",
            status="active",
            extra_metadata={"attachments": [{"file_id": "file-1"}]},
        ),
    )

    class FailingSandboxBackend:
        def __init__(self, **_kwargs):
            pass

        def ensure_available(self):
            raise RuntimeError("sandbox bootstrap failed")

    monkeypatch.setattr(svc, "ProvisionerSandboxBackend", FailingSandboxBackend)
    monkeypatch.setattr(svc.pg_manager, "get_async_session_context", fake_session_context)
    monkeypatch.setattr(svc, "save_partial_message", fake_save_partial_message)

    chunks = []
    async for chunk in svc.stream_agent_chat(
        agent_slug="test-agent",
        thread_id="thread-1",
        meta={"request_id": "req-1"},
        input_message=build_chat_input_message("hello"),
        current_user=SimpleNamespace(id=1, uid="user-1", role="user", department_id="dept-1"),
        db=_FakeSession(),
    ):
        chunks.append(json.loads(chunk.decode("utf-8")))

    assert agent_started is False
    assert chunks[-1]["status"] == "error"
    assert "sandbox bootstrap failed" in chunks[-1]["error_message"]
    assert all(chunk.get("status") != "finished" for chunk in chunks)


@pytest.mark.asyncio
async def test_stream_agent_chat_output_persistence_failure_is_terminal_error(
    stub_system_options,
    stub_content_guard,
    monkeypatch: pytest.MonkeyPatch,
):
    class FakeAgent:
        context_schema = _FakeContext

        async def stream_messages_with_state(self, messages, input_context=None, **kwargs):
            del messages, input_context, kwargs
            yield "messages", (AIMessageChunk(content="answer"), {"node": "llm"})

        async def get_graph(self, *, context=None):
            del context

            class FakeGraph:
                async def aget_state(self, _config):
                    return SimpleNamespace(values={"messages": []})

            return FakeGraph()

    async def fail_output_persistence(**_kwargs):
        raise ValueError("output binding rejected")

    _patch_stream_scaffolding(
        monkeypatch,
        agent=FakeAgent(),
        save_messages=fail_output_persistence,
    )

    chunks = []
    async for chunk in svc.stream_agent_chat(
        agent_slug="test-agent",
        thread_id="thread-output-error",
        meta={
            "run_id": "run-output-error",
            "request_id": "request-output-error",
            "worker_id": "worker-output-error:attempt-1",
        },
        input_message=build_chat_input_message("hello"),
        current_user=SimpleNamespace(id=1, uid="user-1", role="user", department_id="dept-1"),
        db=_FakeSession(),
    ):
        chunks.append(json.loads(chunk.decode("utf-8")))

    assert chunks[-1]["status"] == "error"
    assert chunks[-1]["error_type"] == "output_persistence_error"
    assert all(chunk.get("status") not in {"finished", "warning"} for chunk in chunks)


@pytest.mark.asyncio
async def test_stream_agent_chat_maps_raw_protocol_events_to_ars_stream_events(
    stub_system_options,
    stub_content_guard,
    monkeypatch: pytest.MonkeyPatch,
):
    class FakeGraph:
        async def aget_state(self, _config):
            return SimpleNamespace(values={"messages": [], "files": {}, "artifacts": []})

    class FakeAgent:
        context_schema = _FakeContext

        async def stream_messages_with_state(self, messages, input_context=None, **kwargs):
            del messages, input_context, kwargs
            metadata = {"run_id": "run-1"}
            yield "messages", ({"event": "message-start", "id": "msg-1", "role": "ai"}, metadata)
            yield "messages", ({"event": "content-block-start", "index": 0, "content": {"type": "text"}}, metadata)
            yield (
                "messages",
                (
                    {"event": "content-block-delta", "index": 0, "delta": {"type": "text-delta", "text": "hello"}},
                    metadata,
                ),
            )
            yield (
                "messages",
                (
                    {
                        "event": "content-block-delta",
                        "index": 1,
                        "delta": {
                            "type": "block-delta",
                            "fields": {
                                "type": "tool_call_chunk",
                                "id": "call-1",
                                "name": "task",
                                "args": '{"description":"do',
                                "index": 0,
                            },
                        },
                    },
                    metadata,
                ),
            )
            yield (
                "messages",
                (
                    {
                        "event": "content-block-finish",
                        "index": 1,
                        "content": {
                            "type": "tool_call",
                            "id": "call-1",
                            "name": "task",
                            "args": {"description": "do work", "subagent_slug": "worker"},
                        },
                    },
                    metadata,
                ),
            )
            yield "messages", ({"event": "message-finish", "usage": {}}, metadata)

        async def stream_messages(self, messages, input_context=None, **kwargs):
            raise AssertionError("stream_messages fallback should not be used")

        async def get_graph(self, *, context=None):
            return FakeGraph()

    _patch_stream_scaffolding(monkeypatch, agent=FakeAgent())

    chunks = []
    async for chunk in svc.stream_agent_chat(
        agent_slug="test-agent",
        thread_id="thread-1",
        meta={"request_id": "req-1"},
        input_message=build_chat_input_message("hello"),
        current_user=SimpleNamespace(id=1, uid="user-1", role="user", department_id="dept-1"),
        db=_FakeSession(),
    ):
        chunks.append(json.loads(chunk.decode("utf-8")))

    loading_chunks = [chunk for chunk in chunks if chunk.get("status") == "loading"]
    assert [chunk["stream_event"]["type"] for chunk in loading_chunks] == ["message_delta", "tool_call"]
    assert loading_chunks[0]["response"] == "hello"
    assert loading_chunks[0]["stream_event"] == {
        "type": "message_delta",
        "message_id": "msg-1",
        "thread_id": "thread-1",
        "namespace": [],
        "content": "hello",
    }
    assert loading_chunks[1]["response"] == ""
    assert loading_chunks[1]["stream_event"] == {
        "type": "tool_call",
        "message_id": "msg-1",
        "tool_call_id": "call-1",
        "name": "task",
        "args": {"description": "do work", "subagent_slug": "worker"},
        "index": 1,
        "thread_id": "thread-1",
        "namespace": [],
    }
    assert all("msg" not in chunk for chunk in loading_chunks)


@pytest.mark.asyncio
async def test_stream_agent_chat_emits_realtime_agent_state_from_values(
    stub_system_options,
    stub_content_guard,
    monkeypatch: pytest.MonkeyPatch,
):
    class FakeGraph:
        async def aget_state(self, _config):
            return SimpleNamespace(values={"todos": [{"content": "done", "status": "completed"}]})

    class FakeAgent:
        context_schema = _FakeContext

        async def stream_messages_with_state(self, messages, input_context=None, **kwargs):
            yield "values", {"messages": [], "todos": [{"content": "step 1", "status": "pending"}]}
            yield "values", {"messages": [], "todos": [{"content": "step 1", "status": "in_progress"}]}
            yield "values", {"messages": [], "todos": [{"content": "step 1", "status": "in_progress"}]}
            yield "messages", (AIMessageChunk(content="hello"), {"node": "llm"})

        async def stream_messages(self, messages, input_context=None, **kwargs):
            raise AssertionError("stream_messages fallback should not be used")

        async def get_graph(self, *, context=None):
            return FakeGraph()

    _patch_stream_scaffolding(monkeypatch, agent=FakeAgent())

    chunks = []
    async for chunk in svc.stream_agent_chat(
        agent_slug="test-agent",
        thread_id="thread-1",
        meta={"request_id": "req-1"},
        input_message=build_chat_input_message("hello"),
        current_user=SimpleNamespace(id=1, uid="user-1", role="user", department_id="dept-1"),
        db=_FakeSession(),
    ):
        chunks.append(json.loads(chunk.decode("utf-8")))

    agent_state_chunks = [chunk for chunk in chunks if chunk.get("status") == "agent_state"]
    assert len(agent_state_chunks) == 3
    assert agent_state_chunks[0]["agent_state"]["todos"][0]["status"] == "pending"
    assert agent_state_chunks[1]["agent_state"]["todos"][0]["status"] == "in_progress"
    assert agent_state_chunks[2]["agent_state"]["todos"][0]["status"] == "completed"
    assert all("agent_slug" in chunk.get("meta", {}) for chunk in chunks if isinstance(chunk.get("meta"), dict))
    assert all("agent_id" not in chunk.get("meta", {}) for chunk in chunks if isinstance(chunk.get("meta"), dict))


@pytest.mark.asyncio
async def test_stream_agent_chat_maps_custom_compression_event_to_context_compression_chunk(
    stub_system_options,
    stub_content_guard,
    monkeypatch: pytest.MonkeyPatch,
):
    class FakeGraph:
        async def aget_state(self, _config):
            return SimpleNamespace(values={"messages": []})

    class FakeAgent:
        context_schema = _FakeContext

        async def stream_messages_with_state(self, messages, input_context=None, **kwargs):
            yield "custom", {"type": "ars.context_compression", "status": "started"}
            yield "messages", (AIMessageChunk(content="hi"), {"node": "llm"})
            yield (
                "custom",
                {
                    "type": "ars.context_compression",
                    "status": "completed",
                    "cutoff_index": 5,
                    "file_path": "/conv/x.md",
                },
            )

        async def stream_messages(self, messages, input_context=None, **kwargs):
            raise AssertionError("stream_messages fallback should not be used")

        async def get_graph(self, *, context=None):
            return FakeGraph()

    _patch_stream_scaffolding(monkeypatch, agent=FakeAgent())

    chunks = []
    async for chunk in svc.stream_agent_chat(
        agent_slug="test-agent",
        thread_id="thread-1",
        meta={"request_id": "req-1"},
        input_message=build_chat_input_message("hello"),
        current_user=SimpleNamespace(id=1, uid="user-1", role="user", department_id="dept-1"),
        db=_FakeSession(),
    ):
        chunks.append(json.loads(chunk.decode("utf-8")))

    compression_chunks = [chunk for chunk in chunks if chunk.get("status") == "context_compression"]
    assert len(compression_chunks) == 2
    assert compression_chunks[0]["compression"]["status"] == "started"
    assert compression_chunks[1]["compression"]["status"] == "completed"
    assert compression_chunks[1]["compression"]["cutoff_index"] == 5
    assert compression_chunks[1]["compression"]["file_path"] == "/conv/x.md"
