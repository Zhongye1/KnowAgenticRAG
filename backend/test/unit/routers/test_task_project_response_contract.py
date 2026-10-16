"""tasks 与 projects 端点的响应契约：响应体必须与 router 装配出的载荷逐键一致。

与 `test_chat_response_contract.py` 相同的 oracle：模型漏字段会丢数据，声明「有时不下发」
的字段会多出 null 键，只有断言「响应 JSON == 载荷」才能同时守住两个方向。
"""

from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from server.utils.auth_middleware import get_admin_user, get_db, get_required_user
from test.support.response_contract import uncovered_paths

pytestmark = pytest.mark.unit

task_router_module = importlib.import_module("server.routers.system_task_router")
project_router_module = importlib.import_module("server.routers.project_router")


def _fixed_response(payload: Any) -> Any:
    async def _stub(**_kwargs: Any) -> Any:
        return payload

    return _stub


def _task_summary(**overrides: Any) -> dict[str, Any]:
    """`Task.to_summary_dict()` 的真实输出形状（不含 payload/result）。"""

    item: dict[str, Any] = {
        "id": "t1",
        "name": "Task",
        "type": "general",
        "status": "running",
        "progress": 12.5,
        "message": "进行中",
        "created_at": "2026-10-16T12:00:00+00:00",
        "updated_at": "2026-10-16T12:00:05+00:00",
        "started_at": "2026-10-16T12:00:01+00:00",
        "completed_at": None,
        "error": None,
        "cancel_requested": False,
    }
    item.update(overrides)
    return item


def _task_detail() -> dict[str, Any]:
    """`Task.to_dict()` 的真实输出形状（含 payload/result）。"""

    return {
        "id": "t1",
        "name": "Task",
        "type": "general",
        "status": "success",
        "progress": 100.0,
        "message": "任务已完成",
        "created_at": "2026-10-16T12:00:00+00:00",
        "updated_at": "2026-10-16T12:00:09+00:00",
        "started_at": "2026-10-16T12:00:01+00:00",
        "completed_at": "2026-10-16T12:00:08+00:00",
        "payload": {"kb_id": "kb-1"},
        "result": {"count": 3},
        "error": None,
        "cancel_requested": False,
    }


def _project_item(**overrides: Any) -> dict[str, Any]:
    """`Project.to_dict()` 的真实输出形状。"""

    item: dict[str, Any] = {
        "id": "p1",
        "uid": "user-1",
        "name": "Demo",
        "selection_status": "selectable",
        "workdir_path": "docs",
        "directory_mode": "linked",
        "created_at": "2026-10-16T12:00:00+00:00",
        "updated_at": "2026-10-16T12:00:00+00:00",
    }
    item.update(overrides)
    return item


def _task_client(monkeypatch: pytest.MonkeyPatch, fake_tasker: object) -> TestClient:
    monkeypatch.setattr(task_router_module, "tasker", fake_tasker)

    app = FastAPI()
    app.include_router(task_router_module.tasks, prefix="/api")

    async def _fake_admin() -> SimpleNamespace:
        return SimpleNamespace(uid="admin", role="admin", id=1)

    app.dependency_overrides[get_admin_user] = _fake_admin
    return TestClient(app)


def _project_client(monkeypatch: pytest.MonkeyPatch, **views: Any) -> TestClient:
    for name, payload in views.items():
        monkeypatch.setattr(project_router_module, name, _fixed_response(payload))

    app = FastAPI()
    app.include_router(project_router_module.projects, prefix="/api")

    async def _fake_db() -> None:
        return None

    async def _fake_user() -> SimpleNamespace:
        return SimpleNamespace(uid="user-1", role="user", id=1)

    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_required_user] = _fake_user
    return TestClient(app)


class _FakeTasker:
    """只提供被转换端点需要的读取与动作。"""

    summary_payload: dict[str, Any]
    detail_payload: dict[str, Any] | None

    async def list_tasks(self, *, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        del status, limit
        return self.summary_payload

    async def get_task(self, _task_id: str) -> dict[str, Any] | None:
        return self.detail_payload

    async def cancel_task(self, _task_id: str) -> bool:
        return True

    async def delete_task(self, _task_id: str) -> bool:
        return True


def test_task_list_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "tasks": [_task_summary()],
        "summary": {
            "total": 1,
            "filtered_total": 1,
            "status_counts": {"running": 1},
            "type_counts": {"general": 1},
        },
    }
    _FakeTasker.summary_payload = payload

    response = _task_client(monkeypatch, _FakeTasker()).get("/api/tasks")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_task_detail_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeTasker.detail_payload = _task_detail()

    response = _task_client(monkeypatch, _FakeTasker()).get("/api/tasks/t1")

    assert response.status_code == 200, response.text
    assert response.json() == {"task": _task_detail()}


def test_task_cancel_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    response = _task_client(monkeypatch, _FakeTasker()).post("/api/tasks/t1/cancel")

    assert response.status_code == 200, response.text
    assert response.json() == {"task_id": "t1", "status": "cancelled"}


def test_task_delete_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    response = _task_client(monkeypatch, _FakeTasker()).delete("/api/tasks/t1")

    assert response.status_code == 200, response.text
    assert response.json() == {"task_id": "t1", "status": "deleted"}


def test_project_list_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = [_project_item()]

    response = _project_client(monkeypatch, list_projects_view=payload).get("/api/projects")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_project_create_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _project_item()

    response = _project_client(monkeypatch, create_project_view=payload).post(
        "/api/projects",
        json={
            "request_id": "req-1",
            "name": "Demo",
            "workdir": {"mode": "linked", "path": "docs"},
        },
    )

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_project_history_candidates_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "items": [
            {
                "thread_id": "th-1",
                "title": "聊天",
                "agent_id": "chatbot",
                "workdir_path": "docs",
                "updated_at": "2026-10-16T12:00:00+00:00",
            }
        ],
        "has_more": False,
    }

    response = _project_client(monkeypatch, list_history_candidates_view=payload).get(
        "/api/projects/history-candidates"
    )

    assert response.status_code == 200, response.text
    assert response.json() == payload


class _NarrowTaskSummary(BaseModel):
    """故意只覆盖少数字段的模型，用来证明字段覆盖检查不是恒真。"""

    id: str


def test_contract_guard_reports_fields_the_model_omits() -> None:
    """负向案例：模型漏掉字段时，覆盖检查必须把它们报出来。"""

    missing = uncovered_paths(_task_summary(), _NarrowTaskSummary)

    assert "status" in missing
    assert "created_at" in missing


def test_contract_guard_accepts_a_covering_model() -> None:
    """模型覆盖完整时覆盖检查为空，否则守卫会永远失败。"""

    assert uncovered_paths(_task_summary(), task_router_module.TaskSummaryItem) == []
