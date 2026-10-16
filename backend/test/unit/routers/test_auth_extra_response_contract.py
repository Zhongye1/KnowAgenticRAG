"""auth 补齐端点、部门删除、Dashboard 基础统计与 agent-invocation 端点的响应契约。

`response_model` 会按模型裁剪响应体，模型漏字段就会静默丢数据；声明了「有时不下发」的
字段又会让响应多出 null 键。断言「响应 JSON == 载荷」同时守住两个方向，因此这些用例
就是补 schema 时的 oracle：模型写窄或写宽都会失败。
"""

from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any, ClassVar

import pytest
from fastapi import FastAPI
from fastapi.responses import RedirectResponse
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

auth_module = importlib.import_module("server.routers.auth_router")
dept_module = importlib.import_module("server.routers.auth_dept_router")
dashboard_module = importlib.import_module("server.routers.dashboard_router")
call_module = importlib.import_module("server.routers.agent_invocation_call_router")
channel_module = importlib.import_module("server.routers.agent_invocation_channel_router")
eval_module = importlib.import_module("server.routers.agent_invocation_eval_router")


class _FakeDb:
    async def commit(self) -> None:
        return None


def _fake_db() -> _FakeDb:
    return _FakeDb()


def _fake_user() -> SimpleNamespace:
    return SimpleNamespace(id=1, uid="admin", role="admin", department_id=1, avatar=None)


def _override(app: FastAPI) -> TestClient:
    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_required_user] = _fake_user
    app.dependency_overrides[get_admin_user] = _fake_user
    app.dependency_overrides[get_superadmin_user] = _fake_user
    return TestClient(app)


# =============================================================================
# === auth：补齐的端点 ===
# =============================================================================


class _FakeUserRepository:
    should_first_run: ClassVar[bool] = True
    uid_exists: ClassVar[bool] = False

    def __init__(self, _db: Any = None) -> None:
        pass

    async def is_first_run(self) -> bool:
        return type(self).should_first_run

    async def exists_by_uid(self, _uid: str) -> bool:
        return type(self).uid_exists

    async def save(self, _user: Any) -> None:
        return None


def _auth_client(monkeypatch: pytest.MonkeyPatch) -> tuple[TestClient, FastAPI]:
    monkeypatch.setattr(auth_module, "UserRepository", _FakeUserRepository)
    monkeypatch.setattr(auth_module, "upload_image_to_minio", _fake_upload_image)
    monkeypatch.setattr(auth_module, "log_operation", _fake_noop)
    monkeypatch.setattr(auth_module, "oidc_callback_handler", _fake_oidc_callback)
    monkeypatch.setattr(auth_module, "oidc_login_url_handler", _fake_oidc_login_url)

    app = FastAPI()
    app.include_router(auth_module.auth, prefix="/api")
    return _override(app), app


async def _fake_upload_image(*_args: Any, **_kwargs: Any) -> str:
    return "https://minio.local/avatar/admin.png"


async def _fake_noop(*_args: Any, **_kwargs: Any) -> None:
    return None


async def _fake_oidc_login_url(redirect_path: str = "/") -> dict[str, str]:
    return {"login_url": f"https://idp.example/authorize?redirect_path={redirect_path}"}


async def _fake_oidc_callback(*_args: Any, **_kwargs: Any) -> RedirectResponse:
    return RedirectResponse(url="/login?oidc_error=boom", status_code=302)


def test_auth_check_first_run_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeUserRepository.should_first_run = True

    response = _auth_client(monkeypatch)[0].get("/api/auth/check-first-run")

    assert response.status_code == 200, response.text
    assert response.json() == {"first_run": True}


def test_auth_check_uid_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeUserRepository.uid_exists = False

    response = _auth_client(monkeypatch)[0].get("/api/auth/check-uid/taken_uid")

    assert response.status_code == 200, response.text
    assert response.json() == {"uid": "taken_uid", "is_available": True}


def test_auth_upload_avatar_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    response = _auth_client(monkeypatch)[0].post(
        "/api/auth/upload-avatar",
        files={"file": ("a.png", b"binary", "image/png")},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "success": True,
        "avatar_url": "https://minio.local/avatar/admin.png",
        "message": "头像上传成功",
    }


def test_auth_oidc_login_url_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    response = _auth_client(monkeypatch)[0].get("/api/auth/oidc/login-url", params={"redirect_path": "/chat"})

    assert response.status_code == 200, response.text
    assert response.json() == {"login_url": "https://idp.example/authorize?redirect_path=/chat"}


