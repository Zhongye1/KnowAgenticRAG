"""mcp / skill 路由的响应契约：响应体必须与 handler 装配出的载荷逐键一致。

`response_model` 会按模型裁剪响应体，模型漏字段就会静默丢数据；声明了「有时不下发」的
字段又会让响应多出 null 键。断言「响应 JSON == 载荷」同时守住两个方向，因此这些用例
就是补 schema 时的 oracle：模型写窄或写宽都会失败。
"""

from __future__ import annotations

import importlib
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from ars.agents.skills.service import ResolvedSkill
from ars.storage.postgres.models_business import Skill
from server.utils.auth_middleware import get_admin_user, get_db, get_required_user
from test.support.response_contract import uncovered_paths

pytestmark = pytest.mark.unit

mcp_router_module = importlib.import_module("server.routers.mcp_router")
skill_router_module = importlib.import_module("server.routers.skill_router")


# =============================================================================
# MCP fixtures / helpers
# =============================================================================


def _mcp_base_dict(**overrides: Any) -> dict[str, Any]:
    """`MCPServer.to_dict()` 的真实形态。"""

    base: dict[str, Any] = {
        "id": 1,
        "slug": "demo-mcp",
        "name": "Demo MCP",
        "description": "demo",
        "transport": "streamable_http",
        "url": "https://example.com/mcp",
        "command": None,
        "args": [],
        "env": {},
        "headers": {},
        "timeout": None,
        "sse_read_timeout": None,
        "tags": ["demo"],
        "icon": "plug",
        "enabled": True,
        "disabled_tools": [],
        "created_by": "admin",
        "updated_by": "admin",
        "created_at": "2026-10-16 12:00:00",
        "updated_at": "2026-10-16 12:00:00",
    }
    base.update(overrides)
    return base


def _mcp_payload(**overrides: Any) -> dict[str, Any]:
    """`serialize_mcp_server` 的输出：to_dict 加 is_builtin/requires_migration。"""

    return {**_mcp_base_dict(**overrides), "is_builtin": False, "requires_migration": False}


class _FakeMcpServer:
    """带 to_dict 与属性访问的假 MCPServer，供 serialize 与脱敏分支共用。"""

    def __init__(self, **overrides: Any) -> None:
        self._data = _mcp_base_dict(**overrides)
        for key, value in self._data.items():
            setattr(self, key, value)

    def to_dict(self) -> dict[str, Any]:
        return dict(self._data)


class _FakeArgsSchema:
    def schema(self) -> dict[str, Any]:
        return {"properties": {"q": {"type": "string"}}, "required": ["q"]}


class _FakeTool:
    def __init__(self, name: str = "search", tool_id: str | None = "search") -> None:
        self.name = name
        self.metadata = {"id": tool_id} if tool_id is not None else {}
        self.description = "搜索工具"
        self.args_schema = _FakeArgsSchema()


def _tool_payload(name: str = "search", tool_id: str | None = "search") -> dict[str, Any]:
    return {
        "name": name,
        "id": tool_id,
        "description": "搜索工具",
        "enabled": True,
        "parameters": {"q": {"type": "string"}},
        "required": ["q"],
    }


def _mcp_client(monkeypatch: pytest.MonkeyPatch, *, role: str = "admin") -> TestClient:
    # 内置/迁移判定不是本契约的对象；固定为 False 让 serialize 只补两个确定的键。
    monkeypatch.setattr(mcp_router_module, "is_builtin_mcp_server", lambda _server: False)
    monkeypatch.setattr(mcp_router_module, "requires_mcp_stdio_migration", lambda _server: False)

    app = FastAPI()
    app.include_router(mcp_router_module.mcp, prefix="/api")

    fake_user = SimpleNamespace(uid="admin", username="admin", role=role)

    async def _fake_db() -> None:
        return None

    async def _fake_user() -> SimpleNamespace:
        return fake_user

    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_required_user] = _fake_user
    app.dependency_overrides[get_admin_user] = _fake_user
    return TestClient(app)


