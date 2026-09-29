"""知识库统计服务（EagleRAG kb/stats.py 迁移）。"""

from __future__ import annotations

import asyncio

from typing import TYPE_CHECKING, Any

from opentelemetry import metrics as otel_metrics

from backend.src.app.kb.crud import chunk_dao, document_dao, knowledge_base_dao
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.common.log import log
from backend.src.database.milvus_kb_ops import (
    base_collection_names,
    count_all_entities,
    count_entities_by_kb,
    count_ragf_vectors_by_document,
    list_present_collections,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

_METER = otel_metrics.get_meter('backend.ragf')
_STATS_REPAIR = _METER.create_counter(
    'ragf.kb.stats_repair.documents',
    unit='1',
    description='KB 统计对账结果计数（result=chunk_count_fixed/vector_drift/consistent）',
)


class KnowledgeBaseStatsService:
    """知识库统计业务逻辑。"""

    @staticmethod
    async def get_kb_stats(
        *,
        db: AsyncSession,
        kb_name: str,
        plugin_namespace: str | None = None,
    ) -> dict[str, int]:
        """单个知识库统计：文档数 + 文本/视觉向量数。"""
        ns = instance_namespace(plugin_namespace)
        documents = await document_dao.count_by_kb(db, kb_name, plugin_namespace=ns)
        text_coll, visual_coll = base_collection_names()
        return {
            'documents': documents,
            'text_vectors': count_entities_by_kb(text_coll, kb_name, plugin_namespace=ns),
            'visual_vectors': count_entities_by_kb(visual_coll, kb_name, plugin_namespace=ns),
        }

    @staticmethod
    async def get_overview(*, db: AsyncSession, kb_names: list[str] | None = None) -> dict[str, int]:
        """跨知识库聚合（kb_names 传 None = 全域；传可见集合 = 仅聚合可见库，防汇总图泄露）。"""
        ns = instance_namespace()
        text_coll, visual_coll = base_collection_names()
        if kb_names is None:
            total_kbs = await knowledge_base_dao.count(db, plugin_namespace=ns)
            total_documents = await document_dao.count(db, plugin_namespace=ns)
            return {
                'total_kbs': total_kbs,
                'total_documents': total_documents,
                'total_text_vectors': count_all_entities(text_coll, plugin_namespace=ns),
                'total_visual_vectors': count_all_entities(visual_coll, plugin_namespace=ns),
            }
        return {
            'total_kbs': len(kb_names),
            'total_documents': await document_dao.count_by_kbs(db, kb_names=kb_names, plugin_namespace=ns),
            'total_text_vectors': sum(count_entities_by_kb(text_coll, kb, plugin_namespace=ns) for kb in kb_names),
            'total_visual_vectors': sum(count_entities_by_kb(visual_coll, kb, plugin_namespace=ns) for kb in kb_names),
        }

    @staticmethod
    async def get_collections(
        *,
        db: AsyncSession,
        kb_name: str,
        plugin_namespace: str | None = None,
    ) -> list[dict[str, int | str]]:
        """KB 内各集合实体数（含已存在但为空的集合）。"""
        ns = instance_namespace(plugin_namespace)
        kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=ns)
        if kb is None:
            return []
        collections = list(dict.fromkeys([*base_collection_names(), *kb.collections_used]))
        return [
            {'collection': coll, 'count': count_entities_by_kb(coll, kb_name, plugin_namespace=ns)}
            for coll in collections
        ]

    @staticmethod
    async def get_format_distribution(
        *,
        db: AsyncSession,
        kb_name: str,
        plugin_namespace: str | None = None,
    ) -> list[dict[str, int | str]]:
        """文件类型分布。"""
        rows = await document_dao.format_distribution(db, kb_name, plugin_namespace=plugin_namespace)
        return [{'source_type': row[0], 'count': row[1]} for row in rows]

    @staticmethod
    async def get_ingestion_volume(
        *,
        db: AsyncSession,
        kb_name: str,
        plugin_namespace: str | None = None,
        days: int = 30,
    ) -> list[dict[str, int | str]]:
        """摄入时间序列。"""
        rows = await document_dao.ingestion_volume(db, kb_name, plugin_namespace=plugin_namespace, days=days)
        return [{'date': row[0], 'count': row[1]} for row in rows]

    @staticmethod
    async def get_facets(
        *,
        db: AsyncSession,
        kb_name: str,
        plugin_namespace: str | None = None,
    ) -> list[dict[str, int | str]]:
        """source_type / pipeline / status 分面。"""
        return await document_dao.facets(db, kb_name, plugin_namespace=plugin_namespace)

    @staticmethod
    async def get_all_collections(*, plugin_namespace: str | None = None) -> list[str]:
        """实例域内全部集合（供前端展示）。"""
        return list_present_collections(plugin_namespace=plugin_namespace)


kb_stats_service = KnowledgeBaseStatsService()


def _stats_repair_report(
    *,
    kb_name: str,
    checked: int,
    chunk_fixed: int,
    drift: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        'kb_name': kb_name,
        'documents_checked': checked,
        'chunk_count_fixed': chunk_fixed,
        'vector_drift_count': len(drift),
        'vector_drift': drift[:50],
    }


async def repair_kb_stats(
    *,
    db: AsyncSession,
    kb_name: str,
    plugin_namespace: str | None = None,
) -> dict[str, Any]:
    """KB 级统计对账（Phase 4 / 4.3）：修正 `documents.chunk_count`，**只报告**向量偏差。

    逻辑放在 service 而非任务体：HTTP 端点（同步执行）与 `kb.stats_repair`
    Celery 任务（批量/定时执行）共用同一实现，避免从路由层直接调用任务体。

    向量侧不自动重建——向量与分块不等可能来自摄取中断或换维残留，修复必须走重新
    摄取，静默重建是危险动作。
    """
    ns = instance_namespace(plugin_namespace)
    checked = 0
    chunk_fixed = 0
    drift: list[dict[str, Any]] = []

    docs = await document_dao.select_models_scoped(db, kb_name=kb_name, plugin_namespace=ns)
    for doc in docs:
        if doc.status != 'ready':
            continue  # 未就绪文档的统计本就无意义，不参与对账
        checked += 1
        actual_chunks = await chunk_dao.count_by_document(db, doc.document_id, kb_name=kb_name, plugin_namespace=ns)
        if int(doc.chunk_count or 0) != actual_chunks:
            log.warning(
                'chunk_count 漂移已修复 kb={} doc={} {} -> {}',
                kb_name,
                doc.document_id,
                doc.chunk_count,
                actual_chunks,
            )
            doc.chunk_count = actual_chunks
            await db.flush()
            chunk_fixed += 1
            _STATS_REPAIR.add(1, {'result': 'chunk_count_fixed'})
        else:
            _STATS_REPAIR.add(1, {'result': 'consistent'})

        actual_vectors = await asyncio.to_thread(
            count_ragf_vectors_by_document, kb_name, doc.document_id, plugin_namespace=ns
        )
        if actual_vectors != actual_chunks:
            drift.append({'document_id': doc.document_id, 'chunks': actual_chunks, 'vectors': actual_vectors})
            _STATS_REPAIR.add(1, {'result': 'vector_drift'})

    report = _stats_repair_report(kb_name=kb_name, checked=checked, chunk_fixed=chunk_fixed, drift=drift)
    if chunk_fixed or drift:
        log.info('KB 统计对账完成: {}', {k: v for k, v in report.items() if k != 'vector_drift'})
    return report