def test_auth_oidc_callback_is_not_json(monkeypatch: pytest.MonkeyPatch) -> None:
    """回调只回重定向，OpenAPI 里不得出现 application/json 响应。"""

    client, app = _auth_client(monkeypatch)

    response = client.get("/api/auth/oidc/callback", params={"code": "c", "state": "s"}, follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"].startswith("/login")
    operation = app.openapi()["paths"]["/api/auth/oidc/callback"]["get"]
    content_types: set[str] = set()
    for code, payload in operation["responses"].items():
        if code.startswith("2"):
            content_types.update(payload.get("content", {}))
    assert "application/json" not in content_types


# =============================================================================
# === 部门删除 ===
# =============================================================================


class _FakeDepartmentRepository:
    def __init__(self, _db: Any) -> None:
        pass

    async def get_by_id(self, department_id: int) -> SimpleNamespace:
        return SimpleNamespace(id=department_id)

    async def delete_and_migrate_users(self, _department_id: int) -> SimpleNamespace:
        return SimpleNamespace(name="Dept X", migrated_user_count=2)


def test_department_delete_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(dept_module, "DepartmentRepository", _FakeDepartmentRepository)
    monkeypatch.setattr(dept_module, "log_operation", _fake_noop)

    app = FastAPI()
    app.include_router(dept_module.department, prefix="/api")

    response = _override(app).delete("/api/departments/2")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "message": "部门已删除"}


# =============================================================================
# === Dashboard 基础统计 ===
# =============================================================================


class _FakeDashboardService:
    stats: ClassVar[dict[str, Any]] = {}

    def __init__(self, _db: Any) -> None:
        pass

    async def get_basic_stats(self) -> dict[str, Any]:
        return dict(type(self).stats)


def test_dashboard_stats_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeDashboardService.stats = {
        "total_conversations": 4,
        "active_conversations": 3,
        "total_messages": 20,
        "total_users": 2,
        "feedback_stats": {"total_feedbacks": 5, "satisfaction_rate": 80.0},
    }
    monkeypatch.setattr(dashboard_module, "DashboardService", _FakeDashboardService)

    app = FastAPI()
    app.include_router(dashboard_module.dashboard, prefix="/api")

    response = _override(app).get("/api/dashboard/stats")

    assert response.status_code == 200, response.text
    assert response.json() == _FakeDashboardService.stats


# =============================================================================
# === agent-invocation / agent-call ===
# =============================================================================


def _agent_call_result(**overrides: Any) -> dict[str, Any]:
    """`await_agent_run_result` / `get_agent_run_result` 的真实输出形状。"""

    item: dict[str, Any] = {
        "status": "completed",
        "output": "done",
        "agent_slug": "translator",
        "thread_id": "thread-1",
        "conversation_id": 5,
        "agent_run_id": "run-1",
        "request_id": "req-1",
        "final_message_id": 9,
        "langfuse_trace_id": "trace-1",
        "token_usage": {"complete": True, "total": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3}},
    }
    item.update(overrides)
    return item


def _submit_run_result(**overrides: Any) -> dict[str, Any]:
    """`submit_run_command` 的真实输出形状。"""

    item: dict[str, Any] = {
        "request_id": "req-1",
        "status": "dispatched",
        "queue_policy": "reject",
        "queue_position": 1,
        "message_id": 7,
        "run_id": "run-1",
        "stream_url": "/api/agent/runs/run-1/events",
        "request_events_url": None,
        "thread_id": "thread-1",
    }
    item.update(overrides)
    return item


def _agent_call_client(monkeypatch: pytest.MonkeyPatch, submit_result: dict[str, Any]) -> TestClient:
    async def _fake_submit(**_kwargs: Any) -> dict[str, Any]:
        return dict(submit_result)

    monkeypatch.setattr(call_module, "submit_run_command", _fake_submit)

    app = FastAPI()
    app.include_router(call_module.agent_invocation_call_router, prefix="/api")
    return _override(app)