def test_get_mcp_servers_admin_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """管理员列表下发完整配置，响应必须与 serialize 输出逐键一致。"""

    async def _fake_get_all(_db: object) -> list[_FakeMcpServer]:
        return [_FakeMcpServer()]

    monkeypatch.setattr(mcp_router_module, "get_all_mcp_servers", _fake_get_all)

    response = _mcp_client(monkeypatch).get("/api/system/mcp-servers")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": [_mcp_payload()]}


def test_get_mcp_servers_normal_user_response_equals_masked_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """普通用户只拿脱敏白名单字段，响应必须是恰好这些键。"""

    async def _fake_get_all(_db: object) -> list[_FakeMcpServer]:
        return [_FakeMcpServer()]

    monkeypatch.setattr(mcp_router_module, "get_all_mcp_servers", _fake_get_all)

    response = _mcp_client(monkeypatch, role="user").get("/api/system/mcp-servers")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "success": True,
        "data": [
            {
                "name": "Demo MCP",
                "description": "demo",
                "icon": "plug",
                "enabled": True,
                "tags": ["demo"],
            }
        ],
    }


def test_create_mcp_server_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_create(_db: object, **_kwargs: Any) -> _FakeMcpServer:
        return _FakeMcpServer()

    monkeypatch.setattr(mcp_router_module, "create_mcp_server", _fake_create)

    response = _mcp_client(monkeypatch).post(
        "/api/system/mcp-servers",
        json={
            "slug": "demo-mcp",
            "name": "Demo MCP",
            "transport": "streamable_http",
            "url": "https://example.com/mcp",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": _mcp_payload()}


def test_get_mcp_server_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get(_db: object, _slug: str) -> _FakeMcpServer:
        return _FakeMcpServer()

    monkeypatch.setattr(mcp_router_module, "get_mcp_server", _fake_get)

    response = _mcp_client(monkeypatch).get("/api/system/mcp-servers/demo-mcp")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": _mcp_payload()}


def test_update_mcp_server_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_update(_db: object, **_kwargs: Any) -> _FakeMcpServer:
        return _FakeMcpServer()

    monkeypatch.setattr(mcp_router_module, "update_mcp_server", _fake_update)

    response = _mcp_client(monkeypatch).put("/api/system/mcp-servers/demo-mcp", json={"name": "Demo MCP"})

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": _mcp_payload()}


def test_delete_mcp_server_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get(_db: object, _slug: str) -> _FakeMcpServer:
        return _FakeMcpServer()

    async def _fake_delete(_db: object, slug: str) -> bool:
        return slug == "demo-mcp"

    monkeypatch.setattr(mcp_router_module, "get_mcp_server", _fake_get)
    monkeypatch.setattr(mcp_router_module, "delete_mcp_server", _fake_delete)

    response = _mcp_client(monkeypatch).delete("/api/system/mcp-servers/demo-mcp")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "message": "服务器 'demo-mcp' 已删除"}


def test_test_mcp_server_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get(_db: object, _slug: str) -> _FakeMcpServer:
        return _FakeMcpServer()

    async def _fake_tools(_slug: str) -> list[_FakeTool]:
        return [_FakeTool(), _FakeTool("fetch", "fetch")]

    monkeypatch.setattr(mcp_router_module, "get_mcp_server", _fake_get)
    monkeypatch.setattr(mcp_router_module, "get_all_mcp_tools", _fake_tools)

    response = _mcp_client(monkeypatch).post("/api/system/mcp-servers/demo-mcp/test")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "message": "连接成功，共发现 2 个工具", "tool_count": 2}


def test_update_mcp_server_status_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_set(_db: object, _slug: str, enabled: bool, _by: str) -> tuple[bool, _FakeMcpServer]:
        return enabled, _FakeMcpServer()

    monkeypatch.setattr(mcp_router_module, "set_server_enabled", _fake_set)

    response = _mcp_client(monkeypatch).put("/api/system/mcp-servers/demo-mcp/status", json={"enabled": True})

    assert response.status_code == 200, response.text
    assert response.json() == {
        "success": True,
        "enabled": True,
        "data": _mcp_payload(),
        "message": "MCP 'demo-mcp' 已添加",
    }


