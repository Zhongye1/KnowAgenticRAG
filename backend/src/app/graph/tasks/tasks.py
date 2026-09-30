"""``graph.*`` Celery 任务（RAG 清单 Phase 5 / D62）。

任务层是 ``build_service.build_document_graph`` 的薄包装：解析抽取器、开会话、兜异常。
独立队列（``RAGF_CELERY_GRAPH_QUEUE``）的理由：逐块 LLM 抽取是重任务，与摄取、评估
争同一份模型配额会互相拖慢。
"""

from __future__ import annotations

from typing import Any

from backend.src.app.graph.crud import graph_dao
from backend.src.app.graph.service.build_service import build_document_graph
from backend.src.app.graph.service.extractors.llm import LLMGraphExtractor
from backend.src.app.task.celery import celery_app
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.db import async_db_session

__all__ = ['build_document_graph_task']


async def _resolve_extractor(db: Any, spec: str, plugin_namespace: str | None) -> LLMGraphExtractor:
    """按 spec 解析抽取器（模型经 provider 工厂取，与检索/评估同一入口）。"""
    resolved = str(spec or settings.RAGF_GRAPH_EXTRACTOR_SPEC or '').strip()
    if not resolved:
        raise errors.RequestError(msg='未配置图谱抽取模型：请设置 RAGF_GRAPH_EXTRACTOR_SPEC 或显式传入')
    from backend.src.app.model_provider.service.provider_service import provider_service

    chat_model = await provider_service.get_chat_model(db, resolved)
    return LLMGraphExtractor(chat_model)


@celery_app.task(name='graph.build_document')
async def build_document_graph_task(
    document_id: str,
    kb_name: str,
    plugin_namespace: str | None = None,
    extractor_spec: str = '',
    version_id: int | None = None,
) -> dict[str, Any]:
    """为一篇文档建图并回填台账。"""
    async with async_db_session() as db:
        try:
            extractor = await _resolve_extractor(db, extractor_spec, plugin_namespace)
            summary = await build_document_graph(
                db,
                document_id=document_id,
                kb_name=kb_name,
                extractor=extractor,
                plugin_namespace=plugin_namespace,
                concurrency=int(settings.RAGF_GRAPH_CONCURRENCY),
                version_id=version_id,
            )
            await graph_dao.upsert_document_index(
                db,
                document_id=document_id,
                kb_name=kb_name,
                version_id=int(version_id or 1),
                chunk_count=int(summary['chunks']),
                entity_count=int(summary['entities']),
                triple_count=int(summary['triples']),
                status='indexed' if summary['failed'] == 0 else 'failed',
                error_message=None if summary['failed'] == 0 else f'{summary["failed"]} 块抽取失败',
                plugin_namespace=plugin_namespace,
            )
            await db.commit()
        except Exception as exc:
            log.error('建图任务失败 document={} err={}', document_id, exc)
            return {'status': 'failed', 'error': f'{type(exc).__name__}: {exc}'}
        return summary
