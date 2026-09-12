"""查询改写节点（T3：一次改写 → 回 act 重检索）。

改写是低温结构化调用；失败或产出空串时回退为原问句（保证 act 永远有输入）。
改写次数由 ``rewrite_count`` 累计，配合 grade 的条件边构成硬预算。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

from backend.src.app.agent.graph.prompts import REWRITE_SYSTEM
from backend.src.app.agent.graph.state import (
    AgentState,  # ruff: ignore[typing-only-first-party-import]  # LangGraph 经 pydantic 解析节点签名注解
)
from backend.src.app.agent.graph.stream_bridge import emit_step
from backend.src.common.log import log

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

__all__ = ['Rewrite', 'make_rewrite_node']


class Rewrite(BaseModel):
    """改写产物（结构化输出 schema）。"""

    query: str = Field(description='改写后的检索式（自包含、含关键术语）')
    reason: str = Field('', description='一句话说明改写意图')


def make_rewrite_node(
    model: Any = None,
    *,
    rewriter: Callable[[list[dict[str, str]]], Awaitable[Rewrite]] | None = None,
) -> Any:
    """构造改写节点；``rewriter`` 可注入替身（单测不依赖真实模型）。"""
    invoke = rewriter if rewriter is not None else model.with_structured_output(Rewrite)

    async def rewrite_node(state: AgentState) -> dict[str, Any]:
        query = str(state.get('query') or '')
        attempted = '、'.join(str(item) for item in (state.get('sub_queries') or []))
        try:
            result = await invoke([
                {'role': 'system', 'content': REWRITE_SYSTEM},
                {'role': 'user', 'content': f'原问题：{query}\n已尝试的检索式：{attempted or "（无）"}'},
            ])
            rewritten = str(result.query or '').strip()
        except Exception as exc:
            log.warning('agent 查询改写失败，回退原问句 err={}', exc)
            rewritten = ''
        if not rewritten:
            rewritten = query

        count = int(state.get('rewrite_count') or 0) + 1
        detail = f'第 {count} 次改写：{rewritten[:60]}'
        return {'sub_queries': [rewritten], 'rewrite_count': count, 'steps': [emit_step('rewrite', detail)]}

    return rewrite_node
