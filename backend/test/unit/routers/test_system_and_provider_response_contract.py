"""system / tools / model-provider 路由的响应契约：响应体必须与 handler 载荷逐键一致。

`response_model` 会按模型裁剪响应体，漏字段就静默丢数据；声明了「有时不下发」的字段
又会让响应多出 null 键。断言「响应 JSON == 载荷」同时守住两个方向，因此这些用例就是
补 schema 时的 oracle：模型写窄或写宽都会失败。

测试只 monkeypatch service 层与 `system_options`，并用 dependency_overrides 覆盖鉴权与
DB，不连真实数据库、不发网络请求。
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

system_router_module = importlib.import_module("server.routers.system_router")
tool_router_module = importlib.import_module("server.routers.tool_router")
provider_router_module = importlib.import_module("server.routers.model_provider_router")
options_module = importlib.import_module("ars.config.options")
ocr_service_module = importlib.import_module("ars.services.ocr_service")
provider_cache_module = importlib.import_module("ars.models.providers.cache")

_FAKE_USER = SimpleNamespace(username="admin", uid="admin", role="admin")


class _FakeDb:
    """仅承载 handler 里的 commit/refresh 调用，不触碰真实数据库。"""

    async def commit(self) -> None:
        return None

    async def refresh(self, *_args: object, **_kwargs: object) -> None:
        return None


def _client(router: object) -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/api")

    async def _fake_db() -> _FakeDb:
        return _FakeDb()

    async def _fake_user() -> SimpleNamespace:
        return _FAKE_USER

    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_required_user] = _fake_user
    app.dependency_overrides[get_admin_user] = _fake_user
    return TestClient(app)


# =============================================================================
# === system ===
# =============================================================================

_SYSTEM_CONFIG_VALUES: dict[str, Any] = {
    "enable_content_guard": False,
    "enable_content_guard_llm": False,
    "default_model": "siliconflow-cn:Pro/MiniMaxAI/MiniMax-M2.5",
    "fast_model": "siliconflow-cn:Pro/MiniMaxAI/MiniMax-M2.5",
    "embed_model": "siliconflow-cn:Pro/BAAI/bge-m3",
    "reranker": "siliconflow-cn:Pro/BAAI/bge-reranker-v2-m3",
    "content_guard_llm_model": "siliconflow-cn:Pro/MiniMaxAI/MiniMax-M2.5",
    "default_ocr_engine": "mineru_official",
}


def _system_config_payload() -> dict[str, Any]:
    """`_serialize_system_config` 的真实形状：配置值 + `_config_items`。"""

    return {
        **_SYSTEM_CONFIG_VALUES,
        "_config_items": {
            key: {"des": key, "default": value, "type": "string", "exclude": False}
            for key, value in _SYSTEM_CONFIG_VALUES.items()
        },
    }


class _FakeSystemOptions:
    """对齐 `system_options` 的 `key` / `fields` / `get`。"""

    key = "system_options"
    fields = [
        {"key": key, "label": key, "type": "string", "default": value}
        for key, value in _SYSTEM_CONFIG_VALUES.items()
    ]

    async def get(self, _db: object = None) -> dict[str, Any]:
        return dict(_SYSTEM_CONFIG_VALUES)


def _readiness_payload(status: str = "ready") -> dict[str, Any]:
    error_check = {"status": "error", "code": "not_complete"} if status != "ready" else {"status": "ok"}
    return {
        "status": status,
        "degraded": False,
        "checks": {
            "startup": error_check,
            "postgres": {"status": "ok"},
            "redis": {"status": "ok"},
            "worker": {"status": "ok"},
        },
        "components": {
            "postgres": {"status": "ok", "required": True},
            "redis": {"status": "ok", "required": True},
            "worker": {"status": "ok", "required": True, "code": "renewed"},
        },
    }


_DISCOVERY_PAYLOAD: dict[str, Any] = {
    "name": "ARS",
    "version": "0.7.2.dev0",
    "api_prefix": "/api",
    "capabilities": {
        "features": {"knowledge": True},
        "cli": {
            "min_cli_version": "0.1.0",
            "browser_login": True,
            "api_key_auth": True,
            "remote_config": True,
            "kb_upload": True,
            "kb_list": True,
            "kb_files": True,
            "kb_query": True,
            "kb_open": True,
            "kb_find": True,
        },
    },
    "endpoints": {
        "health": "/api/system/health",
        "readiness": "/api/system/ready",
        "auth_me": "/api/auth/me",
        "cli_auth_sessions": "/api/auth/cli/sessions",
        "cli_auth_authorize": "/auth/cli/authorize",
    },
}


def _config_option_payload() -> dict[str, Any]:
    """`serialize_option` 对敏感字段的真实形状。"""

    return {
        "key": "mineru_official_api_opts",
        "name": "MinerU Official",
        "description": "配置 MinerU 官方云服务凭证。",
        "params": {
            "fields": [
                {
                    "key": "api_key",
                    "label": "API Key",
                    "type": "password",
                    "environment": "MINERU_API_KEY",
                    "sensitive": True,
                }
            ]
        },
        "value": {"api_key": ""},
        "sensitive_configured": {"api_key": False},
        "sensitive_state": {"api_key": {"source": "none", "configured": False, "preview": None}},
    }


def _ocr_options_payload() -> dict[str, Any]:
    return {
        "default_engine": "mineru_official",
        "engines": [
            {
                "engine_id": "mineru_official",
                "service_name": "mineru_official",
                "display_name": "MinerU Official",
                "supported_extensions": [".pdf", ".png"],
            }
        ],
    }


def _ocr_health_payload() -> dict[str, Any]:
    return {
        "health": {
            "rapid_ocr": {"status": "healthy", "message": "RapidOCR PP-OCRv5 组件可用", "details": {"version": "5"}},
            "mineru_official": {"status": "configured", "message": "已配置", "details": {}},
        }
    }


def test_health_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(system_router_module, "get_version", lambda: "0.7.2.dev0")

    response = _client(system_router_module.system).get("/api/system/health")

    assert response.status_code == 200, response.text
    assert response.json() == {"status": "ok", "message": "进程正常运行", "version": "0.7.2.dev0"}


def test_ready_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _readiness_payload("ready")

    async def _fake_readiness(**_kwargs: object) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(system_router_module, "get_readiness", _fake_readiness)
    monkeypatch.setattr(system_router_module, "get_version", lambda: "0.7.2.dev0")

    response = _client(system_router_module.system).get("/api/system/ready")

    assert response.status_code == 200, response.text
    assert response.json() == {**payload, "version": "0.7.2.dev0"}


def test_ready_keeps_503_semantics_and_body(monkeypatch: pytest.MonkeyPatch) -> None:
    """503 是正常语义，不能被 response_model 改成异常或裁剪响应体。"""

    payload = _readiness_payload("not_ready")

    async def _fake_readiness(**_kwargs: object) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(system_router_module, "get_readiness", _fake_readiness)
    monkeypatch.setattr(system_router_module, "get_version", lambda: "0.7.2.dev0")

    response = _client(system_router_module.system).get("/api/system/ready")

    assert response.status_code == 503
    assert response.json() == {**payload, "version": "0.7.2.dev0"}


def test_discovery_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(system_router_module, "get_version", lambda: "0.7.2.dev0")
    monkeypatch.setattr(system_router_module, "knowledge_capability_enabled", lambda: True)

    response = _client(system_router_module.system).get("/api/system/discovery")

    assert response.status_code == 200, response.text
    assert response.json() == _DISCOVERY_PAYLOAD


def test_get_config_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(system_router_module, "system_options", _FakeSystemOptions())

    response = _client(system_router_module.system).get("/api/system/config")

    assert response.status_code == 200, response.text
    assert response.json() == _system_config_payload()


def test_update_config_single_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_update_option_value(*_args: object, **_kwargs: object) -> None:
        return None

    async def _fake_invalidate(_key: str) -> None:
        return None

    monkeypatch.setattr(system_router_module, "system_options", _FakeSystemOptions())
    monkeypatch.setattr(system_router_module, "update_option_value", _fake_update_option_value)
    monkeypatch.setattr(system_router_module, "invalidate_option_cache", _fake_invalidate)

    response = _client(system_router_module.system).post(
        "/api/system/config", json={"key": "default_model", "value": "siliconflow-cn:new"}
    )

    assert response.status_code == 200, response.text
    assert response.json() == _system_config_payload()


def test_update_config_batch_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_update_option_value(*_args: object, **_kwargs: object) -> None:
        return None

    async def _fake_invalidate(_key: str) -> None:
        return None

    monkeypatch.setattr(system_router_module, "system_options", _FakeSystemOptions())
    monkeypatch.setattr(system_router_module, "update_option_value", _fake_update_option_value)
    monkeypatch.setattr(system_router_module, "invalidate_option_cache", _fake_invalidate)

    response = _client(system_router_module.system).post(
        "/api/system/config/update", json={"default_ocr_engine": "rapid_ocr"}
    )

    assert response.status_code == 200, response.text
    assert response.json() == _system_config_payload()


def test_logs_response_equals_payload(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> None:
    log_file = tmp_path / "api.log"
    log_file.write_text("alpha\nbeta\n", encoding="utf-8")
    monkeypatch.setattr(system_router_module, "LOG_FILE", str(log_file))

    response = _client(system_router_module.system).get("/api/system/logs")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "log": "alpha\nbeta\n",
        "message": "success",
        "log_file": str(log_file),
        "scope": "api",
    }


def test_info_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    info = {"organization": {"name": "ARS"}, "branding": {"name": "ARS", "subtitles": []}}

    async def _fake_load_info() -> dict[str, Any]:
        return info

    monkeypatch.setattr(system_router_module, "load_info_config", _fake_load_info)

    response = _client(system_router_module.system).get("/api/system/info")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": info}


def test_info_reload_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    info = {"organization": {"name": "ARS"}}

    async def _fake_load_info() -> dict[str, Any]:
        return info

    monkeypatch.setattr(system_router_module, "load_info_config", _fake_load_info)

    response = _client(system_router_module.system).post("/api/system/info/reload")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "message": "配置重新加载成功", "data": info}


def test_config_options_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_list_options(_db: object) -> list[object]:
        return [object()]

    monkeypatch.setattr(options_module, "list_options", _fake_list_options)
    monkeypatch.setattr(options_module, "serialize_option", lambda _record: _config_option_payload())

    response = _client(system_router_module.system).get("/api/system/config/options")

    assert response.status_code == 200, response.text
    assert response.json() == {"options": [_config_option_payload()]}


def test_put_config_option_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    record = object()

    async def _fake_update_option_value(*_args: object, **_kwargs: object) -> object:
        return record

    async def _fake_invalidate(_key: str) -> None:
        return None

    monkeypatch.setattr(options_module, "update_option_value", _fake_update_option_value)
    monkeypatch.setattr(options_module, "serialize_option", lambda _record: _config_option_payload())
    monkeypatch.setattr(system_router_module, "invalidate_option_cache", _fake_invalidate)

    response = _client(system_router_module.system).put(
        "/api/system/config/options/mineru_official_api_opts", json={"value": {"api_key": ""}}
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"option": _config_option_payload()}


def test_ocr_options_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_ocr_options(_db: object) -> dict[str, Any]:
        return _ocr_options_payload()

    monkeypatch.setattr(ocr_service_module, "get_ocr_options", _fake_get_ocr_options)

    response = _client(system_router_module.system).get("/api/system/ocr/options")

    assert response.status_code == 200, response.text
    assert response.json() == _ocr_options_payload()


def test_ocr_health_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_check_all(_db: object) -> dict[str, Any]:
        return _ocr_health_payload()["health"]

    monkeypatch.setattr(ocr_service_module, "check_all_ocr_health", _fake_check_all)

    response = _client(system_router_module.system).get("/api/system/ocr/health")

    assert response.status_code == 200, response.text
    assert response.json() == _ocr_health_payload()


# =============================================================================
# === tools ===
# =============================================================================


def _tool_item() -> dict[str, Any]:
    return {
        "slug": "web_search",
        "name": "网络搜索",
        "description": "搜索互联网",
        "metadata": {"name": "网络搜索"},
        "args": [{"name": "query", "type": "string", "description": "查询词"}],
        "category": "buildin",
        "tags": ["搜索"],
        "config_guide": "需配置 API Key",
    }


def test_tools_list_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tool_router_module, "get_tool_metadata", lambda _category=None: [_tool_item()])

    response = _client(tool_router_module.tools).get("/api/system/tools")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": [_tool_item()]}


def test_tool_options_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tool_router_module, "get_tool_metadata", lambda: [_tool_item()])

    response = _client(tool_router_module.tools).get("/api/system/tools/options")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": [{"label": "网络搜索", "value": "web_search"}]}


# =============================================================================
# === model providers ===
# =============================================================================


def _provider_dict() -> dict[str, Any]:
    return {
        "id": 3,
        "provider_id": "siliconflow-cn",
        "display_name": "SiliconFlow",
        "provider_type": "openai",
        "default_protocol": None,
        "base_url": "https://api.siliconflow.cn/v1",
        "embedding_base_url": None,
        "rerank_base_url": None,
        "models_endpoint": "models",
        "embedding_models_endpoint": None,
        "rerank_models_endpoint": None,
        "api_key_env": "SILICONFLOW_API_KEY",
        "api_key": None,
        "capabilities": ["chat", "embedding", "rerank"],
        "enabled_models": [
            {"id": "Qwen/Qwen3-8B", "type": "chat", "source": "remote", "display_name": "Qwen3 8B", "extra": {}}
        ],
        "headers_json": {},
        "extra_json": {},
        "is_enabled": True,
        "is_builtin": True,
        "created_by": "system",
        "updated_by": "system",
        "created_at": "2026-10-16T12:00:00+00:00",
        "updated_at": "2026-10-16T12:00:00+00:00",
    }


class _FakeProvider:
    provider_id = "siliconflow-cn"
    display_name = "SiliconFlow"

    @staticmethod
    def to_dict() -> dict[str, Any]:
        return _provider_dict()


def _remote_model() -> dict[str, Any]:
    """`_normalize_remote_model` 的真实形状：值为 None 的键被丢弃。"""

    return {
        "id": "Qwen/Qwen3-8B",
        "object": "model",
        "created": 1700000000,
        "owned_by": "siliconflow",
        "type": "chat",
        "display_name": "Qwen3 8B",
        "context_length": 32768,
        "input_modalities": ["text"],
        "output_modalities": ["text"],
        "supported_parameters": ["temperature"],
        "pricing": {"input": "0"},
        "default_parameters": {},
        "raw_metadata": {"id": "Qwen/Qwen3-8B"},
        "extra": {},
    }


class _FakeModelInfo:
    def __init__(self, model_id: str, display_name: str, dimension: int | None, batch_size: int | None) -> None:
        self.provider_id = "siliconflow-cn"
        self.model_id = model_id
        self.display_name = display_name
        self.dimension = dimension
        self.batch_size = batch_size
        self.model_type = "chat"

    @property
    def spec(self) -> str:
        return f"{self.provider_id}:{self.model_id}"


class _FakeModelCache:
    def get_all_specs(self) -> list[_FakeModelInfo]:
        return [_FakeModelInfo("Qwen/Qwen3-8B", "Qwen3 8B", None, 40)]

    def get_specs_grouped_by_provider(self, _model_type: str = "chat") -> dict[str, list[_FakeModelInfo]]:
        return {"siliconflow-cn": [_FakeModelInfo("Qwen/Qwen3-8B", "Qwen3 8B", None, 40)]}


async def _noop_async(*_args: object, **_kwargs: object) -> None:
    return None


def _patch_providers(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_all(_db: object) -> list[_FakeProvider]:
        return [_FakeProvider()]

    async def _fake_get_by_id(_db: object, _provider_id: str) -> _FakeProvider:
        return _FakeProvider()

    async def _fake_create(_db: object, _data: object, _username: str) -> _FakeProvider:
        return _FakeProvider()

    async def _fake_update(_db: object, _provider_id: str, _data: object, _username: str) -> _FakeProvider:
        return _FakeProvider()

    async def _fake_delete(_db: object, _provider_id: str) -> bool:
        return True

    async def _fake_fetch(_provider: object) -> list[dict[str, Any]]:
        return [_remote_model()]

    async def _fake_status(_spec: str) -> dict[str, Any]:
        return {"spec": _spec, "status": "available", "message": "连接正常", "model_type": "chat"}

    monkeypatch.setattr(provider_router_module, "get_all_model_providers", _fake_get_all)
    monkeypatch.setattr(provider_router_module, "get_model_provider_by_id", _fake_get_by_id)
    monkeypatch.setattr(provider_router_module, "create_provider_config", _fake_create)
    monkeypatch.setattr(provider_router_module, "update_provider_config", _fake_update)
    monkeypatch.setattr(provider_router_module, "delete_provider_config", _fake_delete)
    monkeypatch.setattr(provider_router_module, "fetch_remote_models", _fake_fetch)
    monkeypatch.setattr(provider_router_module, "test_model_status_by_spec", _fake_status)
    monkeypatch.setattr(provider_router_module, "check_credential_status", lambda _p: "ok")
    monkeypatch.setattr(provider_router_module, "_refresh_model_cache", _noop_async)
    monkeypatch.setattr(provider_cache_module, "model_cache", _FakeModelCache())


def _create_payload() -> dict[str, Any]:
    return {
        "provider_id": "siliconflow-cn",
        "display_name": "SiliconFlow",
        "base_url": "https://api.siliconflow.cn/v1",
    }


def test_provider_list_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_providers(monkeypatch)

    response = _client(provider_router_module.model_providers).get("/api/system/model-providers")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": [{**_provider_dict(), "credential_status": "ok"}]}


def test_provider_create_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_providers(monkeypatch)

    response = _client(provider_router_module.model_providers).post(
        "/api/system/model-providers", json=_create_payload()
    )

    assert response.status_code == 200, response.text
    # 创建不带 credential_status，response_model_exclude_unset 必须让它缺席。
    assert response.json() == {"success": True, "data": _provider_dict()}


def test_provider_detail_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_providers(monkeypatch)

    response = _client(provider_router_module.model_providers).get("/api/system/model-providers/siliconflow-cn")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": {**_provider_dict(), "credential_status": "ok"}}


def test_provider_update_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_providers(monkeypatch)

    response = _client(provider_router_module.model_providers).put(
        "/api/system/model-providers/siliconflow-cn", json=_create_payload()
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": _provider_dict()}


def test_provider_delete_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_providers(monkeypatch)

    response = _client(provider_router_module.model_providers).delete("/api/system/model-providers/siliconflow-cn")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True}


def test_provider_remote_models_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_providers(monkeypatch)

    response = _client(provider_router_module.model_providers).get(
        "/api/system/model-providers/siliconflow-cn/remote-models"
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": [_remote_model()]}


def test_model_cache_refresh_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_providers(monkeypatch)

    response = _client(provider_router_module.model_providers).post(
        "/api/system/model-providers/models/cache/refresh"
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "message": "缓存已刷新", "model_count": 1}


def test_v2_models_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_providers(monkeypatch)

    response = _client(provider_router_module.model_providers).get("/api/system/model-providers/models/v2")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "success": True,
        "data": {
            "siliconflow-cn": {
                "provider_id": "siliconflow-cn",
                "provider_display_name": "SiliconFlow",
                "models": [
                    {
                        "spec": "siliconflow-cn:Qwen/Qwen3-8B",
                        "model_id": "Qwen/Qwen3-8B",
                        "display_name": "Qwen3 8B",
                        "dimension": None,
                        "batch_size": 40,
                    }
                ],
            }
        },
    }


def test_model_status_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_providers(monkeypatch)

    response = _client(provider_router_module.model_providers).get(
        "/api/system/model-providers/models/status", params={"spec": "siliconflow-cn:Qwen/Qwen3-8B"}
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "success": True,
        "data": {"spec": "siliconflow-cn:Qwen/Qwen3-8B", "status": "available", "message": "连接正常", "model_type": "chat"},
    }


# =============================================================================
# === 覆盖守卫 ===
# =============================================================================


class _NarrowReadinessItem(BaseModel):
    """故意只覆盖少数字段的模型，用来证明字段覆盖检查不是恒真。"""

    status: str


def test_contract_guard_reports_fields_the_model_omits() -> None:
    """负向案例：模型漏掉字段时，覆盖检查必须把它们报出来。"""

    missing = uncovered_paths(_readiness_payload(), _NarrowReadinessItem)

    assert "degraded" in missing
    assert "checks" in missing
    assert "components" in missing


def test_contract_guard_accepts_covering_models() -> None:
    """模型覆盖完整时覆盖检查为空，否则守卫会永远失败。"""

    assert uncovered_paths(_readiness_payload(), system_router_module.ReadinessResponse) == []
    assert uncovered_paths({"success": True, "data": [_tool_item()]}, tool_router_module.ToolListResponse) == []
    assert (
        uncovered_paths(
            {"success": True, "data": [{**_provider_dict(), "credential_status": "ok"}]},
            provider_router_module.ModelProviderListResponse,
        )
        == []
    )
    assert uncovered_paths({"success": True, "data": [_remote_model()]}, provider_router_module.RemoteModelsResponse) == []