def test_get_mcp_server_tools_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get(_db: object, _slug: str) -> _FakeMcpServer:
        return _FakeMcpServer()

    async def _fake_tools(_slug: str) -> list[_FakeTool]:
        return [_FakeTool()]

    monkeypatch.setattr(mcp_router_module, "get_mcp_server", _fake_get)
    monkeypatch.setattr(mcp_router_module, "get_all_mcp_tools", _fake_tools)

    response = _mcp_client(monkeypatch).get("/api/system/mcp-servers/demo-mcp/tools")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": [_tool_payload()], "total": 1}


def test_refresh_mcp_server_tools_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get(_db: object, _slug: str) -> _FakeMcpServer:
        return _FakeMcpServer()

    async def _fake_tools(_slug: str) -> list[_FakeTool]:
        return [_FakeTool(), _FakeTool("fetch", "fetch")]

    monkeypatch.setattr(mcp_router_module, "get_mcp_server", _fake_get)
    monkeypatch.setattr(mcp_router_module, "get_all_mcp_tools", _fake_tools)
    monkeypatch.setattr(mcp_router_module, "get_mcp_tools_stats", lambda _slug: {"enabled": 2, "disabled": 1})

    response = _mcp_client(monkeypatch).post("/api/system/mcp-servers/demo-mcp/tools/refresh")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "success": True,
        "message": "工具列表已刷新，2 个已启用，1 个已禁用",
        "tool_count": 2,
        "enabled_count": 2,
        "disabled_count": 1,
    }


def test_toggle_mcp_server_tool_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_toggle(_db: object, _slug: str, _tool: str, _by: str) -> tuple[bool, None]:
        return True, None

    monkeypatch.setattr(mcp_router_module, "toggle_tool_enabled", _fake_toggle)

    response = _mcp_client(monkeypatch).put("/api/system/mcp-servers/demo-mcp/tools/search/toggle")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "success": True,
        "tool_name": "search",
        "enabled": True,
        "message": "工具 'search' 已启用",
    }


# =============================================================================
# Skill fixtures / helpers
# =============================================================================


def _skill_obj(**overrides: Any) -> Skill:
    """`Skill.to_dict()` 的真实来源对象（数据库 Skill 记录）。"""

    values: dict[str, Any] = {
        "id": 1,
        "slug": "demo",
        "name": "Demo Skill",
        "description": "demo skill",
        "source_type": "upload",
        "tool_dependencies": ["calculator"],
        "mcp_dependencies": ["mcp-a"],
        "skill_dependencies": ["other"],
        "dir_path": "shared/demo",
        "version": "1.0.0",
        "content_hash": "abc123",
        "share_config": {
            "version": 2,
            "read_scope": {"access_level": "global", "department_ids": [], "user_uids": []},
            "manage_scope": None,
        },
        "enabled": True,
        "created_by": "admin",
        "updated_by": "admin",
    }
    values.update(overrides)
    return Skill(**values)


def _card_obj(**overrides: Any) -> ResolvedSkill:
    """`list_skill_cards_for_user` / `list_accessible_skills` 的真实返回对象。"""

    values: dict[str, Any] = {
        "id": 1,
        "slug": "demo",
        "name": "Demo Skill",
        "description": "demo skill",
        "source_type": "upload",
        "source_scope": "shared",
        "source_dir": Path("/tmp/demo"),
        "enabled": True,
        "created_by": "admin",
        "share_config": {
            "version": 2,
            "read_scope": {"access_level": "global", "department_ids": [], "user_uids": []},
            "manage_scope": None,
        },
        "tool_dependencies": ["calculator"],
        "mcp_dependencies": ["mcp-a"],
        "skill_dependencies": ["other"],
    }
    values.update(overrides)
    return ResolvedSkill(**values)


def _managed_payload(item: Skill | ResolvedSkill) -> dict[str, Any]:
    """`_serialize_skill_for_user` 对数据库 Skill 的重组结果。"""

    return {**item.to_dict(), "can_manage": True, "effective_permission": "manage", "is_builtin": False}


def _card_payload(item: ResolvedSkill) -> dict[str, Any]:
    """`_serialize_skill_for_user` 对 ResolvedSkill 的重组结果。"""

    return {**item.to_dict(), "can_manage": True, "effective_permission": "manage", "is_builtin": False}


