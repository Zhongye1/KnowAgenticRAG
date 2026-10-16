"""agent 条目端点的响应契约：响应体必须与 router 装配出的载荷逐键一致。

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
from fastapi.testclient import TestClient
from pydantic import BaseModel

from server.utils.auth_middleware import get_admin_user, get_db, get_required_user
from test.support.response_contract import uncovered_paths

pytestmark = pytest.mark.unit

agent_router_module = importlib.import_module("server.routers.agent_router")


def _agent_item(**overrides: Any) -> dict[str, Any]:
    """`AgentRepository.serialize` 的真实输出形状（含权限派生字段）。"""

    item: dict[str, Any] = {
        "id": 7,
        "slug": "chatbot",
        "agent_id": "chatbot",
        "backend_id": "ChatbotAgent",
        "name": "智能助手",
        "description": None,
        "icon": None,
        "pics": [],
        "config_json": {},
        "share_config": {"version": 2, "read_scope": None, "manage_scope": None},
        "is_default": True,
        "is_subagent": False,
        "created_by": "admin",
        "updated_by": None,
        "created_at": "2026-10-16 12:00:00",
        "updated_at": "2026-10-16 12:00:00",
        "can_manage": True,
        "effective_permission": "manage",
        "is_builtin": True,
        "permission_locked": True,
        "capabilities": [{"name": "chat"}],
        "metadata": {"icon": "robot"},
    }
    item.update(overrides)
    return item


class _FakeRepo:
    """只提供被转换端点需要的读取与序列化。"""

    payload: ClassVar[dict[str, Any]] = {}

    def __init__(self, _db: object) -> None:
        pass

    @staticmethod
    def _item() -> SimpleNamespace:
        return SimpleNamespace(backend_id="ChatbotAgent")

    async def ensure_default_agent(self) -> SimpleNamespace:
        return self._item()

    async def list_visible(self, *, user: object, include_subagent_definitions: bool = False) -> list[SimpleNamespace]:
        del user, include_subagent_definitions
        return [self._item()]

    async def get_visible_by_slug(self, *, slug: str, user: object, kind: str = "main") -> SimpleNamespace:
        del slug, user, kind
        return self._item()

    async def get_by_slug(self, slug: str) -> SimpleNamespace:
        del slug
        return self._item()

    async def create(self, **_kwargs: object) -> SimpleNamespace:
        return self._item()

    async def update(self, _item: object, **_kwargs: object) -> SimpleNamespace:
        return self._item()

    async def delete(self, *, agent: object) -> None:
        del agent

    async def set_default(self, *, agent: object, updated_by: str) -> SimpleNamespace:
        del agent, updated_by
        return self._item()

    async def serialize(
        self,
        _item: object,
        *,
        user: object,
        include_configurable_items: bool = False,
        backend_info_cache: object = None,
    ) -> dict[str, Any]:
        del user, backend_info_cache
        payload = dict(type(self).payload)
        if include_configurable_items:
            payload["configurable_items"] = {"temperature": {"type": "number"}}
        return payload


class _FakeAgentManager:
    def get_agent(self, backend_id: str) -> SimpleNamespace | None:
        return SimpleNamespace(context_schema=None) if backend_id == "ChatbotAgent" else None


def _client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(agent_router_module, "AgentRepository", _FakeRepo)
    monkeypatch.setattr(agent_router_module, "agent_manager", _FakeAgentManager())
    # 权限判定不是本次契约的对象，这里固定为可管理，让断言只盯响应形状。
    monkeypatch.setattr(agent_router_module, "user_can_manage_agent", lambda _user, _item: True)
    monkeypatch.setattr(agent_router_module, "user_can_access_agent", lambda _user, _item: True)
    monkeypatch.setattr(agent_router_module, "is_builtin_agent", lambda _item: False)

    app = FastAPI()
    app.include_router(agent_router_module.agent_router, prefix="/api")

    fake_user = SimpleNamespace(uid="admin", role="admin", department_id=1)

    async def _fake_db() -> None:
        return None

    async def _fake_user() -> SimpleNamespace:
        return fake_user

    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_required_user] = _fake_user
    app.dependency_overrides[get_admin_user] = _fake_user
    return TestClient(app)


def test_agent_list_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """列表响应与载荷逐键一致：既不能丢字段，也不能多出 null 键。"""

    _FakeRepo.payload = _agent_item()

    response = _client(monkeypatch).get("/api/agent")

    assert response.status_code == 200, response.text
    assert response.json() == {"agents": [_FakeRepo.payload]}


def test_agent_detail_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """详情多下发 configurable_items，响应也必须与载荷一致。"""

    _FakeRepo.payload = _agent_item()

    response = _client(monkeypatch).get("/api/agent/chatbot")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "agent": {**_FakeRepo.payload, "configurable_items": {"temperature": {"type": "number"}}}
    }


def test_agent_delete_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """删除只回 success，不许被模型带上别的键。"""

    response = _client(monkeypatch).delete("/api/agent/chatbot")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True}


class _NarrowAgentItem(BaseModel):
    """故意只覆盖少数字段的模型，用来证明字段覆盖检查不是恒真。"""

    slug: str


def test_contract_guard_reports_fields_the_model_omits() -> None:
    """负向案例：模型漏掉字段时，覆盖检查必须把它们报出来。"""

    missing = uncovered_paths(_agent_item(), _NarrowAgentItem)

    assert "metadata" in missing
    assert "effective_permission" in missing
    assert "permission_locked" in missing


def test_contract_guard_accepts_a_covering_model() -> None:
    """模型覆盖完整时覆盖检查为空，否则守卫会永远失败。"""

    assert uncovered_paths(_agent_item(), agent_router_module.AgentItem) == []
