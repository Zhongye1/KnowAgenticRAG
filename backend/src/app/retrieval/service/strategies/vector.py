"""vector 检索策略（ragf-design §5.7/D17）：dense COSINE 召回 + 余弦阈值过滤。

D41：``ctx`` 带多子查询（``query_texts``）时逐路并行召回 → RRF 融合 → 统一阈值
过滤；单查询走原路径，行为与既有实现逐字节一致。
"""

from __future__ import annotations

import asyncio

from typing import Any

from backend.src.app.retrieval.service.params import apply_similarity_threshold
from backend.src.app.retrieval.service.strategies.fusion import fuse_rrf, query_pairs
from backend.src.core.config import settings
from backend.src.database.milvus_kb_ops import search_ragf_kb

__all__ = ['retrieve_vector']


async def retrieve_vector(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    """dense-only：逐查询取 top-recall_top_k，融合后做余弦阈值过滤。"""
    pairs = query_pairs(ctx)
    threshold = ctx.get('similarity_threshold', 0.0)
    if len(pairs) == 1:
        hits = await _recall(ctx, text=pairs[0][0], embedding=pairs[0][1])
        return apply_similarity_threshold(hits, threshold)
    hit_lists = await asyncio.gather(*(_recall(ctx, text=text, embedding=vec) for text, vec in pairs))
    fused = fuse_rrf(list(hit_lists), k=int(settings.RAGF_RETRIEVAL_RRF_K))
    return apply_similarity_threshold(fused, threshold)


async def _recall(ctx: dict[str, Any], *, text: str, embedding: list[float]) -> list[dict[str, Any]]:
    """单查询 dense 召回。"""
    hits = await asyncio.to_thread(
        search_ragf_kb,
        kb_name=ctx['kb_name'],
        dim=int(ctx['dim']),
        query_text=text,
        query_embedding=embedding,
        search_mode='vector',
        recall_top_k=int(ctx['recall_top_k']),
        nprobe=int(settings.RAGF_DENSE_NPROBE),
        expr=ctx.get('expr'),
        plugin_namespace=ctx.get('plugin_namespace'),
    )
    return hits