def _draft_payload(draft_id: str = "draft-1", *, items: list[dict] | None = None) -> dict[str, Any]:
    """`prepare_skill_upload` / `prepare_remote_skill_install` 的真实返回形态。"""

    return {
        "draft_id": draft_id,
        "created_by": "admin",
        "source_type": "upload",
        "source": "SKILL.md",
        "created_at": 1.0,
        "expires_at": 2.0,
        "items": items if items is not None else [{"slug": "demo", "success": True}],
        "default_share_config": {"version": 2, "read_scope": None, "manage_scope": None},
        "allowed_access_levels": ["global", "department", "user"],
    }


def _summary(results: list[dict]) -> dict[str, int]:
    return {
        "total": len(results),
        "success": sum(1 for item in results if item.get("success")),
        "failed": sum(1 for item in results if not item.get("success")),
    }


def _skill_client(monkeypatch: pytest.MonkeyPatch, *, role: str = "admin") -> TestClient:
    # 权限派生不是本契约的对象；固定 can_manage/effective_permission/is_builtin。
    monkeypatch.setattr(skill_router_module, "user_can_manage_skill", lambda _user, _item: True)
    monkeypatch.setattr(
        skill_router_module,
        "resolve_skill_permission",
        lambda _user, _item: SimpleNamespace(value="manage"),
    )
    monkeypatch.setattr(skill_router_module, "is_builtin_skill", lambda _item: False)
    monkeypatch.setattr(
        skill_router_module,
        "get_allowed_skill_access_levels",
        lambda _user: ["global", "department", "user"],
    )

    app = FastAPI()
    app.include_router(skill_router_module.skills, prefix="/api")
    app.include_router(skill_router_module.user_skills, prefix="/api")

    fake_user = SimpleNamespace(uid="admin", username="admin", role=role, department_id=1)

    async def _fake_db() -> None:
        return None

    async def _fake_user() -> SimpleNamespace:
        return fake_user

    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_required_user] = _fake_user
    app.dependency_overrides[get_admin_user] = _fake_user
    return TestClient(app)


def test_list_skill_cards_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    card = _card_obj()

    async def _fake_cards(_db: object, _user: object) -> list[ResolvedSkill]:
        return [card]

    monkeypatch.setattr(skill_router_module, "list_skill_cards_for_user", _fake_cards)

    response = _skill_client(monkeypatch).get("/api/skills")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "success": True,
        "data": [_card_payload(card)],
        "allowed_access_levels": ["global", "department", "user"],
    }


def test_list_accessible_skills_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    card = _card_obj(source_scope="personal", share_config=None)

    async def _fake_accessible(_db: object, _user: object) -> list[ResolvedSkill]:
        return [card]

    monkeypatch.setattr(skill_router_module, "list_accessible_skills", _fake_accessible)

    response = _skill_client(monkeypatch).get("/api/skills/accessible")

    assert response.status_code == 200, response.text
    # 个人 Skill 无 share_config，且该端点不下发 allowed_access_levels。
    assert response.json() == {"success": True, "data": [_card_payload(card)]}
    assert "share_config" not in response.json()["data"][0]
    assert "allowed_access_levels" not in response.json()