def test_agent_call_success_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    result = _agent_call_result()

    async def _fake_wait(**_kwargs: Any) -> dict[str, Any]:
        return dict(result)

    client = _agent_call_client(monkeypatch, _submit_run_result())
    monkeypatch.setattr(call_module, "await_agent_run_result", _fake_wait)

    response = client.post(
        "/api/agent-invocation/agent-call/runs",
        json={"agent_slug": "translator", "messages": [{"role": "user", "content": "Hello"}], "request_id": "req-1"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == call_module._build_agent_call_response(result)


def test_agent_call_failure_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """失败运行多出 error，响应必须逐键一致。"""

    result = _agent_call_result(status="failed", output="", error={"type": "failed", "message": "boom"})

    async def _fake_wait(**_kwargs: Any) -> dict[str, Any]:
        return dict(result)

    client = _agent_call_client(monkeypatch, _submit_run_result())
    monkeypatch.setattr(call_module, "await_agent_run_result", _fake_wait)

    response = client.post(
        "/api/agent-invocation/agent-call/runs",
        json={"agent_slug": "translator", "messages": [{"role": "user", "content": "Hello"}], "request_id": "req-1"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == call_module._build_agent_call_response(result)


def test_agent_call_async_rejected_shape_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """异步未创建 run 时直接回排队结果，响应不得多出 choices/usage 键。"""

    submit_result = _submit_run_result(run_id=None, status="rejected", stream_url=None, queue_policy="reject")
    client = _agent_call_client(monkeypatch, submit_result)

    response = client.post(
        "/api/agent-invocation/agent-call/runs",
        json={
            "agent_slug": "translator",
            "messages": [{"role": "user", "content": "Hello"}],
            "request_id": "req-1",
            "async_mode": True,
            "queue_policy": "reject",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json() == submit_result


def test_agent_call_result_read_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    result = _agent_call_result()

    async def _fake_view(**_kwargs: Any) -> dict[str, Any]:
        return {"run": {"agent_slug": "translator"}}

    async def _fake_result(**_kwargs: Any) -> dict[str, Any]:
        return dict(result)

    monkeypatch.setattr(call_module, "get_agent_run_view", _fake_view)
    monkeypatch.setattr(call_module, "get_agent_run_result", _fake_result)

    app = FastAPI()
    app.include_router(call_module.agent_invocation_call_router, prefix="/api")
    response = _override(app).post(
        "/api/agent-invocation/agent-call/runs/result",
        json={"run_id": "run-1", "agent_slug": "translator"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == call_module._build_agent_call_response(result)


# =============================================================================
# === agent-invocation / channel ===
# =============================================================================


class _EmptyRunRepo:
    def __init__(self, _db: Any) -> None:
        pass

    async def get_run_by_request_id(self, _request_id: str) -> None:
        return None

    async def get_latest_chat_or_resume_run(self, **_kwargs: Any) -> None:
        return None


class _InterruptedRunRepo:
    def __init__(self, _db: Any) -> None:
        pass

    async def get_run_by_request_id(self, _request_id: str) -> None:
        return None

    async def get_latest_chat_or_resume_run(self, **_kwargs: Any) -> SimpleNamespace:
        return SimpleNamespace(id="run-parent", status="interrupted", error_type="human_approval_required")


def _channel_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    app = FastAPI()
    app.include_router(channel_module.agent_invocation_channel_router, prefix="/api")
    return _override(app)


def _channel_payload(text: str, **kwargs: Any) -> dict[str, Any]:
    values = {
        "agent_slug": "default-chatbot",
        "thread_id": "thread-1",
        "message": {"type": "text", "text": text},
        "message_id": "message-1",
    }
    values.update(kwargs)
    return values


def test_channel_run_shape_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    submit_result = _submit_run_result(queue_policy="steer")

    async def _fake_submit(**_kwargs: Any) -> dict[str, Any]:
        return dict(submit_result)

    monkeypatch.setattr(channel_module, "submit_run_command", _fake_submit)
    monkeypatch.setattr(channel_module, "AgentRunRepository", _EmptyRunRepo)

    response = _channel_client(monkeypatch).post("/api/agent-invocation/channel/messages", json=_channel_payload("你好"))

    assert response.status_code == 200, response.text
    assert response.json() == {**submit_result, "kind": "run", "channel": "cli"}


def test_channel_state_command_shape_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {
        "agent_state": {"todos": [], "messages": []},
        "interrupt": {"run_id": "run-1", "type": "human_approval_required"},
    }

    async def _fake_state(**_kwargs: Any) -> dict[str, Any]:
        return state

    monkeypatch.setattr(channel_module, "get_agent_state_view", _fake_state)

    response = _channel_client(monkeypatch).post(
        "/api/agent-invocation/channel/messages", json=_channel_payload("/state")
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "kind": "command",
        "command": "state",
        "thread_id": "thread-1",
        "state": state,
    }


def test_channel_approve_command_shape_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    run_brief = {
        "run_id": "run-resume",
        "thread_id": "thread-1",
        "status": "pending",
        "request_id": "req-1",
        "stream_url": "/api/agent/runs/run-resume/events",
    }

    async def _fake_create(**_kwargs: Any) -> dict[str, Any]:
        return dict(run_brief)

    monkeypatch.setattr(channel_module, "AgentRunRepository", _InterruptedRunRepo)
    monkeypatch.setattr(channel_module, "create_agent_run_view", _fake_create)

    response = _channel_client(monkeypatch).post(
        "/api/agent-invocation/channel/messages", json=_channel_payload("/approve")
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "kind": "command",
        "command": "approve",
        "thread_id": "thread-1",
        "run": run_brief,
    }


# =============================================================================
# === agent-invocation / eval ===
# =============================================================================


def _eval_run_client(
    monkeypatch: pytest.MonkeyPatch, result: dict[str, Any], traj_events: list[dict[str, Any]] | None = None
) -> TestClient:
    async def _fake_submit(**_kwargs: Any) -> dict[str, Any]:
        return {"run_id": "run-1", "status": "dispatched", "request_id": "eval-1", "thread_id": "thread-1"}

    async def _fake_wait(**_kwargs: Any) -> dict[str, Any]:
        return dict(result)

    async def _fake_events(*_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
        return list(traj_events or [])

    monkeypatch.setattr(eval_module, "submit_run_command", _fake_submit)
    monkeypatch.setattr(eval_module, "await_agent_run_result", _fake_wait)
    monkeypatch.setattr(eval_module, "list_run_stream_events", _fake_events)

    app = FastAPI()
    app.include_router(eval_module.agent_invocation_eval_router, prefix="/api")
    return _override(app)


def test_eval_run_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    result = _agent_call_result()

    response = _eval_run_client(monkeypatch, result).post(
        "/api/agent-invocation/eval/runs",
        json={"query": "2+2=?", "agent_slug": "default-chatbot", "thread_id": "thread-1"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == result


def test_eval_run_not_found_shape_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """Run 不存在时只回失败四字段，响应不得多出 null 键。"""

    result = {
        "status": "failed",
        "agent_run_id": "run-x",
        "output": "",
        "error": {"type": "run_not_found", "message": "运行任务不存在"},
    }

    response = _eval_run_client(monkeypatch, result).post(
        "/api/agent-invocation/eval/runs",
        json={"query": "2+2=?", "agent_slug": "default-chatbot", "thread_id": "thread-1"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == result


def test_eval_run_trajectory_summary_shape_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    result = _agent_call_result()

    response = _eval_run_client(monkeypatch, result, traj_events=[]).post(
        "/api/agent-invocation/eval/runs",
        json={
            "query": "2+2=?",
            "agent_slug": "default-chatbot",
            "thread_id": "thread-1",
            "include_trajectory_summary": True,
        },
    )

    assert response.status_code == 200, response.text
    summary = {
        "schema_version": 1,
        "source": "run_events",
        "event_count": 0,
        "events_truncated": False,
        "event_range": {"first_seq": None, "last_seq": None},
        "tool_call_count": 0,
        "tool_error_count": 0,
        "interrupt_count": 0,
        "tools": [],
        "langfuse_trace_id": "trace-1",
    }
    assert response.json() == {**result, "trajectory_summary": summary}


# =============================================================================
# === 负向守卫 ===
# =============================================================================


class _NarrowAgentCallResponse(BaseModel):
    """故意只覆盖少数字段的模型，用来证明字段覆盖检查不是恒真。"""

    run_id: str | None


def test_contract_guard_reports_fields_the_model_omits() -> None:
    payload = call_module._build_agent_call_response(_agent_call_result())
    missing = uncovered_paths(payload, _NarrowAgentCallResponse)

    assert "choices" in missing
    assert "usage" in missing
    assert "status" in missing


def test_contract_guard_accepts_covering_models() -> None:
    assert uncovered_paths(call_module._build_agent_call_response(_agent_call_result()), call_module.AgentCallRunResponse) == []
    assert uncovered_paths(_submit_run_result(), call_module.AgentCallRunResponse) == []
    assert uncovered_paths(
        {"run_id": "r", "thread_id": "t", "status": "completed", "request_id": "q", "output": "", "error": {"type": "x", "message": "y"}},
        call_module.AgentCallRunResponse,
    ) == []
