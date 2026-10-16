"""agent run/request/backend 端点的响应契约：响应体必须与 router 装配出的载荷逐键一致。

`response_model` 会按模型裁剪响应体，模型漏字段就会静默丢数据；声明了「有时不下发」的
字段又会让响应多出 null 键。断言「响应 JSON == 载荷」同时守住两个方向，因此这些用例
就是补 schema 时的 oracle：模型写窄或写宽都会失败。

载荷 fixture 与真实序列化输出的键集合保持一致（`AgentRun.to_dict()`、`AgentRunRequest.to_dict()`、
`BaseAgent.get_info()`/`_backend_info()`、各 service 的返回 dict 字面量），并由
`uncovered_paths` 负向用例证明检查不是恒真。
"""

from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any, ClassVar

import pytest
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient
from pydantic import BaseModel

from server.utils.auth_middleware import (
    get_admin_user,
    get_db,
    get_required_user,
    get_superadmin_user,
)
from test.support.response_contract import uncovered_paths

pytestmark = pytest.mark.unit

agent_router_module = importlib.import_module("server.routers.agent_router")


def _backend_raw_info(**overrides: Any) -> dict[str, Any]:
    """`BaseAgent.get_info()` 的真实输出形状（键为 `id`，`type` 由 `_backend_info()` 补）。"""

    item: dict[str, Any] = {
        "id": "ChatbotAgent",
        "name": "智能助手",
        "description": "内置聊天智能体",
        "metadata": {"icon": "robot", "order": 1},
        "configurable_items": {"model": {"type": "string", "options": []}},
        "capabilities": ["file_upload", "files"],
    }
    item.update(overrides)
    return item


def _backend_item(**overrides: Any) -> dict[str, Any]:
    """`_backend_raw_info()` 经 `_backend_info()` 改名/补 type 后的期望输出。"""

    item: dict[str, Any] = {
        "backend_id": "ChatbotAgent",
        "type": "agent_backend",
        "name": "智能助手",
        "description": "内置聊天智能体",
        "metadata": {"icon": "robot", "order": 1},
        "configurable_items": {"model": {"type": "string", "options": []}},
        "capabilities": ["file_upload", "files"],
    }
    item.update(overrides)
    return item


def _run_item(**overrides: Any) -> dict[str, Any]:
    """`AgentRun.to_dict()` 的真实输出形状（29 个键）。"""

    item: dict[str, Any] = {
        "id": "run-1",
        "conversation_thread_id": "thread-1",
        "runtime_scope_id": "thread-1",
        "runtime_cleanup_pending": False,
        "agent_slug": "chatbot",
        "uid": "admin",
        "status": "running",
        "request_id": "req-1",
        "source": "chat",
        "channel": "web",
        "external_id": None,
        "origin_metadata": {"source": "chat"},
        "conversation_id": 3,
        "created_by_run_id": None,
        "subagent_thread_relation_id": None,
        "run_type": "chat",
        "input_message_id": 42,
        "output_message_id": None,
        "last_event_id": None,
        "input_payload": {"model_spec": "gpt-4o", "tool_approval_mode": "default"},
        "token_usage": {"chat": {"total_tokens": 12}},
        "error_type": None,
        "error_message": None,
        "manifest": None,
        "manifest_fingerprint": None,
        "started_at": "2026-10-16 12:00:00",
        "finished_at": None,
        "created_at": "2026-10-16 12:00:00",
        "updated_at": "2026-10-16 12:00:00",
    }
    item.update(overrides)
    return item


def _request_item(**overrides: Any) -> dict[str, Any]:
    """`AgentRunRequest.to_dict()` 的真实输出形状（16 个键）。"""

    item: dict[str, Any] = {
        "request_id": "req-1",
        "uid": "admin",
        "agent_slug": "chatbot",
        "thread_id": "thread-1",
        "source": "chat",
        "channel": "web",
        "external_id": None,
        "origin_metadata": {"source": "chat"},
        "queue_policy": "enqueue",
        "status": "queued",
        "input_message_id": 42,
        "dispatched_run_id": None,
        "error_message": None,
        "created_at": "2026-10-16 12:00:00",
        "dispatched_at": None,
        "updated_at": "2026-10-16 12:00:00",
    }
    item.update(overrides)
    return item


