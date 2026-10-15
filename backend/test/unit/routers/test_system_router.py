from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import server.routers.system_router as system_router
from server.routers.system_router import system

pytestmark = pytest.mark.unit


def test_discovery_endpoint_is_public(monkeypatch):
    monkeypatch.setattr("server.routers.system_router.get_version", lambda: "0.7.1.dev0")
    monkeypatch.delenv("LITE_MODE", raising=False)

    app = FastAPI()
    app.include_router(system, prefix="/api")
    response = TestClient(app).get("/api/system/discovery")

    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "ARS"
    assert payload["version"] == "0.7.1.dev0"
    assert payload["api_prefix"] == "/api"
    assert payload["capabilities"]["features"]["knowledge"] is True
    assert payload["capabilities"]["cli"]["browser_login"] is True
    assert payload["capabilities"]["cli"]["api_key_auth"] is True
    assert payload["capabilities"]["cli"]["kb_upload"] is True
    assert payload["endpoints"]["cli_auth_sessions"] == "/api/auth/cli/sessions"
    assert payload["endpoints"]["readiness"] == "/api/system/ready"


def test_lite_discovery_does_not_advertise_unregistered_knowledge_routes(monkeypatch):
    monkeypatch.setenv("LITE_MODE", "true")
    app = FastAPI()
    app.include_router(system, prefix="/api")

    response = TestClient(app).get("/api/system/discovery")

    assert response.status_code == 200
    capabilities = response.json()["capabilities"]
    assert capabilities["features"]["knowledge"] is False
    for name in ("kb_upload", "kb_list", "kb_files", "kb_query", "kb_open", "kb_find"):
        assert capabilities["cli"][name] is False


def test_readiness_endpoint_returns_structured_503(monkeypatch):
    async def fake_readiness(*, startup_complete: bool, startup_components):
        assert startup_complete is False
        assert startup_components is None
        return {
            "status": "not_ready",
            "checks": {
                "startup": {"status": "error", "code": "not_complete"},
                "postgres": {"status": "ok"},
                "redis": {"status": "ok"},
            },
        }

    monkeypatch.setattr(system_router, "get_readiness", fake_readiness)
    monkeypatch.setattr(system_router, "get_version", lambda: "0.7.2.dev0")
    app = FastAPI()
    app.include_router(system, prefix="/api")

    response = TestClient(app).get("/api/system/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"
    assert response.json()["version"] == "0.7.2.dev0"


def test_serialize_system_config_includes_field_metadata():
    result = system_router._serialize_system_config({"default_model": "test-provider:latest"})

    assert result["default_model"] == "test-provider:latest"
    assert result["_config_items"]["default_model"]["type"] == "model"
