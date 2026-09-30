"""图检索（RAG 清单 Phase 5 / D62：Yuxi 图检索链路的 SQL 版）。

链路：**查询文本 → 种子实体 → 子图（BFS）→ PPR → chunk 排序**。

**种子定位用名称包含匹配而非向量召回**（与 Yuxi 的 `search_entities` 不同）。理由：
向量种子需要实体集合的向量索引，而名称匹配零新增基建就能把整条图检索链路打通、可端到端
验证；向量种子是**召回率优化**，接在同一个接缝上（``locate_seed_entities``）即可，不改变
下游任何一步。这条差异会在 spec 的落地记录里写明。

匹配方向是「实体名出现在查询里」（``strpos(query, name) > 0``）而非「查询出现在实体名里」：
后者会把 `apple` 匹配到 `pineapple`，而 PPR 对种子质量很敏感——噪声种子会把概率质量引到
无关子图上。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.src.app.graph.crud import graph_dao
from backend.src.app.graph.service.graph_service import MAX_HOPS, build_subgraph
from backend.src.app.graph.service.graph_utils import normalize_entity_name
from backend.src.app.graph.service.ppr import DEFAULT_DAMPING, rank_chunks_by_ppr

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['DEFAULT_GRAPH_TOP_K', 'MAX_SEED_ENTITIES', 'locate_seed_entities', 'retrieve_graph_chunks']

# 种子上限：种子越多，PPR 的个性化分布越平，图检索就退化成"全图均匀"而失去区分度
MAX_SEED_ENTITIES = 20
DEFAULT_GRAPH_TOP_K = 10


async def locate_seed_entities(
    db: AsyncSession,
    *,
    query_text: str,
    kb_name: str,
    plugin_namespace: str | None = None,
    limit: int = MAX_SEED_ENTITIES,
) -> list[Any]:
    """查询文本 → 种子实体（实体归一名称是查询的子串）。

    空查询直接返回空：``strpos(x, '')`` 恒为 1，会把**全部实体**当种子——那等于关掉
    个性化，是最坏的结果而不是"没有结果"。
    """
    normalized_query = normalize_entity_name(query_text)
    if not normalized_query:
        return []
    return await graph_dao.search_entities_in_text(
        db,
        kb_name=kb_name,
        normalized_text=normalized_query,
        plugin_namespace=plugin_namespace,
        limit=limit,
    )


async def retrieve_graph_chunks(
    db: AsyncSession,
    *,
    query_text: str,
    kb_name: str,
    top_k: int = DEFAULT_GRAPH_TOP_K,
    hops: int = MAX_HOPS,
    damping: float = DEFAULT_DAMPING,
    plugin_namespace: str | None = None,
    seed_limit: int = MAX_SEED_ENTITIES,
) -> list[dict[str, Any]]:
    """图检索 → ``[{'chunk_id', 'score'}]``（降序，截断 top_k）。

    无种子或无命中时返回**空列表**（不是异常）：图检索是可选的召回路，没有证据就是
    没有证据，交给上层的融合与降级处理。
    """
    seeds = await locate_seed_entities(
        db,
        query_text=query_text,
        kb_name=kb_name,
        plugin_namespace=plugin_namespace,
        limit=seed_limit,
    )
    if not seeds:
        return []

    seed_ids = [seed.entity_id for seed in seeds]
    subgraph = await build_subgraph(
        db,
        kb_name=kb_name,
        seed_entity_ids=seed_ids,
        hops=hops,
        plugin_namespace=plugin_namespace,
    )
    if not subgraph['nodes']:
        return []

    # 种子等权：名称匹配没有天然的权重信号，凭"谁更匹配"打分需要一个未经验证的启发式；
    # 等权是诚实的默认，权重留给将来的向量种子（那里的相似度是真实信号）
    seed_weights = dict.fromkeys(seed_ids, 1.0)
    ranked = rank_chunks_by_ppr(subgraph, seed_weights, top_k=top_k, damping=damping)
    return [{'chunk_id': chunk_id, 'score': score} for chunk_id, score in ranked]


async def graph_chunk_scores(
    db: AsyncSession,
    *,
    query_text: str,
    kb_name: str,
    top_k: int = DEFAULT_GRAPH_TOP_K,
    plugin_namespace: str | None = None,
) -> dict[str, float]:
    """``{chunk_id: score}`` 便捷视图（供融合侧按 chunk_id 取分）。"""
    ranked = await retrieve_graph_chunks(
        db, query_text=query_text, kb_name=kb_name, top_k=top_k, plugin_namespace=plugin_namespace
    )
    return {hit['chunk_id']: float(hit['score']) for hit in ranked}