def test_prepare_skill_upload_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _draft_payload(items=[_staged_draft_item()])

    async def _fake_prepare(_db: object, **_kwargs: Any) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(skill_router_module, "prepare_skill_upload", _fake_prepare)

    response = _skill_client(monkeypatch).post(
        "/api/skills/import/prepare",
        files={"file": ("SKILL.md", b"---\nname: demo\n---\n", "text/markdown")},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": payload}


def test_list_remote_skills_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_list(_source: str) -> list[dict[str, str]]:
        return [{"name": "frontend-design", "description": "设计前端"}]

    monkeypatch.setattr(skill_router_module, "list_remote_skills", _fake_list)

    response = _skill_client(monkeypatch).post("/api/skills/remote/list", json={"source": "anthropics/skills"})

    assert response.status_code == 200, response.text
    assert response.json() == {
        "success": True,
        "data": [{"name": "frontend-design", "description": "设计前端"}],
    }


def test_search_remote_skills_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_search(_query: str) -> list[dict[str, str]]:
        return [{"source": "anthropics/skills", "name": "frontend-design", "installs": "339.3K installs"}]

    monkeypatch.setattr(skill_router_module, "search_remote_skills", _fake_search)

    response = _skill_client(monkeypatch).post("/api/skills/remote/search", json={"query": "design"})

    assert response.status_code == 200, response.text
    assert response.json() == {
        "success": True,
        "data": [{"source": "anthropics/skills", "name": "frontend-design", "installs": "339.3K installs"}],
    }


def test_prepare_remote_skills_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _draft_payload(
        "draft-remote",
        items=[_staged_draft_item(slug="frontend-design"), _failed_draft_item("broken", "解析失败")],
    )

    async def _fake_prepare(_db: object, **_kwargs: Any) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(skill_router_module, "prepare_remote_skill_install", _fake_prepare)

    response = _skill_client(monkeypatch).post(
        "/api/skills/remote/prepare",
        json={"source": "anthropics/skills", "skills": ["frontend-design"]},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": payload}


def test_confirm_skill_install_draft_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    installed = _skill_obj()
    results = [
        {"slug": "demo", "success": True, "skill": installed.to_dict()},
        {"slug": "broken", "success": False, "error": "解析失败"},
    ]

    async def _fake_confirm(_db: object, **_kwargs: Any) -> list[dict[str, Any]]:
        return results

    monkeypatch.setattr(skill_router_module, "confirm_skill_install_draft", _fake_confirm)

    response = _skill_client(monkeypatch).post(
        "/api/skills/install-drafts/draft-remote/confirm",
        json={"share_config": None, "slugs": ["demo"]},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": results, "summary": _summary(results)}


def test_confirm_personal_skill_install_draft_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    installed = _resolved_card_as_personal()
    results = [
        {"slug": "demo", "requested_slug": "demo-v2", "success": True, "skill": installed.to_dict()},
        {"slug": "broken", "requested_slug": "broken", "success": False, "error": "解析失败"},
    ]

    async def _fake_confirm(**_kwargs: Any) -> list[dict[str, Any]]:
        return results

    monkeypatch.setattr(skill_router_module, "confirm_personal_skill_install_draft", _fake_confirm)

    response = _skill_client(monkeypatch).post(
        "/api/skills/personal/install-drafts/draft-1/confirm",
        json={"slugs": ["demo-v2"]},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": results, "summary": _summary(results)}


def test_read_personal_skill_file_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"path": "SKILL.md", "content": "---\nname: demo\n---\n"}

    async def _fake_read(_uid: str, _slug: str, _path: str) -> dict[str, str]:
        return payload

    monkeypatch.setattr(skill_router_module, "read_personal_skill_file", _fake_read)

    response = _skill_client(monkeypatch).get("/api/skills/personal/demo/file?path=SKILL.md")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": payload}


def test_delete_personal_skill_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_delete(_uid: str, _slug: str) -> None:
        return None

    monkeypatch.setattr(skill_router_module, "delete_personal_skill", _fake_delete)

    response = _skill_client(monkeypatch).delete("/api/skills/personal/demo")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True}


def test_discard_skill_install_draft_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_discard(**_kwargs: Any) -> None:
        return None

    monkeypatch.setattr(skill_router_module, "discard_skill_install_draft", _fake_discard)

    response = _skill_client(monkeypatch).delete("/api/skills/install-drafts/draft-1")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True}


def test_list_visible_skills_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    item = _skill_obj()

    async def _fake_list(_db: object, _user: object) -> list[Skill]:
        return [item]

    monkeypatch.setattr(skill_router_module, "list_visible_skills_for_management", _fake_list)

    response = _skill_client(monkeypatch).get("/api/system/skills")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "success": True,
        "data": [_managed_payload(item)],
        "allowed_access_levels": ["global", "department", "user"],
    }


def test_skill_dependency_options_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "tools": [{"slug": "calculator", "name": "Calculator"}],
        "mcps": ["mcp-a"],
        "skills": ["other"],
    }

    async def _fake_options(_db: object, _user: object, _slug: str | None) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(skill_router_module, "get_skill_dependency_options", _fake_options)

    response = _skill_client(monkeypatch).get("/api/system/skills/dependency-options")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": payload}


