from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from ars.agents.mcp.service import MCPServerNotFoundError
from ars.storage.postgres.models_business import User

from server.routers.mcp_router import mcp
from server.utils.auth_middleware import get_admin_user, get_db, get_required_user


def _mcp_server_dict(
    *,
    slug: str = "demo-mcp",
    name: str = "demo-mcp",
    transport: str = "streamable_http",
    enabled: bool = True,
    url: str = "https://example.com/mcp",
    command: str | None = None,
    args: list | None = None,
    env: dict | None = None,
    headers: dict | None = None,
) -> dict:
    """`MCPServer.to_dict()` 的真实形态；`serialize_mcp_server` 再补 is_builtin/requires_migration。"""

    return {
        "id": 1,
        "slug": slug,
        "name": name,
        "description": f"{name} description",
        "transport": transport,
        "url": url,
        "command": command,
        "args": args or [],
        "env": env or {},
        "headers": headers or {},
        "timeout": None,
        "sse_read_timeout": None,
        "tags": [],
        "icon": None,
        "enabled": bool(enabled),
        "disabled_tools": [],
        "created_by": "admin",
        "updated_by": "admin",
        "created_at": "2026-10-16 12:00:00",
        "updated_at": "2026-10-16 12:00:00",
    }


def _build_app(*, allow_admin: bool = True) -> FastAPI:
    app = FastAPI()
    app.include_router(mcp, prefix="/api")

    async def fake_db():
        return None

    async def fake_admin_user():
        if not allow_admin:
            from fastapi import HTTPException

            raise HTTPException(status_code=403, detail="需要管理员权限")
        return User(
            username="admin",
            uid="admin",
            password_hash="x",
            role="admin",
        )

    async def fake_required_user():
        return User(
            username="admin" if allow_admin else "user",
            uid="admin" if allow_admin else "user",
            password_hash="x",
            role="admin" if allow_admin else "user",
        )

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_admin_user] = fake_admin_user
    app.dependency_overrides[get_required_user] = fake_required_user
    return app


def test_update_mcp_server_status(monkeypatch):
    captured = {}

    class DummyServer:
        def __init__(self, enabled):
            self.slug = "demo-mcp"
            self.transport = "streamable_http"
            self.enabled = enabled

        def to_dict(self):
            return _mcp_server_dict(slug="demo-mcp", enabled=self.enabled)

    async def fake_set_server_enabled(db, name, enabled, updated_by=None):
        captured["name"] = name
        captured["enabled"] = enabled
        captured["updated_by"] = updated_by
        return enabled, DummyServer(enabled)

    monkeypatch.setattr("server.routers.mcp_router.set_server_enabled", fake_set_server_enabled)

    client = TestClient(_build_app())
    resp = client.put("/api/system/mcp-servers/demo-mcp/status", json={"enabled": False})
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["success"] is True
    assert payload["enabled"] is False
    assert payload["data"]["enabled"] is False
    assert captured == {"name": "demo-mcp", "enabled": False, "updated_by": "admin"}


def test_update_mcp_server_status_not_found(monkeypatch):
    async def fake_set_server_enabled(db, name, enabled, updated_by=None):
        raise MCPServerNotFoundError(f"Server '{name}' does not exist")

    monkeypatch.setattr("server.routers.mcp_router.set_server_enabled", fake_set_server_enabled)

    client = TestClient(_build_app())
    resp = client.put("/api/system/mcp-servers/missing/status", json={"enabled": True})
    assert resp.status_code == 404, resp.text


def test_update_mcp_server_status_rejects_legacy_stdio(monkeypatch):
    async def fake_set_server_enabled(db, name, enabled, updated_by=None):
        raise ValueError("历史 stdio MCP 已被禁用")

    monkeypatch.setattr("server.routers.mcp_router.set_server_enabled", fake_set_server_enabled)

    client = TestClient(_build_app())
    resp = client.put("/api/system/mcp-servers/legacy-stdio/status", json={"enabled": True})
    assert resp.status_code == 400, resp.text