class _FakeDb:
    """只提供路由用到的提交/刷新钩子。"""

    async def commit(self) -> None:
        return None

    async def flush(self) -> None:
        return None


class _FakeBackend:
    async def get_info(self, **_kwargs: object) -> dict[str, Any]:
        return dict(_FakeServices.backend_info)


class _FakeAgentManager:
    """列表与详情共用的后端信息源。"""

    async def get_agents_info(self, include_configurable_items: bool = True) -> list[dict[str, Any]]:
        del include_configurable_items
        return [dict(_FakeServices.backend_info)]

    def get_agent(self, backend_id: str) -> _FakeBackend | None:
        return _FakeBackend() if backend_id == "ChatbotAgent" else None


class _FakeServices:
    """按测试用例注入的 service 返回值。"""

    backend_info: ClassVar[dict[str, Any]] = {}
    submit_result: ClassVar[dict[str, Any]] = {}
    resume_result: ClassVar[dict[str, Any]] = {}
    request: ClassVar[dict[str, Any]] = {}
    queue_snapshot: ClassVar[dict[str, Any]] = {}
    continue_dispatch: ClassVar[SimpleNamespace] = SimpleNamespace(request_id="req-1", run_id="run-1")
    cancel_status: ClassVar[str] = "cancelled"
    steer_result: ClassVar[SimpleNamespace] = SimpleNamespace(
        request_id="req-1",
        thread_id="thread-1",
        status="queued",
        queue_policy="steer",
        queue_position=1,
    )
    run_view: ClassVar[dict[str, Any]] = {}
    run_result: ClassVar[dict[str, Any]] = {}
    langfuse: ClassVar[dict[str, Any]] = {}
    cancel_view: ClassVar[dict[str, Any]] = {}
    active_run: ClassVar[dict[str, Any]] = {}


async def _fake_submit_run_command(*, command: object, current_user: object, db: object) -> dict[str, Any]:
    del command, current_user, db
    return dict(_FakeServices.submit_result)


async def _fake_create_agent_run_view(**_kwargs: object) -> dict[str, Any]:
    return dict(_FakeServices.resume_result)


async def _fake_get_request_svc(*, db: object, request_id: str, uid: str) -> dict[str, Any]:
    del db, request_id, uid
    return dict(_FakeServices.request)


async def _fake_get_thread_queue_snapshot(*, db: object, uid: str, agent_slug: str, thread_id: str) -> dict[str, Any]:
    del db, uid, agent_slug, thread_id
    return dict(_FakeServices.queue_snapshot)


async def _fake_continue_thread_queue(*, db: object, uid: str, agent_slug: str, thread_id: str) -> SimpleNamespace:
    del db, uid, agent_slug, thread_id
    return _FakeServices.continue_dispatch


async def _fake_finalize_dispatch(*, db: object, dispatch: object) -> None:
    del db, dispatch
    return None


async def _fake_cancel_queued_request(*, request_id: str, current_uid: str, db: object) -> str:
    del request_id, current_uid, db
    return _FakeServices.cancel_status


async def _fake_steer_queued_request(*, request_id: str, current_uid: str, db: object) -> SimpleNamespace:
    del request_id, current_uid, db
    return _FakeServices.steer_result


async def _fake_get_agent_run_view(*, run_id: str, current_uid: str, db: object) -> dict[str, Any]:
    del run_id, current_uid, db
    return dict(_FakeServices.run_view)


async def _fake_get_agent_run_result(*, run_id: str, current_uid: str, db: object) -> dict[str, Any]:
    del run_id, current_uid, db
    return dict(_FakeServices.run_result)


async def _fake_get_agent_run_langfuse_link(*, run_id: str, current_uid: str, db: object) -> dict[str, Any]:
    del run_id, current_uid, db
    return dict(_FakeServices.langfuse)


