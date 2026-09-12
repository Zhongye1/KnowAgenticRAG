"""自省判据（T3 的触发条件，D36：判据是数值，不靠模型自觉）。

判据用**精排分数**这一既有信号，不引入 CRAG 式逐文档 LLM 打分（后者成本为
文档数 × 调用数）。三种情况触发改写：无命中、最高分低于阈值、或调用方关闭改写。

预算耗尽时不再改写，直接进入 generate——无命中时 generate 会走
``EMPTY_RESULT_MESSAGE`` 短路，避免空转。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.src.app.agent.graph.state import (
    AgentState,  # ruff: ignore[typing-only-first-party-import]  # LangGraph 经 pydantic 解析节点签名注解
)
from backend.src.app.agent.graph.stream_bridge import emit_step

if TYPE_CHECKING:
    from collections.abc import Callable


__all__ = ['make_grade_node', 'make_grade_router', 'max_hit_score']


def max_hit_score(hits: list[dict[str, Any]]) -> float:
    """命中集合的最高分（优先 rerank_score，回退 score）。"""
    best = 0.0
    for hit in hits or []:
        metadata = hit.get('metadata') or {}
        score = metadata.get('rerank_score')
        if score is None:
            score = metadata.get('score', hit.get('score'))
        try:
            best = max(best, float(score or 0.0))
        except (TypeError, ValueError):
            continue
    return best


def make_grade_node() -> Any:
    """构造评估节点：把判据数值写入状态并发 step 事件（纯计算，无 IO）。"""

    def grade_node(state: AgentState) -> dict[str, Any]:
        hits = list(state.get('hits') or [])
        score = max_hit_score(hits)
        detail = f'{len(hits)} 条命中，最高分 {score:.3f}'
        return {'grade_score': score, 'steps': [emit_step('grade', detail)]}

    return grade_node


def make_grade_router(
    *,
    min_score: float,
    max_rewrites: int,
    allow_rewrite: bool = True,
) -> Callable[[AgentState], str]:
    """条件边：``generate`` 收尾或 ``rewrite`` 再检索一次（硬预算封顶）。"""

    def route(state: AgentState) -> str:
        if not allow_rewrite or int(state.get('rewrite_count') or 0) >= max(0, int(max_rewrites)):
            return 'generate'
        hits = list(state.get('hits') or [])
        if not hits or max_hit_score(hits) < float(min_score):
            return 'rewrite'
        return 'generate'

    return route
