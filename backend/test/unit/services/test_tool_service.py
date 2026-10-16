from __future__ import annotations

from types import SimpleNamespace

from ars.agents.toolkits import service as tool_service


def test_get_tool_metadata_includes_config_guide(monkeypatch):
    tool_service._metadata_cache.clear()

    fake_tool = SimpleNamespace(
        name="demo_tool",
        description="demo description",
        metadata={},
        args_schema=None,
    )
    fake_extra = SimpleNamespace(
        category="buildin",
        tags=["demo"],
        display_name="演示工具",
        config_guide="请先配置 DEMO_API_KEY",
    )

    monkeypatch.setattr(
        "ars.agents.toolkits.registry.get_all_tool_instances",
        lambda: [fake_tool],
    )
    monkeypatch.setattr(
        "ars.agents.toolkits.registry.get_all_extra_metadata",
        lambda: {"demo_tool": fake_extra},
    )

    result = tool_service.get_tool_metadata()

    assert result == [
        {
            "slug": "demo_tool",
            "name": "演示工具",
            "description": "demo description",
            "metadata": {},
            "args": [],
            "args_schema": {},
            "category": "buildin",
            "tags": ["demo"],
            "config_guide": "请先配置 DEMO_API_KEY",
        }
    ]

    tool_service._metadata_cache.clear()


def test_get_tool_metadata_keeps_the_full_args_schema(monkeypatch):
    """声明了参数的工具要同时给出拍平后的 `args` 与完整 JSON Schema。

    `args` 只有名称/类型/描述，判断必填与嵌套结构要靠 `args_schema`；两者缺一都不够用。
    """

    tool_service._metadata_cache.clear()

    from pydantic import BaseModel

    class DemoArgs(BaseModel):
        query: str
        limit: int = 5

    fake_tool = SimpleNamespace(
        name="demo_tool",
        description="demo description",
        metadata={},
        args_schema=DemoArgs,
    )
    monkeypatch.setattr(
        "ars.agents.toolkits.registry.get_all_tool_instances",
        lambda: [fake_tool],
    )
    monkeypatch.setattr(
        "ars.agents.toolkits.registry.get_all_extra_metadata",
        lambda: {
            "demo_tool": SimpleNamespace(
                category="buildin", tags=[], display_name="", config_guide=""
            )
        },
    )

    info = tool_service.get_tool_metadata()[0]

    assert [arg["name"] for arg in info["args"]] == ["query", "limit"]
    assert info["args_schema"]["properties"]["limit"]["default"] == 5
    assert info["args_schema"]["required"] == ["query"]

    tool_service._metadata_cache.clear()


def test_real_tools_expose_a_usable_args_schema():
    """门槛：真实工具的 schema 必须带必填与类型信息。

    如果 `args_schema` 与拍平后的 `args` 一样只有字段名，它就只是又一个空壳，
    调用方仍然判断不了必填与嵌套结构。
    """

    tool_service._metadata_cache.clear()

    items = tool_service.get_tool_metadata()

    assert items
    for item in items:
        assert isinstance(item["args_schema"], dict)
    declared = [item for item in items if item["args"]]
    assert declared
    for item in declared:
        assert item["args_schema"].get("properties")
    assert any("required" in item["args_schema"] for item in declared)

    tool_service._metadata_cache.clear()
