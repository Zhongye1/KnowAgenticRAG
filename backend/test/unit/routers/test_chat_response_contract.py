"""chat 域端点的响应契约：响应体必须与 router 装配出的载荷逐键一致。

`response_model` 会按模型裁剪响应体，模型漏字段就会静默丢数据；声明了「有时不下发」的
字段又会让响应多出 null 键。断言「响应 JSON == 载荷」同时守住两个方向，因此这些用例
就是补 schema 时的 oracle：模型写窄或写宽都会失败。
"""

from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from server.utils.auth_middleware import get_db, get_required_user
from test.support.response_contract import uncovered_paths

pytestmark = pytest.mark.unit

chat_router_module = importlib.import_module("server.routers.chat_router")


def _fixed_response(payload: Any) -> Any:
    """构造一个总是返回同一载荷的异步替换函数。"""

    async def _stub(**_kwargs: Any) -> Any:
        return payload

    return _stub


def _history_message(**overrides: Any) -> dict[str, Any]:
    """`get_thread_history_view` 里一条 assistant 消息的真实输出形状。"""

    message: dict[str, Any] = {
        "id": 2,
        "type": "ai",
        "content": "好的",
        "created_at": "2026-10-16T12:00:01+00:00",
        "run_id": "run-1",
        "request_id": "req-1",
        "delivery_status": "complete",
        "error_type": None,
        "error_message": None,
        "extra_metadata": {"request_id": "req-1"},
        "message_type": "text",
        "image_content": None,
        "feedback": {
            "id": 5,
            "rating": "like",
            "reason": None,
            "created_at": "2026-10-16T12:00:02+00:00",
        },
        "run_started_at": "2026-10-16T12:00:00+00:00",
        "run_finished_at": "2026-10-16T12:00:01+00:00",
        "tool_calls": [
            {
                "id": "call-1",
                "name": "search",
                "function": {"name": "search"},
                "args": {"q": "x"},
                "tool_call_result": {"content": "result"},
                "status": "success",
                "error_message": None,
            }
        ],
    }
    message.update(overrides)
    return message


def _history_user_message() -> dict[str, Any]:
    """一条 user 消息：不带 run 起止时间与 tool_calls。"""

    return {
        "id": 1,
        "type": "human",
        "content": "你好",
        "created_at": "2026-10-16T12:00:00+00:00",
        "run_id": None,
        "request_id": "req-1",
        "delivery_status": "complete",
        "error_type": None,
        "error_message": None,
        "extra_metadata": {"request_id": "req-1", "attachments": []},
        "message_type": "text",
        "image_content": None,
        "feedback": None,
    }


def _agent_state() -> dict[str, Any]:
    """`extract_agent_state` 的输出形状。"""

    return {
        "todos": [{"id": "1", "content": "task", "status": "pending"}],
        "files": {"notes.md": "hello"},
        "artifacts": ["home/gem/report.md"],
        "subagent_runs": [{"id": "call-1", "run_id": "run-2"}],
        "token_usage": {"input": 10, "output": 5},
    }


def _patch_views(monkeypatch: pytest.MonkeyPatch, **views: Any) -> None:
    for name, payload in views.items():
        monkeypatch.setattr(chat_router_module, name, _fixed_response(payload))


def _client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    app = FastAPI()
    app.include_router(chat_router_module.chat, prefix="/api")

    fake_user = SimpleNamespace(uid="user-1", role="user", id=1)

    async def _fake_db() -> None:
        return None

    async def _fake_user() -> SimpleNamespace:
        return fake_user

    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_required_user] = _fake_user
    return TestClient(app)


class _FakeModel:
    async def call(self, query: str) -> SimpleNamespace:
        return SimpleNamespace(content=f"echo:{query}")


def test_call_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """POST /call 只回 response 与 request_id。"""

    async def _get_options(_db: object) -> dict[str, str]:
        return {"default_model": "provider:model"}

    monkeypatch.setattr(chat_router_module, "system_options", SimpleNamespace(get=_get_options))
    monkeypatch.setattr(chat_router_module, "select_model", lambda **_kwargs: _FakeModel())

    response = _client(monkeypatch).post(
        "/api/chat/call",
        json={"query": "hi", "meta": {"request_id": "req-1"}},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"response": "echo:hi", "request_id": "req-1"}