async def _fake_cancel_agent_run_view(*, run_id: str, current_uid: str, db: object) -> dict[str, Any]:
    del run_id, current_uid, db
    return dict(_FakeServices.cancel_view)


async def _fake_get_active_run_by_thread(*, thread_id: str, current_uid: str, db: object) -> dict[str, Any]:
    del thread_id, current_uid, db
    return dict(_FakeServices.active_run)


def _client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(agent_router_module, "agent_manager", _FakeAgentManager())
    monkeypatch.setattr(agent_router_module, "submit_run_command", _fake_submit_run_command)
    monkeypatch.setattr(agent_router_module, "create_agent_run_view", _fake_create_agent_run_view)
    monkeypatch.setattr(agent_router_module, "get_request_svc", _fake_get_request_svc)
    monkeypatch.setattr(agent_router_module, "get_thread_queue_snapshot", _fake_get_thread_queue_snapshot)
    monkeypatch.setattr(agent_router_module, "continue_thread_queue", _fake_continue_thread_queue)
    monkeypatch.setattr(agent_router_module, "finalize_dispatch", _fake_finalize_dispatch)
    monkeypatch.setattr(agent_router_module, "cancel_queued_request_svc", _fake_cancel_queued_request)
    monkeypatch.setattr(agent_router_module, "steer_queued_request", _fake_steer_queued_request)
    monkeypatch.setattr(agent_router_module, "get_agent_run_view", _fake_get_agent_run_view)
    monkeypatch.setattr(agent_router_module, "get_agent_run_result", _fake_get_agent_run_result)
    monkeypatch.setattr(agent_router_module, "get_agent_run_langfuse_link", _fake_get_agent_run_langfuse_link)
    monkeypatch.setattr(agent_router_module, "cancel_agent_run_view", _fake_cancel_agent_run_view)
    monkeypatch.setattr(agent_router_module, "get_active_run_by_thread", _fake_get_active_run_by_thread)

    app = FastAPI()
    app.include_router(agent_router_module.agent_router, prefix="/api")

    fake_user = SimpleNamespace(uid="admin", role="admin", department_id=1)

    async def _fake_db() -> _FakeDb:
        return _FakeDb()

    async def _fake_user() -> SimpleNamespace:
        return fake_user

    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_required_user] = _fake_user
    app.dependency_overrides[get_admin_user] = _fake_user
    app.dependency_overrides[get_superadmin_user] = _fake_user
    return TestClient(app)


# --- 后端 ---


def test_backend_list_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """列表响应逐键一致：`_backend_info` 改名/补 type 后不能丢键。"""

    _FakeServices.backend_info = _backend_raw_info()

    response = _client(monkeypatch).get("/api/agent/backends")

    assert response.status_code == 200, response.text
    assert response.json() == {"backends": [_backend_item()]}


def test_backend_detail_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """详情直接回后端条目本身，不带包裹键。"""

    _FakeServices.backend_info = _backend_raw_info()

    response = _client(monkeypatch).get("/api/agent/backends/ChatbotAgent")

    assert response.status_code == 200, response.text
    assert response.json() == _backend_item()


# --- POST /runs ---


