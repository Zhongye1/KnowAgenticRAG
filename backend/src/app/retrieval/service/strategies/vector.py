"""vector 检索策略（ragf-design §5.7/D17）：dense COSINE 召回 + 余弦阈值过滤。"""

from __future__ import annotations

import asyncio

from typing import Any

from backend.src.app.retrieval.service.params import apply_similarity_threshold
from backend.src.core.config import settings
from backend.src.database.milvus_kb_ops import search_ragf_kb

__all__ = ['retrieve_vector']


async def retrieve_vector(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    """dense-only：Milvus 按 COSINE 取 top-recall_top_k，再做余弦阈值过滤。"""
    hits = await asyncio.to_thread(
        search_ragf_kb,
        kb_name=ctx['kb_name'],
        dim=int(ctx['dim']),
        query_text=ctx['query_text'],
        query_embedding=ctx['query_embedding'],
        search_mode='vector',
        recall_top_k=int(ctx['recall_top_k']),
        nprobe=int(settings.RAGF_DENSE_NPROBE),
        expr=ctx.get('expr'),
        plugin_namespace=ctx.get('plugin_namespace'),
    )
    return apply_similarity_threshold(hits, ctx.get('similarity_threshold', 0.0))
