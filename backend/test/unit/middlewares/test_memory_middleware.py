from __future__ import annotations

from types import SimpleNamespace

import pytest

from ars.agents.middlewares import memory as memory_middleware

pytestmark = pytest.mark.unit


async def test_create_memory_middleware_hides_all_tools_when_disabled(monkeypatch: pytest.MonkeyPatch):
    async def fake_load(_uid: str):
        return None

    monkeypatch.setattr(memory_middleware, "load_memory_prompt", fake_load)

    middleware = await memory_middleware.create_memory_middleware(SimpleNamespace(uid="user-1"))

    assert middleware is None


async def test_create_memory_middleware_registers_fixed_tool_schema(monkeypatch: pytest.MonkeyPatch):
    async def fake_load(_uid: str):
        return "偏好中文"

    monkeypatch.setattr(memory_middleware, "load_memory_prompt", fake_load)

    middleware = await memory_middleware.create_memory_middleware(SimpleNamespace(uid="user-1"))

    assert middleware is not None
    assert "偏好中文" in middleware.system_prompt
    assert [tool.name for tool in middleware.tools] == [
        "remember_memory",
        "search_thread_messages",
        "read_thread_messages",
    ]
    remember_schema = middleware.tools[0].tool_call_schema.model_json_schema()
    assert set(remember_schema["properties"]) == {"content", "replaces"}
    assert "uid" not in remember_schema["properties"]
    assert "path" not in remember_schema["properties"]
