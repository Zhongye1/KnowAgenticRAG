"""规划节点（T2：把用户问题翻译成服务端可执行的检索子查询）。

产出 ``need_retrieval`` / ``sub_queries`` / ``plan_rationale``，并由条件边决定
走 ``act``（检索）还是直接 ``generate``（不检索即回答，T1 的落点）。

失败降级：结构化输出不可用或调用失败 → 视为需要检索且子查询为原问句，
绝不因规划失败而中断请求。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

from backend.src.app.agent.graph.prompts import PLANNER_SYSTEM
from backend.src.app.agent.graph.state import (
    AgentState,  # ruff: ignore[typing-only-first-party-import]  # LangGraph 经 pydantic 解析节点签名注解
)
from backend.src.app.agent.graph.stream_bridge import emit_step
from backend.src.common.log import log

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

__all__ = ['Plan', 'make_plan_node', 'normalize_sub_queries']


class Plan(BaseModel):
    """规划产物（结构化输出 schema）。"""

    need_retrieval: bool = Field(description='是否需要检索知识库才能回答；纯闲聊/通用常识为 false')
    sub_queries: list[str] = Field(default_factory=list, description='互补的检索子查询（1-3 条），覆盖问题的不同侧面')
    rationale: str = Field('', description='一句话说明规划理由')


def normalize_sub_queries(raw: list[str] | None, query: str, *, max_sub_queries: int) -> list[str]:
    """去空白、去重、截断；需要检索却无有效子查询时回退为原问句。"""
    seen: set[str] = set()
    cleaned: list[str] = []
    for item in raw or []:
        text = str(item or '').strip()
        if not text or text in seen:
            continue
        seen.add(text)
        cleaned.append(text)
    if not cleaned:
        return [query] if query else []
    return cleaned[: max(1, int(max_sub_queries))]


def make_plan_node(
    model: Any = None,
    *,
    max_sub_queries: int = 3,
    planner: Callable[[list[dict[str, str]]], Awaitable[Plan]] | None = None,
) -> Any:
    """构造规划节点；``planner`` 可注入替身（单测不依赖真实模型）。"""
    invoke = planner if planner is not None else model.with_structured_output(Plan)

    async def plan_node(state: AgentState) -> dict[str, Any]:
        query = str(state.get('query') or '')
        try:
            plan = await invoke([
                {'role': 'system', 'content': PLANNER_SYSTEM},
                {'role': 'user', 'content': query},
            ])
        except Exception as exc:
            log.warning('agent 规划失败，降级为直接检索原问句 err={}', exc)
            plan = Plan(need_retrieval=True, sub_queries=[query], rationale=f'规划失败降级: {exc}')

        sub_queries = normalize_sub_queries(plan.sub_queries, query, max_sub_queries=max_sub_queries)
        need_retrieval = bool(plan.need_retrieval) or not query
        detail = f'need_retrieval={need_retrieval}, {len(sub_queries) if need_retrieval else 0} 路子查询'
        step = emit_step('plan', detail)
        return {
            'need_retrieval': need_retrieval,
            'sub_queries': sub_queries if need_retrieval else [],
            'plan_rationale': str(plan.rationale or ''),
            'steps': [step],
        }

    return plan_node


def route_after_plan(state: AgentState) -> str:
    """条件边：需要检索则进 act，否则直接生成（T1 自主决策）。"""
    return 'act' if state.get('need_retrieval', True) else 'generate'
