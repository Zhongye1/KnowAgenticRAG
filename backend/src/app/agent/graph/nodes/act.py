"""检索节点（内层 ReAct：模型自主调用只读工具收集证据）。

D34 两层图的「内层」：``create_agent`` 提供工具循环（T1 自主决策），外层图负责
编排与预算。节点不从消息历史里抠结果——工具把命中写入 ``ToolContext.collected``，
节点读收集器，因此证据是结构化且跨多次工具调用去重的。

rewrite → act 会二次进入本节点；收集器保留累计结果，故二次检索是「合并」语义
（与 D41 的检索层融合配套：合并发生在同一证据池，不产生两份精排列表）。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langchain.agents import create_agent

from backend.src.app.agent.graph.prompts import ACT_SYSTEM
from backend.src.app.agent.graph.state import (
    AgentState,  # ruff: ignore[typing-only-first-party-import]  # LangGraph 经 pydantic 解析节点签名注解
)
from backend.src.app.agent.graph.stream_bridge import emit_step
from backend.src.app.retrieval.service.rag_adapter import build_rag_payload
from backend.src.common.log import log

if TYPE_CHECKING:
    from backend.src.app.agent.graph.tools import ToolContext

__all__ = ['make_act_node']


def build_task_prompt(sub_queries: list[str]) -> str:
    """把检索计划交给内层 ReAct 的任务说明。"""
    lines = '\n'.join(f'- {item}' for item in sub_queries if str(item).strip())
    return f'请收集下列检索任务所需的证据：\n{lines}'


def make_act_node(
    *,
    model: Any,
    tools: list[Any],
    tool_ctx: ToolContext,
    recursion_limit: int = 12,
) -> Any:
    """构造检索节点（内层 agent 编译一次，跨 rewrite 复用）。"""
    agent = create_agent(model=model, tools=tools, system_prompt=ACT_SYSTEM)

    async def act_node(state: AgentState) -> dict[str, Any]:
        sub_queries = [str(item) for item in (state.get('sub_queries') or []) if str(item).strip()]
        if not sub_queries:
            sub_queries = [str(state.get('query') or '')]
        hits_before = len(tool_ctx.collected)
        calls_before = tool_ctx.tool_calls
        try:
            await agent.ainvoke(
                {'messages': [{'role': 'user', 'content': build_task_prompt(sub_queries)}]},
                config={'recursion_limit': max(2, int(recursion_limit))},
            )
        except Exception as exc:
            log.warning('agent 内层工具循环失败，沿用已收集证据 err={}', exc)

        hits = list(tool_ctx.collected)
        # 与 chat 同源适配：raw 检索 dict → 显式 route（selector=explicit）+ 二元来源
        data = dict(tool_ctx.last_retrieval)
        rag = build_rag_payload(data) if data else {}
        detail = (
            f'工具调用 {tool_ctx.tool_calls - calls_before} 次，'
            f'新增命中 {len(hits) - hits_before} 条，累计 {len(hits)} 条'
        )
        return {
            'hits': hits,
            'retrieval': {
                'mode': str(rag.get('mode') or 'hybrid'),
                'route': dict(rag.get('route') or {}),
                'kb_names': list(rag.get('kb_names') or []),
            },
            'visual_items': list((rag.get('sources') or {}).get('image') or []),
            'steps': [emit_step('act', detail)],
        }

    return act_node
