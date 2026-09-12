"""hybrid 检索策略（ragf-design §5.7/§A.3）：dense + BM25 双路服务端 RRF 融合。

RRF 分数为秩分（Σ 1/(k+rank)），非余弦相似度，因此 ``similarity_threshold``
不适用于本模式 —— 候选纯度交给精排段（§A.5）。

D41：``ctx`` 带多子查询（``query_texts``）时逐路并行召回 → 跨查询 RRF 融合；
单查询走原路径，行为与既有实现逐字节一致。
"""

from __future__ import annotations

import asyncio

from typing import Any

from backend.src.app.retrieval.service.strategies.fusion import fuse_rrf, query_pairs
from backend.src.core.config import settings
from backend.src.database.milvus_kb_ops import search_ragf_kb

__all__ = ['retrieve_hybrid']


async def retrieve_hybrid(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    """双路召回（dense COSINE + sparse BM25）→ 服务端 RRF(k) 融合。"""
    pairs = query_pairs(ctx)
    if len(pairs) == 1:
        return await _recall(ctx, text=pairs[0][0], embedding=pairs[0][1])
    hit_lists = await asyncio.gather(*(_recall(ctx, text=text, embedding=vec) for text, vec in pairs))
    return fuse_rrf(list(hit_lists), k=int(settings.RAGF_RETRIEVAL_RRF_K))


async def _recall(ctx: dict[str, Any], *, text: str, embedding: list[float]) -> list[dict[str, Any]]:
    """单查询 hybrid 召回（Milvus 内 fused dense+BM25）。"""
    return await asyncio.to_thread(
        search_ragf_kb,
        kb_name=ctx['kb_name'],
        dim=int(ctx['dim']),
        query_text=text,
        query_embedding=embedding,
        search_mode='hybrid',
        recall_top_k=int(ctx['recall_top_k']),
        rrf_k=int(settings.RAGF_RETRIEVAL_RRF_K),
        nprobe=int(settings.RAGF_DENSE_NPROBE),
        expr=ctx.get('expr'),
        plugin_namespace=ctx.get('plugin_namespace'),
    )
