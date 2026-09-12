"""Agent 图状态（agentic-rag spec D34/§3.3）。

外层 StateGraph 的共享状态：``plan`` 写入检索计划，``act`` 写入命中，
``grade`` 写入判据分数，``generate`` 写入回答；``steps`` 用 ``operator.add``
归并，使各节点只追加自己的轨迹而不互相覆盖。
"""

from __future__ import annotations

import operator

from typing import Annotated, Any, TypedDict

__all__ = ['AgentState']


class AgentState(TypedDict, total=False):
    """单一 Agent 运行内的共享状态（stateless，不落 checkpointer，见 D40）。"""

    # 输入
    query: str
    kb_name: str
    kb_names: list[str]

    # plan 节点产物
    need_retrieval: bool
    sub_queries: list[str]
    plan_rationale: str

    # act 节点产物（检索层原始输出 + 扁平化命中）
    retrieval: dict[str, Any]
    hits: list[dict[str, Any]]
    citations: list[dict[str, Any]]
    visual_items: list[dict[str, Any]]

    # grade 节点产物
    # （citations 由 generate 依 hits 生成，供 done 自包含）
    grade_score: float
    grade_reason: str

    # rewrite 节点产物
    rewrite_count: int

    # act 节点产物：内层工具循环的累计调用次数（可观测 + done 元数据）
    tool_calls: int

    # generate 节点产物
    answer: str
    reason: str
    finish_reason: str | None
    model_spec: str
    usage: dict[str, int]

    # 轨迹（归并语义：各节点追加，不覆盖）
    steps: Annotated[list[dict[str, Any]], operator.add]