def test_list_builtin_skills_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    item = _skill_obj(slug="builtin-demo", source_type="builtin")

    async def _fake_list(_db: object) -> list[Skill]:
        return [item]

    monkeypatch.setattr(skill_router_module, "list_skills", _fake_list)

    response = _skill_client(monkeypatch).get("/api/system/skills/builtin")

    assert response.status_code == 200, response.text
    # 内置列表直接下发 Skill.to_dict()，不带权限派生字段。
    assert response.json() == {"success": True, "data": [item.to_dict()]}


def test_sync_builtin_skills_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    item = _skill_obj(slug="builtin-demo", source_type="builtin")

    async def _fake_sync(_db: object, **_kwargs: Any) -> list[Skill]:
        return [item]

    monkeypatch.setattr(skill_router_module, "init_builtin_skills", _fake_sync)

    response = _skill_client(monkeypatch).post("/api/system/skills/builtin/sync")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": [item.to_dict()]}


def test_update_skill_share_config_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    item = _skill_obj()

    async def _fake_update(_db: object, **_kwargs: Any) -> Skill:
        return item

    monkeypatch.setattr(skill_router_module, "update_skill_share_config", _fake_update)

    response = _skill_client(monkeypatch).put(
        "/api/system/skills/demo/share-config",
        json={"share_config": None},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": _managed_payload(item)}


def test_update_skill_enabled_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    item = _skill_obj()

    async def _fake_update(_db: object, **_kwargs: Any) -> Skill:
        return item

    monkeypatch.setattr(skill_router_module, "update_skill_enabled", _fake_update)

    response = _skill_client(monkeypatch).put("/api/system/skills/demo/enabled", json={"enabled": True})

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": _managed_payload(item)}


def test_get_skill_tree_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    tree = [
        {"name": "SKILL.md", "path": "SKILL.md", "is_dir": False},
        {
            "name": "scripts",
            "path": "scripts",
            "is_dir": True,
            "children": [{"name": "run.py", "path": "scripts/run.py", "is_dir": False}],
        },
    ]

    async def _fake_tree(_db: object, **_kwargs: Any) -> list[dict[str, Any]]:
        return tree

    monkeypatch.setattr(skill_router_module, "get_skill_tree", _fake_tree)

    response = _skill_client(monkeypatch).get("/api/system/skills/demo/tree")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": tree}


def test_get_skill_file_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"path": "SKILL.md", "content": "---\nname: demo\n---\n"}

    async def _fake_read(_db: object, **_kwargs: Any) -> dict[str, str]:
        return payload

    monkeypatch.setattr(skill_router_module, "read_skill_file", _fake_read)

    response = _skill_client(monkeypatch).get("/api/system/skills/demo/file?path=SKILL.md")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": payload}


