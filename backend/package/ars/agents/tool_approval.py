from typing import Literal

from langchain.agents.middleware import HumanInTheLoopMiddleware

ToolApprovalMode = Literal["default", "always_trust"]

DEFAULT_TOOL_APPROVAL_MODE: ToolApprovalMode = "default"
TOOL_APPROVAL_MODES = frozenset({"default", "always_trust"})
# 默认审批模式下需要拦截/隐藏的敏感 backend 工具，是中断配置的唯一来源。
SENSITIVE_BACKEND_TOOLS = frozenset({"write_file", "edit_file", "execute"})
TOOL_APPROVAL_INTERRUPT_ON = {
    tool_name: {"allowed_decisions": ["approve", "reject"]} for tool_name in SENSITIVE_BACKEND_TOOLS
}


def normalize_tool_approval_mode(value: object) -> ToolApprovalMode:
    mode = value.strip() if isinstance(value, str) else value
    if mode not in TOOL_APPROVAL_MODES:
        raise ValueError(f"不支持的 tool_approval_mode: {value}")
    return mode


def create_tool_approval_middleware(mode: ToolApprovalMode):
    if mode == "always_trust":
        return None
    return HumanInTheLoopMiddleware(interrupt_on=TOOL_APPROVAL_INTERRUPT_ON)