def test_run_create_submit_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """普通 Chat 提交：含排队字段，run_id/stream_url 可为 null 但键必须在。"""

    _FakeServices.submit_result = {
        "request_id": "req-1",
        "status": "queued",
        "queue_policy": "enqueue",
        "queue_position": 1,
        "message_id": 42,
        "run_id": None,
        "stream_url": None,
        "request_events_url": "/api/agent/requests/req-1/events",
        "thread_id": "thread-1",
    }

    response = _client(monkeypatch).post(
        "/api/agent/runs",
        json={"query": "你好", "agent_slug": "chatbot", "thread_id": "thread-1"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == dict(_FakeServices.submit_result)


def test_run_create_resume_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """Resume 提交：只有运行基本字段，不许补出 null 的排队键。"""

    _FakeServices.resume_result = {
        "run_id": "run-1",
        "thread_id": "thread-1",
        "status": "pending",
        "request_id": "req-1",
        "stream_url": "/api/agent/runs/run-1/events",
    }

    response = _client(monkeypatch).post(
        "/api/agent/runs",
        json={
            "agent_slug": "chatbot",
            "thread_id": "thread-1",
            "resume": {"decisions": [{"type": "approve"}]},
        },
    )

    assert response.status_code == 200, response.text
    assert response.json() == dict(_FakeServices.resume_result)


# --- 请求 ---


def test_request_detail_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """请求详情逐键一致。"""

    _FakeServices.request = _request_item()

    response = _client(monkeypatch).get("/api/agent/requests/req-1")

    assert response.status_code == 200, response.text
    assert response.json() == {"request": dict(_FakeServices.request)}


def test_thread_requests_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """队列快照：每条请求带 content/queue_position，queue 状态字段齐全。"""

    _FakeServices.queue_snapshot = {
        "requests": [{**_request_item(), "content": "你好", "queue_position": 1}],
        "queue": {
            "status": "ready",
            "paused_reason": None,
            "blocking_run_id": None,
            "can_continue": False,
        },
    }

    response = _client(monkeypatch).get("/api/agent/thread/thread-1/requests?agent_slug=chatbot")

    assert response.status_code == 200, response.text
    assert response.json() == dict(_FakeServices.queue_snapshot)


def test_thread_continue_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """手动继续只回 dispatched 派发结果。"""

    _FakeServices.continue_dispatch = SimpleNamespace(request_id="req-1", run_id="run-1")

    response = _client(monkeypatch).post("/api/agent/thread/thread-1/requests/continue?agent_slug=chatbot")

    assert response.status_code == 200, response.text
    assert response.json() == {"status": "dispatched", "request_id": "req-1", "run_id": "run-1"}


def test_request_cancel_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """取消请求回 request_id 与最终状态。"""

    _FakeServices.cancel_status = "cancelled"

    response = _client(monkeypatch).post("/api/agent/requests/req-1/cancel")

    assert response.status_code == 200, response.text
    assert response.json() == {"request_id": "req-1", "status": "cancelled"}


def test_request_steer_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """升级引导回队列位置与事件地址，键集合固定。"""

    _FakeServices.steer_result = SimpleNamespace(
        request_id="req-1",
        thread_id="thread-1",
        status="queued",
        queue_policy="steer",
        queue_position=1,
    )

    response = _client(monkeypatch).post("/api/agent/requests/req-1/steer")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "request_id": "req-1",
        "thread_id": "thread-1",
        "status": "queued",
        "queue_policy": "steer",
        "queue_position": 1,
        "request_events_url": "/api/agent/requests/req-1/events",
    }


# --- 运行 ---


def test_run_detail_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """运行详情逐键一致（覆盖 `AgentRun.to_dict()` 的全部键）。"""

    _FakeServices.run_view = {"run": _run_item()}

    response = _client(monkeypatch).get("/api/agent/runs/run-1")

    assert response.status_code == 200, response.text
    assert response.json() == dict(_FakeServices.run_view)


def test_run_result_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """正常结果不带 error 键，模型不得补出 null 的 error。"""

    _FakeServices.run_result = {
        "status": "completed",
        "output": "最终答案",
        "agent_slug": "chatbot",
        "thread_id": "thread-1",
        "conversation_id": 3,
        "agent_run_id": "run-1",
        "request_id": "req-1",
        "final_message_id": 43,
        "langfuse_trace_id": "trace-1",
        "token_usage": {"chat": {"total_tokens": 12}},
    }

    response = _client(monkeypatch).get("/api/agent/runs/run-1/result")

    assert response.status_code == 200, response.text
    assert response.json() == dict(_FakeServices.run_result)


def test_run_result_failed_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """失败结果带 error 子对象，键集合与正常结果不同。"""

    _FakeServices.run_result = {
        "status": "failed",
        "output": "",
        "agent_slug": "chatbot",
        "thread_id": "thread-1",
        "conversation_id": 3,
        "agent_run_id": "run-1",
        "request_id": "req-1",
        "final_message_id": None,
        "langfuse_trace_id": None,
        "token_usage": {},
        "error": {"type": "model_error", "message": "boom"},
    }

    response = _client(monkeypatch).get("/api/agent/runs/run-1/result")

    assert response.status_code == 200, response.text
    assert response.json() == dict(_FakeServices.run_result)


def test_run_result_not_found_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """Run 不存在时载荷只有 4 个键，exclude_unset 不能补出其余 null 键。"""

    _FakeServices.run_result = {
        "status": "failed",
        "agent_run_id": "run-missing",
        "output": "",
        "error": {"type": "run_not_found", "message": "运行任务不存在"},
    }

    response = _client(monkeypatch).get("/api/agent/runs/run-missing/result")

    assert response.status_code == 200, response.text
    assert response.json() == dict(_FakeServices.run_result)


def test_run_langfuse_available_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """Langfuse 可用时回 url，不带 reason。"""

    _FakeServices.langfuse = {"run_id": "run-1", "available": True, "url": "https://langfuse/trace-1"}

    response = _client(monkeypatch).get("/api/agent/runs/run-1/langfuse")

    assert response.status_code == 200, response.text
    assert response.json() == dict(_FakeServices.langfuse)


def test_run_langfuse_unavailable_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """Langfuse 不可用时回 reason，不带 url。"""

    _FakeServices.langfuse = {"run_id": "run-1", "available": False, "reason": "trace_not_available"}

    response = _client(monkeypatch).get("/api/agent/runs/run-1/langfuse")

    assert response.status_code == 200, response.text
    assert response.json() == dict(_FakeServices.langfuse)


def test_run_cancel_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """取消运行回更新后的 run。"""

    _FakeServices.cancel_view = {"run": _run_item(status="cancel_requested")}

    response = _client(monkeypatch).post("/api/agent/runs/run-1/cancel")

    assert response.status_code == 200, response.text
    assert response.json() == dict(_FakeServices.cancel_view)


def test_thread_active_run_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """线程有活跃运行时回 run 对象。"""

    _FakeServices.active_run = {"run": _run_item()}

    response = _client(monkeypatch).get("/api/agent/thread/thread-1/active_run")

    assert response.status_code == 200, response.text
    assert response.json() == dict(_FakeServices.active_run)


def test_thread_active_run_null_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """线程没有活跃运行时 run 为 null，键必须保留。"""

    _FakeServices.active_run = {"run": None}

    response = _client(monkeypatch).get("/api/agent/thread/thread-1/active_run")

    assert response.status_code == 200, response.text
    assert response.json() == {"run": None}


# --- 非 JSON 流端点 ---


def test_streaming_routes_are_declared_non_json() -> None:
    """SSE 端点不声明 response_model，而是用 response_class=StreamingResponse 表达非 JSON。"""

    routes = {route.path: route for route in agent_router_module.agent_router.routes}
    for path in ("/agent/requests/{request_id}/events", "/agent/runs/{run_id}/events"):
        route = routes[path]
        assert route.response_model is None
        assert route.response_class is StreamingResponse


# --- 覆盖守卫 ---

class _NarrowRunItem(BaseModel):
    """故意只覆盖少数字段的模型，用来证明字段覆盖检查不是恒真。"""

    id: str


def test_contract_guard_reports_fields_the_model_omits() -> None:
    """负向案例：模型漏掉字段时，覆盖检查必须把它们报出来。"""

    missing = uncovered_paths(_run_item(), _NarrowRunItem)

    assert "status" in missing
    assert "token_usage" in missing
    assert "manifest_fingerprint" in missing


def test_contract_guard_accepts_covering_models() -> None:
    """模型覆盖完整时覆盖检查为空，否则守卫会永远失败。"""

    assert uncovered_paths(_run_item(), agent_router_module.AgentRunItem) == []
    assert uncovered_paths(_request_item(), agent_router_module.AgentRequestItem) == []
    assert uncovered_paths(_backend_item(), agent_router_module.AgentBackendItem) == []