def test_thread_history_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """历史响应逐键一致：assistant 的 run 时间/tool_calls 保留，user 不多出这些键。"""

    payload = {"history": [_history_user_message(), _history_message()]}
    _patch_views(monkeypatch, get_thread_history_view=payload)

    response = _client(monkeypatch).get("/api/chat/thread/th-1/history")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_thread_state_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """基础状态只含 agent_state，未下发的可选键不得变成 null。"""

    payload = {"agent_state": _agent_state()}
    _patch_views(monkeypatch, get_agent_state_view=payload)

    response = _client(monkeypatch).get("/api/chat/thread/th-1/state")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_thread_state_subagent_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """子智能体场景下的可选键全部保留，且不被模型裁剪。"""

    payload = {
        "agent_state": _agent_state(),
        "interrupt": {"status": "ask_user_question_required", "questions": [], "source": "interrupt"},
        "parent_thread_id": "parent-1",
        "subagent_thread": {
            "id": 9,
            "uid": "user-1",
            "parent_conversation_id": 1,
            "child_conversation_id": 2,
            "child_thread_id": "th-1",
            "subagent_slug": "worker",
            "created_by_run_id": "run-1",
            "created_at": "2026-10-16T12:00:00+00:00",
            "updated_at": None,
        },
        "subagent_run": {"run_id": "run-2", "status": "running"},
        "messages": [{"type": "ai", "content": "hi"}],
    }
    _patch_views(monkeypatch, get_agent_state_view=payload)

    response = _client(monkeypatch).get("/api/chat/thread/th-1/state?include_messages=true")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_delete_thread_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_views(monkeypatch, delete_thread_view={"message": "删除成功"})

    response = _client(monkeypatch).delete("/api/chat/thread/th-1")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "删除成功"}


def test_delete_thread_attachment_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_views(monkeypatch, delete_thread_attachment_view={"message": "附件已删除"})

    response = _client(monkeypatch).delete("/api/chat/thread/th-1/attachments/file-1")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "附件已删除"}


def test_thread_artifact_preview_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """artifact 的 JSON 预览分支逐键一致（文件流分支由 Response 直接透传）。"""

    payload = {
        "content": "# hi",
        "preview_type": "markdown",
        "supported": True,
        "message": None,
        "truncated": False,
        "limit": None,
    }
    _patch_views(monkeypatch, resolve_thread_artifact_view=payload)

    response = _client(monkeypatch).get("/api/chat/thread/th-1/artifacts/docs/report.md?preview=true")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_message_feedback_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "has_feedback": True,
        "feedback": {
            "id": 3,
            "rating": "dislike",
            "reason": "wrong",
            "created_at": "2026-10-16T12:00:00+00:00",
        },
    }
    _patch_views(monkeypatch, get_message_feedback_view=payload)

    response = _client(monkeypatch).get("/api/chat/message/7/feedback")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_message_feedback_null_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """没有反馈时 feedback 为 null，而不是被裁剪掉。"""

    payload = {"has_feedback": False, "feedback": None}
    _patch_views(monkeypatch, get_message_feedback_view=payload)

    response = _client(monkeypatch).get("/api/chat/message/7/feedback")

    assert response.status_code == 200, response.text
    assert response.json() == payload


class _NarrowHistoryMessage(BaseModel):
    """故意只覆盖少数字段的模型，用来证明字段覆盖检查不是恒真。"""

    id: int


def test_contract_guard_reports_fields_the_model_omits() -> None:
    """负向案例：模型漏掉字段时，覆盖检查必须把它们报出来。"""

    missing = uncovered_paths(_history_message(), _NarrowHistoryMessage)

    assert "extra_metadata" in missing
    assert "feedback" in missing
    assert "tool_calls" in missing


def test_contract_guard_accepts_a_covering_model() -> None:
    """模型覆盖完整时覆盖检查为空，否则守卫会永远失败。"""

    assert uncovered_paths(_history_message(), chat_router_module.ThreadHistoryMessageItem) == []