def test_create_skill_file_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_create(_db: object, **_kwargs: Any) -> None:
        return None

    monkeypatch.setattr(skill_router_module, "create_skill_node", _fake_create)

    response = _skill_client(monkeypatch).post(
        "/api/system/skills/demo/file",
        json={"path": "notes.md", "is_dir": False, "content": "hi"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True}


def test_update_skill_file_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_update(_db: object, **_kwargs: Any) -> None:
        return None

    monkeypatch.setattr(skill_router_module, "update_skill_file", _fake_update)

    response = _skill_client(monkeypatch).put(
        "/api/system/skills/demo/file",
        json={"path": "SKILL.md", "content": "hi"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True}


def test_update_skill_dependencies_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    item = _skill_obj()

    async def _fake_update(_db: object, **_kwargs: Any) -> Skill:
        return item

    monkeypatch.setattr(skill_router_module, "update_skill_dependencies", _fake_update)

    response = _skill_client(monkeypatch).put(
        "/api/system/skills/demo/dependencies",
        json={"tool_dependencies": ["calculator"], "mcp_dependencies": [], "skill_dependencies": []},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": _managed_payload(item)}


def test_delete_skill_file_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_delete(_db: object, **_kwargs: Any) -> None:
        return None

    monkeypatch.setattr(skill_router_module, "delete_skill_node", _fake_delete)

    response = _skill_client(monkeypatch).delete("/api/system/skills/demo/file?path=notes.md")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True}


def test_delete_skill_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_delete(_db: object, **_kwargs: Any) -> None:
        return None

    monkeypatch.setattr(skill_router_module, "delete_skill", _fake_delete)

    response = _skill_client(monkeypatch).delete("/api/system/skills/demo")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True}


def test_delete_skills_batch_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    results = [
        {"slug": "demo", "success": True},
        {"slug": "broken", "success": False, "error": "删除失败"},
    ]

    async def _fake_delete(_db: object, **_kwargs: Any) -> list[dict[str, Any]]:
        return results

    monkeypatch.setattr(skill_router_module, "delete_skills_batch", _fake_delete)

    response = _skill_client(monkeypatch).post("/api/system/skills/delete-batch", json={"slugs": ["demo", "broken"]})

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": results, "summary": _summary(results)}


def test_export_skill_route_is_not_json(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """导出返回 zip 文件，OpenAPI 里不能再声明成 application/json。"""

    export_path = tmp_path / "demo.zip"
    export_path.write_bytes(b"zip-bytes")

    async def _fake_export(_db: object, **_kwargs: Any) -> tuple[str, str]:
        return str(export_path), "demo.zip"

    monkeypatch.setattr(skill_router_module, "export_skill_zip", _fake_export)

    response = _skill_client(monkeypatch).get("/api/system/skills/demo/export")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert response.content == b"zip-bytes"


# =============================================================================
# Guard: 覆盖检查必须能报出模型漏掉的字段
# =============================================================================


def _staged_draft_item(slug: str = "demo") -> dict[str, Any]:
    """`_stage_skill_draft_item` 的真实成功条目。"""

    return {
        "draft_item_id": "item-1",
        "source_dir": "items/item-1",
        "slug": slug,
        "name": "Demo Skill",
        "original_name": "demo",
        "description": "demo skill",
        "tool_dependencies": [],
        "mcp_dependencies": [],
        "skill_dependencies": [],
        "warnings": [],
        "success": True,
    }


def _failed_draft_item(slug: str, error: str) -> dict[str, Any]:
    return {"slug": slug, "success": False, "error": error}


def _resolved_card_as_personal() -> ResolvedSkill:
    return _card_obj(
        id="personal:demo",
        source_type="personal",
        source_scope="personal",
        share_config=None,
        created_by="admin",
    )


class _NarrowMcpServerItem(BaseModel):
    """故意只覆盖少数字段的模型，用来证明字段覆盖检查不是恒真。"""

    slug: str


class _NarrowSkillItem(BaseModel):
    """故意只覆盖少数字段的模型，用来证明字段覆盖检查不是恒真。"""

    slug: str


def test_contract_guard_reports_fields_the_mcp_model_omits() -> None:
    """负向案例：模型漏掉字段时，覆盖检查必须把它们报出来。"""

    missing = uncovered_paths(_mcp_payload(), _NarrowMcpServerItem)

    assert "id" in missing
    assert "requires_migration" in missing
    assert "is_builtin" in missing


def test_contract_guard_reports_fields_the_skill_model_omits() -> None:
    """负向案例：SkillItem 漏掉字段时，覆盖检查必须把它们报出来。"""

    missing = uncovered_paths(_skill_obj().to_dict(), _NarrowSkillItem)

    assert "dir_path" in missing
    assert "content_hash" in missing
    assert "updated_at" in missing


def test_contract_guard_accepts_covering_models() -> None:
    """模型覆盖完整时覆盖检查为空，否则守卫会永远失败。"""

    assert uncovered_paths(_mcp_payload(), mcp_router_module.McpServerItem) == []
    assert uncovered_paths(_skill_obj().to_dict(), skill_router_module.SkillItem) == []
    assert uncovered_paths(_skill_obj().to_dict(), skill_router_module.ManagedSkillItem) == []
    assert uncovered_paths(_card_obj().to_dict(), skill_router_module.SkillCardItem) == []
    assert uncovered_paths(_card_obj().to_dict(), skill_router_module.SkillResolvedItem) == []
    assert uncovered_paths(_staged_draft_item(), skill_router_module.SkillDraftItem) == []