def test_get_mcp_servers_normal_user_is_stripped(monkeypatch):
    class DummyServer:
        def __init__(self):
            self.name = "test-mcp"
            self.slug = "test-mcp"
            self.description = "test mcp description"
            self.transport = "streamable_http"
            self.url = "http://localhost:8000"
            self.command = "python"
            self.args = ["-m", "mcp"]
            self.env = {"API_KEY": "secret"}
            self.headers = {"Auth": "Bearer secret"}
            self.enabled = 1

        def to_dict(self):
            return _mcp_server_dict(
                slug="test-mcp",
                name="test-mcp",
                transport=self.transport,
                enabled=self.enabled,
                url=self.url,
                command=self.command,
                args=self.args,
                env=self.env,
                headers=self.headers,
            )

    async def fake_get_all_mcp_servers(db):
        return [DummyServer()]

    monkeypatch.setattr("server.routers.mcp_router.get_all_mcp_servers", fake_get_all_mcp_servers)

    # 1. 管理员请求，应该返回全部字段
    client_admin = TestClient(_build_app(allow_admin=True))
    resp_admin = client_admin.get("/api/system/mcp-servers")
    assert resp_admin.status_code == 200
    data_admin = resp_admin.json()["data"][0]
    assert data_admin["url"] == "http://localhost:8000"
    assert data_admin["command"] == "python"
    assert data_admin["env"] == {"API_KEY": "secret"}

    # 2. 普通用户请求，敏感字段及一切非安全白名单字段应该被彻底脱敏
    client_user = TestClient(_build_app(allow_admin=False))
    resp_user = client_user.get("/api/system/mcp-servers")
    assert resp_user.status_code == 200
    data_user = resp_user.json()["data"][0]
    assert "url" not in data_user
    assert "command" not in data_user
    assert "env" not in data_user
    assert "headers" not in data_user
    assert "transport" not in data_user  # NOTE: 进一步验证连 transport 等配置层元数据也一并过滤
    assert data_user["name"] == "test-mcp"
    assert data_user["description"] == "test mcp description"
    assert data_user["enabled"] is True


def test_create_mcp_server_rejects_extra_config_fields():
    client = TestClient(_build_app())
    resp = client.post(
        "/api/system/mcp-servers",
        json={
            "slug": "demo-mcp",
            "name": "Demo MCP",
            "transport": "streamable_http",
            "url": "https://example.com/mcp",
            "enabled": True,
        },
    )

    assert resp.status_code == 422, resp.text


def test_create_mcp_server_rejects_stdio_command():
    client = TestClient(_build_app())
    resp = client.post(
        "/api/system/mcp-servers",
        json={
            "slug": "unsafe-mcp",
            "name": "Unsafe MCP",
            "transport": "stdio",
            "command": "python3",
            "args": ["-c", "print('unsafe')"],
        },
    )

    assert resp.status_code == 422, resp.text


def test_update_mcp_server_rejects_extra_config_fields():
    client = TestClient(_build_app())
    resp = client.put(
        "/api/system/mcp-servers/demo-mcp",
        json={
            "name": "Demo MCP",
            "transport": "streamable_http",
            "url": "https://example.com/mcp",
            "slug": "renamed-mcp",
        },
    )

    assert resp.status_code == 422, resp.text


def test_update_builtin_mcp_server_rejects_connection_changes(monkeypatch):
    async def fake_update_mcp_server(db, slug, **kwargs):
        raise PermissionError("系统内置 MCP 的连接配置由代码管理，无法通过接口修改")

    monkeypatch.setattr("server.routers.mcp_router.update_mcp_server", fake_update_mcp_server)

    client = TestClient(_build_app())
    resp = client.put(
        "/api/system/mcp-servers/mcp-server-chart",
        json={
            "transport": "streamable_http",
            "url": "https://example.com/mcp",
        },
    )

    assert resp.status_code == 403, resp.text


def test_update_mcp_server_not_found(monkeypatch):
    async def fake_update_mcp_server(db, slug, **kwargs):
        raise MCPServerNotFoundError(f"Server '{slug}' does not exist")

    monkeypatch.setattr("server.routers.mcp_router.update_mcp_server", fake_update_mcp_server)

    client = TestClient(_build_app())
    resp = client.put(
        "/api/system/mcp-servers/missing",
        json={"name": "Missing MCP"},
    )

    assert resp.status_code == 404, resp.text
