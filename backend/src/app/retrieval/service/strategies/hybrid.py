"""hybrid 检索策略（ragf-design §5.7/§A.3）：dense + BM25 双路服务端 RRF 融合。

RRF 分数为秩分（Σ 1/(k+rank)），非余弦相似度，因此 ``similarity_threshold``
不适用于本模式 —— 候选纯度交给精排段（§A.5）。
"""

from __future__ import annotations

import asyncio

from typing import Any

from backend.src.core.config import settings
from backend.src.database.milvus_kb_ops import search_ragf_kb

__all__ = ['retrieve_hybrid']


async def retrieve_hybrid(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    """双路召回（dense COSINE + sparse BM25，limit=recall_top_k）→ 服务端 RRF(k) 融合。"""
    return await asyncio.to_thread(
        search_ragf_kb,
        kb_name=ctx['kb_name'],
        dim=int(ctx['dim']),
        query_text=ctx['query_text'],
        query_embedding=ctx['query_embedding'],
        search_mode='hybrid',
        recall_top_k=int(ctx['recall_top_k']),
        rrf_k=int(settings.RAGF_RETRIEVAL_RRF_K),
        nprobe=int(settings.RAGF_DENSE_NPROBE),
        expr=ctx.get('expr'),
        plugin_namespace=ctx.get('plugin_namespace'),
    )
