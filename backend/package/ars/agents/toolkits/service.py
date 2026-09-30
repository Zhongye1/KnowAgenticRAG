from typing import Any

from ars.utils import logger

# 工具元数据缓存
_metadata_cache: list[dict] = []


def _extract_tool_info(tool_obj) -> dict:
    """从 tool_obj 提取基础信息"""
    metadata = getattr(tool_obj, "metadata", {}) or {}
    info = {
        "slug": tool_obj.name,
        "name": metadata.get("name", tool_obj.name),  # 显示名称优先从 metadata 获取
        "description": tool_obj.description,
        "metadata": metadata,
        "args": [],
    }

    if hasattr(tool_obj, "args_schema") and tool_obj.args_schema:
        schema = tool_obj.args_schema
        if hasattr(schema, "schema"):
            schema = schema.schema()
        for arg_name, arg_info in schema.get("properties", {}).items():
            info["args"].append(
                {
                    "name": arg_name,
                    "type": arg_info.get("type", ""),
                    "description": arg_info.get("description", ""),
                }
            )
    return info


def _ensure_metadata_loaded():
    """延迟加载工具元数据（首次调用时自动触发）"""
    global _metadata_cache

    if _metadata_cache:  # 已加载
        return

    from ars.agents.toolkits.registry import (
        get_all_extra_metadata,
        get_all_tool_instances,
    )

    # 获取所有工具实例
    all_tools = get_all_tool_instances()
    extra_meta = get_all_extra_metadata()

    for tool in all_tools:
        tool_name = tool.name
        runtime_info = _extract_tool_info(tool)

        # 合并附加元数据
        if tool_name in extra_meta:
            extra = extra_meta[tool_name]
            runtime_info["category"] = extra.category
            runtime_info["tags"] = extra.tags
            runtime_info["config_guide"] = extra.config_guide
            # display_name 优先级高于 tool.name
            if extra.display_name:
                runtime_info["name"] = extra.display_name
        else:
            # 未注册，设为默认分类
            runtime_info["category"] = "buildin"
            runtime_info["tags"] = []
            runtime_info["config_guide"] = ""

        _metadata_cache.append(runtime_info)

    logger.info(f"Tool service loaded {len(_metadata_cache)} tools (lazy load)")


def get_tool_metadata(category: str = None) -> list[dict]:
    """获取工具元数据列表（延迟加载）"""
    _ensure_metadata_loaded()

    if category:
        return [t for t in _metadata_cache if t.get("category") == category]
    return _metadata_cache


def get_tool_instances_by_category(category: str) -> list[Any]:
    from ars.agents.toolkits.registry import get_all_extra_metadata, get_all_tool_instances

    extra_meta = get_all_extra_metadata()
    tools = []
    for tool in get_all_tool_instances():
        tool_meta = extra_meta.get(tool.name)
        tool_category = tool_meta.category if tool_meta else "buildin"
        if tool_category == category:
            tools.append(tool)
    return tools


async def resolve_configured_runtime_tools(context) -> list[Any]:
    from ars.agents.mcp.service import get_enabled_mcp_tools

    selected_tools = []
    selected_tool_names: set[str] = set()
    selected_tool_sources: dict[str, str] = {}
    buildin_tools = {tool.name: tool for tool in get_tool_instances_by_category("buildin")}

    for tool_name in getattr(context, "tools", None) or []:
        if not isinstance(tool_name, str) or tool_name in selected_tool_names:
            continue
        tool = buildin_tools.get(tool_name)
        if tool is None:
            logger.warning(f"Configured buildin tool not found, skip: {tool_name}")
            continue
        selected_tools.append(tool)
        selected_tool_names.add(tool_name)
        selected_tool_sources[tool_name] = "local"

    selected_mcp_servers: set[str] = set()
    for server_name in getattr(context, "mcps", None) or []:
        if not isinstance(server_name, str) or server_name in selected_mcp_servers:
            continue
        selected_mcp_servers.add(server_name)
        try:
            mcp_tools = await get_enabled_mcp_tools(server_name)
        except Exception as e:
            logger.warning(f"Failed to load configured MCP tools '{server_name}': {e}")
            continue
        if not mcp_tools:
            logger.warning(f"Configured MCP unavailable, skip: {server_name}")
            continue
        for tool in mcp_tools:
            if tool.name in selected_tool_names:
                raise RuntimeError(
                    f"工具名冲突：MCP '{server_name}' 的 '{tool.name}' 与 {selected_tool_sources[tool.name]} 工具同名"
                )
            selected_tools.append(tool)
            selected_tool_names.add(tool.name)
            selected_tool_sources[tool.name] = f"MCP '{server_name}'"

    # Skill 依赖的本地工具：必须随基础工具一起注册进 create_agent 的 ToolNode 才可执行，
    # 否则 Skill 激活后模型虽能发起调用，执行器仍报 "not a valid tool"。
    # 默认绑定给模型的可见性由 SkillsMiddleware 按 Skill 激活状态门控（保持按需加载）。
    from ars.agents.skills.runtime import resolve_skill_gated_tools

    for tool in resolve_skill_gated_tools(context):
        if tool.name in selected_tool_names:
            if selected_tool_sources[tool.name] != "local":
                source = selected_tool_sources[tool.name]
                raise RuntimeError(f"工具名冲突：Skill 本地工具 '{tool.name}' 与 {source} 同名")
            continue
        selected_tools.append(tool)
        selected_tool_names.add(tool.name)
        selected_tool_sources[tool.name] = "local"

    return selected_tools
