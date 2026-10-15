from dataclasses import dataclass, field

from ars.agents.context import BaseContext


@dataclass(kw_only=True)
class SubAgentContext(BaseContext):
    parent_thread_id: str | None = field(
        default=None,
        metadata={"name": "父线程ID", "configurable": False, "hide": True},
    )
    is_subagent_runtime: bool = field(
        default=False,
        metadata={"name": "子智能体运行态", "configurable": False, "hide": True},
    )
