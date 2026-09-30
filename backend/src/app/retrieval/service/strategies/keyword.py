"""keyword 检索策略（D58）：纯 BM25 词面召回，不依赖查询向量。

与 vector/hybrid 的差别是**召回依据**而非编排：只打 Milvus 稀疏字段
（``content_sparse``，写入期由 BM25 Function 从 ``content`` 生成），查询输入是
原始文本，因此本策略既不读 ``query_embeddings``、也不需要编排层做过 embedding
编码——embedding 编码故障时本模式仍可用。

BM25 分数是词面统计分而非余弦相似度，故 ``similarity_threshold`` 不适用（同
hybrid 的理由）；候选纯度交给精排段。

D41：``ctx`` 带多子查询（``query_texts``）时逐路并行召回 → 跨查询 RRF 融合，
单查询走原路径。
"""

from __future__ import annotations

import asyncio

from typing import Any

from backend.src.app.retrieval.service.strategies.fusion import fuse_rrf, query_pairs
from backend.src.core.config import settings
from backend.src.database.milvus_kb_ops import search_ragf_kb

__all__ = ['retrieve_keyword']


async def retrieve_keyword(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    """逐子查询 BM25 召回；多查询跨路 RRF 融合。

    复用 ``query_pairs`` 仅为对齐“空白查询按位跳过”的既有语义，向量分量在本模式
    下弃用。
    """
    pairs = query_pairs(ctx)
    if len(pairs) == 1:
        return await _recall(ctx, text=pairs[0][0])
    hit_lists = await asyncio.gather(*(_recall(ctx, text=text) for text, _ in pairs))
    return fuse_rrf(list(hit_lists), k=int(settings.RAGF_RETRIEVAL_RRF_K))


async def _recall(ctx: dict[str, Any], *, text: str) -> list[dict[str, Any]]:
    """单查询 BM25 召回（Milvus 服务端稀疏索引打分）。"""
    return await asyncio.to_thread(
        search_ragf_kb,
        kb_name=ctx['kb_name'],
        dim=int(ctx['dim']),
        query_text=text,
        search_mode='keyword',
        recall_top_k=int(ctx['recall_top_k']),
        expr=ctx.get('expr'),
        plugin_namespace=ctx.get('plugin_namespace'),
    )
