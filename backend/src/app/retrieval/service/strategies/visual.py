"""visual 视觉召回策略（双管线摄取 spec D7 查询侧，EagleRAG pixelrag_visual_retriever 语义）。

查询文本经视觉编码器（qwen3-vl-embedding，与摄取侧同一向量空间，指纹守卫）编码，
直查 ``ragf_visual`` 集合（dense COSINE + 标量过滤）。命中为独立结果类别（tile 无
PG chunks、不进 CrossEncoder 精排、不进 D24 chunk 引用），调用方以
``visual_results`` 单独返回。过滤表达式与文本集合同构：document_id 过滤 + scope
ACL（集合含同名标量字段）；视觉行无 version 标量，不做版本过滤。
"""

from __future__ import annotations

import asyncio

from typing import Any

from backend.src.database.milvus_visual_ops import search_visual

__all__ = ['retrieve_visual']


async def retrieve_visual(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    """视觉召回：limit=visual_top_k，表达式下推（kb_name 由 milvus 层注入）。"""
    return await asyncio.to_thread(
        search_visual,
        kb_name=ctx['kb_name'],
        query_vector=ctx['query_visual_embedding'],
        recall_top_k=int(ctx['visual_top_k']),
        expr=ctx.get('expr'),
        plugin_namespace=ctx.get('plugin_namespace'),
    )
