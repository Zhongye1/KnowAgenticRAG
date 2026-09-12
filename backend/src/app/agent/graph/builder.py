"""外层 StateGraph 装配（D34 两层图的外层：服务端确定编排）。

拓扑::

    START → plan ─┬─ act → grade ─┬─ generate → END
                  │        ↑      └─ rewrite ─┘
                  └─ generate（need_retrieval=false，T1 自主决策）

节点级策略（LangGraph 原生，不自研计数器）：

- ``plan``/``rewrite``：``RetryPolicy`` 兜住结构化输出偶发失败；
- ``act``：``TimeoutPolicy`` 硬墙钟，防止内层工具循环挂住请求；
- ``plan``：``CachePolicy`` 使重复问句零模型成本。

整体步数由调用方以 ``config={'recursion_limit': max_steps}`` 传入（D36 三重预算之一）。
"""

from __future__ import annotations

import inspect

from dataclasses import dataclass, field
from typing import Any

from langgraph.graph import END, START, StateGraph
from langgraph.types import CachePolicy, RetryPolicy

from backend.src.app.agent.graph.nodes.act import make_act_node
from backend.src.app.agent.graph.nodes.generate import make_generate_node
from backend.src.app.agent.graph.nodes.grade import make_grade_node, make_grade_router
from backend.src.app.agent.graph.nodes.plan import make_plan_node, route_after_plan
from backend.src.app.agent.graph.nodes.rewrite import make_rewrite_node
from backend.src.app.agent.graph.state import AgentState
from backend.src.app.agent.graph.tools import ToolContext, build_tools

__all__ = ['AgentGraphConfig', 'build_agent_graph']

_PLAN_CACHE_TTL = 300  # 规划结果缓存 5 分钟：同问句重复提问零模型成本


def _plan_cache_key(payload: dict[str, Any]) -> str:
    """按问句缓存规划（含库集合，避免跨库复用错误计划）。"""
    state = payload if isinstance(payload, dict) else {}
    kb_names = ','.join(str(item) for item in (state.get('kb_names') or []))
    return f'agent-plan::{kb_names}::{state.get("query") or ""}'


@dataclass(frozen=True)
class AgentGraphConfig:
    """一次 Agent 图的构建期参数（按请求构建，故可直接持有请求级字段）。"""

    kb_name: str = ''
    kb_names: list[str] = field(default_factory=list)
    model_spec: str = ''
    max_sub_queries: int = 3
    max_rewrites: int = 1
    min_score: float = 0.3
    allow_rewrite: bool = True
    act_timeout_seconds: float = 90.0
    act_recursion_limit: int = 12
    context_max_tokens: int = 4096
    history_rounds: int = 10
    temperature: float | None = None
    max_tokens: int | None = None
    thinking_level: str | None = None
    history: list[dict[str, str]] | None = None
    attachments: list[dict[str, Any]] | None = None


def _resolve_nodes(
    *,
    model: Any,
    tool_ctx: ToolContext,
    config: AgentGraphConfig,
    provided: dict[str, Any] | None,
) -> dict[str, Any]:
    """按需构建节点：被 ``provided`` 覆盖的键不实例化默认实现（单测免造模型）。"""
    nodes: dict[str, Any] = dict(provided or {})
    if 'plan' not in nodes:
        nodes['plan'] = make_plan_node(model=model, max_sub_queries=config.max_sub_queries)
    if 'act' not in nodes:
        nodes['act'] = make_act_node(
            model=model,
            tools=build_tools(tool_ctx),
            tool_ctx=tool_ctx,
            recursion_limit=config.act_recursion_limit,
        )
    if 'grade' not in nodes:
        nodes['grade'] = make_grade_node()
    if 'rewrite' not in nodes:
        nodes['rewrite'] = make_rewrite_node(model=model)
    if 'generate' not in nodes:
        nodes['generate'] = make_generate_node(
            model=model,
            kb_names=config.kb_names,
            model_spec=config.model_spec,
            context_max_tokens=config.context_max_tokens,
            history=config.history,
            attachments=config.attachments,
            history_rounds=config.history_rounds,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            thinking_level=config.thinking_level,
        )
    return nodes


def _add_nodes(builder: StateGraph, nodes: dict[str, Any], config: AgentGraphConfig) -> None:
    """装配节点与节点级策略（LangGraph 原生，不自研计数器）。

    LangGraph 只允许异步节点配置 timeout（同步节点无法安全取消），故按节点实际
    形态决定是否挂载，替身节点（同步）也能装配同一拓扑。
    """
    act_timeout = config.act_timeout_seconds if inspect.iscoroutinefunction(nodes['act']) else None
    builder.add_node(
        'plan',
        nodes['plan'],
        retry_policy=RetryPolicy(max_attempts=2),
        cache_policy=CachePolicy(ttl=_PLAN_CACHE_TTL, key_func=_plan_cache_key),
    )
    builder.add_node('act', nodes['act'], timeout=act_timeout)
    builder.add_node('grade', nodes['grade'])
    builder.add_node('rewrite', nodes['rewrite'], retry_policy=RetryPolicy(max_attempts=2))
    builder.add_node('generate', nodes['generate'])


def _add_edges(builder: StateGraph, config: AgentGraphConfig) -> None:
    """装配拓扑：plan 分流、act→grade、grade 条件边决定是否改写。"""
    builder.add_edge(START, 'plan')
    builder.add_conditional_edges('plan', route_after_plan, {'act': 'act', 'generate': 'generate'})
    builder.add_edge('act', 'grade')
    builder.add_conditional_edges(
        'grade',
        make_grade_router(
            min_score=config.min_score,
            max_rewrites=config.max_rewrites,
            allow_rewrite=config.allow_rewrite,
        ),
        {'generate': 'generate', 'rewrite': 'rewrite'},
    )
    builder.add_edge('rewrite', 'act')
    builder.add_edge('generate', END)


def build_agent_graph(
    *,
    tool_ctx: ToolContext,
    config: AgentGraphConfig,
    model: Any = None,
    nodes: dict[str, Any] | None = None,
) -> Any:
    """装配并编译外层图；``nodes`` 可整体覆盖节点（单测注入替身，不依赖真实模型）。"""
    resolved = _resolve_nodes(model=model, tool_ctx=tool_ctx, config=config, provided=nodes)
    builder: StateGraph = StateGraph(AgentState)
    _add_nodes(builder, resolved, config)
    _add_edges(builder, config)
    return builder.compile()
