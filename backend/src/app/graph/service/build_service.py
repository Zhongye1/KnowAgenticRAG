"""建图编排（RAG 清单 Phase 5 / D62）。

**逐块隔离**：一块抽取失败（模型超时、回复不可解析）只记该块失败，不中断整篇——一篇
长文档几十块，因一块失败而全篇白跑是不可接受的。这与摄取链路"文档级失败"的口径不同，
因为块之间没有依赖。

**台账在成功与失败时都写**：自愈比对靠的是"台账 vs 文档当前分块数"。失败文档若不留
台账，下次扫描会认为"从没建过图"而重跑——那是对的；但留了失败台账能让人看见"这篇一直
在建图失败"，而不是永远显示"未建图"。
"""

from __future__ import annotations

import asyncio

from typing import TYPE_CHECKING, Any

from backend.src.app.graph.service.extractors.base import normalize_extraction_result
from backend.src.app.graph.service.graph_service import write_chunk_graph
from backend.src.common.log import log

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['DEFAULT_CHUNK_CONCURRENCY', 'build_document_graph']

# 抽取是 LLM 调用，并发过高会撞模型侧限流；与评估域的取法一致
DEFAULT_CHUNK_CONCURRENCY = 4


async def build_document_graph(
    db: AsyncSession,
    *,
    document_id: str,
    kb_name: str,
    extractor: Any,
    plugin_namespace: str | None = None,
    concurrency: int = DEFAULT_CHUNK_CONCURRENCY,
    chunk_loader: Any | None = None,
    version_id: int | None = None,
) -> dict[str, Any]:
    """为一篇文档建图，返回 ``{'chunks', 'succeeded', 'failed', 'entities', 'triples'}``。

    ``chunk_loader`` 可注入（默认取 kb 的分块只读契约），测试据此免依赖数据库。
    """
    loader = chunk_loader or _default_chunk_loader
    chunks = await loader(
        db, document_id=document_id, kb_name=kb_name, plugin_namespace=plugin_namespace, version_id=version_id
    )
    if not chunks:
        return {'chunks': 0, 'succeeded': 0, 'failed': 0, 'entities': 0, 'triples': 0}

    semaphore = asyncio.Semaphore(max(int(concurrency), 1))
    results = await asyncio.gather(
        *(_extract_one(extractor, chunk_id, content, semaphore) for chunk_id, content in chunks)
    )

    succeeded = 0
    failed = 0
    entities = 0
    triples = 0
    for (chunk_id, _content), raw in zip(chunks, results, strict=True):
        if raw is None:
            failed += 1
            continue
        try:
            normalized = normalize_extraction_result(raw, getattr(extractor, 'extractor_type', ''))
            counts = await write_chunk_graph(
                db,
                kb_name=kb_name,
                document_id=document_id,
                chunk_id=chunk_id,
                normalized_result=normalized,
                extractor_type=getattr(extractor, 'extractor_type', ''),
                plugin_namespace=plugin_namespace,
            )
        except Exception as exc:
            failed += 1
            log.warning('图谱写入失败（跳过该块）document={} chunk={}: {}', document_id, chunk_id, exc)
            continue
        succeeded += 1
        entities += counts['entities']
        triples += counts['triples']
        # 逐块提交：长文档建图耗时数分钟，中途失败也应保留已完成的部分
        await db.commit()

    return {
        'chunks': len(chunks),
        'succeeded': succeeded,
        'failed': failed,
        'entities': entities,
        'triples': triples,
    }


async def _extract_one(
    extractor: Any, chunk_id: str, content: str, semaphore: asyncio.Semaphore
) -> dict[str, Any] | None:
    """单块抽取；失败返回 None（由调用方计失败数并继续）。"""
    async with semaphore:
        try:
            return await extractor.extract(content, chunk_metadata={'chunk_id': chunk_id})
        except Exception as exc:
            log.warning('图谱抽取失败（跳过该块）chunk={}: {}', chunk_id, exc)
            return None


async def _default_chunk_loader(
    db: AsyncSession,
    *,
    document_id: str,
    kb_name: str,
    plugin_namespace: str | None,
    version_id: int | None,
) -> list[tuple[str, str]]:
    """默认加载：文档当前版本的内容分块。

    刻意**排除章节摘要行**：摘要是"文档自己的概括"，抽出来的实体是文档级泛化概念，
    对"这段原文提到了什么实体"没有增量，反而会稀释提及的精度。
    """
    from backend.src.app.kb.model.chunk import CHUNK_META_TYPE_KEY, CHUNK_TYPE_SECTION_SUMMARY
    from backend.src.app.kb.service.chunk_service import ChunkService

    rows = await ChunkService.list_by_document(
        db, document_id, kb_name=kb_name, version_id=version_id, plugin_namespace=plugin_namespace
    )
    return [
        (str(row.chunk_id), str(row.content or ''))
        for row in rows
        if (row.meta or {}).get(CHUNK_META_TYPE_KEY) != CHUNK_TYPE_SECTION_SUMMARY and str(row.content or '').strip()
    ]
