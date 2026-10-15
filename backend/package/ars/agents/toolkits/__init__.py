# toolkits 包

from ars.config.runtime import knowledge_capability_enabled

# 触发各模块的 @tool 装饰器执行，自动注册工具
from . import buildin, debug

# 工具获取函数
from .registry import (
    ToolExtraMetadata,
    get_all_extra_metadata,
    get_all_tool_instances,
    get_extra_metadata,
    tool,
)

if not knowledge_capability_enabled():

    def get_common_kb_tools() -> list:
        """LITE 进程不注册或暴露知识库工具。"""

        return []

else:
    from .kbs import get_common_kb_tools

__all__ = [
    "get_extra_metadata",
    "get_all_extra_metadata",
    "get_all_tool_instances",
    "ToolExtraMetadata",
    "tool",
    "get_common_kb_tools",
    # 触发各模块的 @tool 装饰器执行，自动注册工具
    "buildin",
    "debug",
]
