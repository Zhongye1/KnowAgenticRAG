"""kb.* Celery 任务。

- ``kb.acl_reconcile``：ACL 巡检入口——清理过期授权条目 + 比对修复文档级 ACL 的
  Milvus 镜像漂移（DB 始终是 source-of-truth，镜像最终一致，D48/D49）。
- ``kb.preview_convert``：Office 文档 → PDF 预览产物（D55 §3B）——惰性触发，
  转换失败落 ``failed`` 由预览接口走降级梯，不自动重试（重试入口 = 再次请求预览）。
- ``kb.stats_repair``：KB 级统计对账（Phase 4 / 4.3）——修正 ``documents.chunk_count``
  与 PG chunks 实际行数的漂移，并**只报告**向量行数与分块数的偏差（向量修复要走
  重新摄取，不在本任务职责内，避免「静默重建」这种危险动作）。
"""

from __future__ import annotations

import asyncio

from typing import Any

from backend.src.app.kb.crud.crud_acl import doc_acl_dao, kb_acl_dao
from backend.src.app.kb.crud.crud_document import document_dao
from backend.src.app.kb.crud.crud_document_preview import document_preview_dao
from backend.src.app.kb.crud.crud_knowledge_base import knowledge_base_dao
from backend.src.app.kb.service.document_storage import (
    download_document_bytes,
    kb_preview_object_key,
    upload_document_bytes,
)
from backend.src.app.kb.service.kb_stats_service import repair_kb_stats
from backend.src.app.kb.service.preview_converter import PreviewConversionError, convert_office_to_pdf
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.app.task.celery import celery_app
from backend.src.common.log import log
from backend.src.database.db import async_db_session
from backend.src.database.milvus_kb_ops import read_ragf_document_acl, update_ragf_document_acl
from backend.src.database.milvus_visual_ops import read_visual_document_acl, update_visual_document_acl
from backend.src.utils.timezone import timezone

__all__ = ['acl_reconcile_task', 'preview_convert_task', 'stats_repair_task']


def _mirror_mismatch(actual: dict[str, Any] | None, expected: dict[str, Any]) -> bool:
    """镜像标量与 DB 期望是否漂移（groups 按集合比较，顺序不敏感）。"""
    if actual is None:
        return False  # 镜像无行 = 未摄取/已清理，由摄取流程落镜像，不在修复范围
    return (
        actual['visibility'] != expected['visibility']
        or actual['owner_id'] != expected['owner_id']
        or set(actual['groups']) != set(expected['groups'])
    )


@celery_app.task(name='kb.acl_reconcile')
async def acl_reconcile_task() -> dict[str, Any]:
    """ACL 巡检（beat 周期触发）：过期清理 + Milvus 镜像对账修复。

    过期条目在求值期本就即时忽略（验收 6），清理只为控制表膨胀并留痕；
    对账比对 documents.visibility/owner_id + rag_doc_acl 与 Milvus 标量，
    漂移按 DB 期望 upsert 修复（文本模板集合 + 视觉集合）。
    """
    now = timezone.now()
    checked = 0
    repaired = 0
    expired = 0
    async with async_db_session.begin() as db:
        expired += await kb_acl_dao.delete_expired(db, now=now)
        expired += await doc_acl_dao.delete_expired(db, now=now)

        for kb in await knowledge_base_dao.list_all(db):
            ns = instance_namespace(kb.plugin_namespace)
            entries = await doc_acl_dao.list_entries_by_kb(db, kb_name=kb.kb_name, plugin_namespace=kb.plugin_namespace)
            principals = [entry.principal_id for entry in entries]
            docs = await document_dao.select_models_scoped(db, kb_name=kb.kb_name, plugin_namespace=kb.plugin_namespace)
            for doc in docs:
                if doc.status != 'ready':
                    continue  # 镜像行由摄取成功后落库，未就绪文档不比对
                checked += 1
                expected = {
                    'visibility': str(doc.visibility or 'restricted'),
                    'owner_id': doc.owner_id or '',
                    'groups': principals,
                }
                for read_op, update_op in (
                    (read_ragf_document_acl, update_ragf_document_acl),
                    (read_visual_document_acl, update_visual_document_acl),
                ):
                    actual = await asyncio.to_thread(read_op, doc.kb_name, doc.document_id, plugin_namespace=ns)
                    if _mirror_mismatch(actual, expected):
                        await asyncio.to_thread(
                            update_op,
                            doc.kb_name,
                            doc.document_id,
                            visibility=expected['visibility'],
                            owner_id=expected['owner_id'],
                            groups=expected['groups'],
                            plugin_namespace=ns,
                        )
                        repaired += 1
                        log.warning(
                            'ACL 镜像漂移已修复 kb={} doc={} visibility={}',
                            doc.kb_name,
                            doc.document_id,
                            expected['visibility'],
                        )

    report = {'expired_removed': expired, 'documents_checked': checked, 'mirrors_repaired': repaired}
    if expired or repaired:
        log.info('ACL 巡检完成: {}', report)
    return report


@celery_app.task(name='kb.preview_convert')
async def preview_convert_task(document_id: str, plugin_namespace: str | None = None) -> dict[str, Any]:
    """Office 文档 → PDF 预览产物（D55 §3B）。

    流程：读源字节（事务外，长耗时）→ 交给转换容器 → 产物落 MinIO →
    预览行置 ready + 页数。失败一律落 ``failed`` + 原因，**不抛出**（转换不可用
    只应让预览走降级梯，不该把任务标红刷屏）。
    """
    ns = instance_namespace(plugin_namespace)
    async with async_db_session() as db:
        doc = await document_dao.get(db, document_id, plugin_namespace=ns)
        if doc is None:
            log.warning('预览转换目标不存在 doc={}', document_id)
            return {'document_id': document_id, 'status': 'skipped'}
        filename = doc.name or 'file'
        source_uri = doc.source_uri
        kb_name = doc.kb_name

    if not source_uri:
        return await _preview_failed(ns, document_id, '文档没有可用的原始对象')

    try:
        raw = await download_document_bytes(source_uri)
    except Exception as exc:
        return await _preview_failed(ns, document_id, f'读取源对象失败: {exc}')

    try:
        pdf_bytes, page_count = await convert_office_to_pdf(filename=filename, data=raw)
    except PreviewConversionError as exc:
        return await _preview_failed(ns, document_id, str(exc))
    except Exception as exc:  # pragma: no cover - 兜底，不让任务抛
        return await _preview_failed(ns, document_id, f'转换异常: {exc}')

    object_key = kb_preview_object_key(ns, kb_name, document_id)
    try:
        await upload_document_bytes(object_key, pdf_bytes, content_type='application/pdf')
    except Exception as exc:
        return await _preview_failed(ns, document_id, f'预览产物落对象存储失败: {exc}')

    async with async_db_session.begin() as db:
        await document_preview_dao.mark_status(
            db,
            document_id,
            'ready',
            object_key=object_key,
            page_count=page_count,
            plugin_namespace=ns,
        )
    log.info('预览转换完成 doc={} pages={} bytes={}', document_id, page_count, len(pdf_bytes))
    return {'document_id': document_id, 'status': 'ready', 'page_count': page_count, 'bytes': len(pdf_bytes)}


async def _preview_failed(ns: str, document_id: str, error: str) -> dict[str, Any]:
    """落预览失败态（best-effort；落库失败不掩盖原始错误）。"""
    log.warning('预览转换失败 doc={}: {}', document_id, error)
    try:
        async with async_db_session.begin() as db:
            await document_preview_dao.mark_status(db, document_id, 'failed', error=error[:1000], plugin_namespace=ns)
    except Exception as exc:  # pragma: no cover - 环境相关
        log.error('预览失败态落库失败 doc={}: {}', document_id, exc)
    return {'document_id': document_id, 'status': 'failed', 'error': error}


@celery_app.task(name='kb.stats_repair')
async def stats_repair_task(kb_name: str, plugin_namespace: str | None = None) -> dict[str, Any]:
    """KB 统计对账任务（Phase 4 / 4.3）——薄封装，逻辑在 `kb_stats_service.repair_kb_stats`。"""
    async with async_db_session.begin() as db:
        return await repair_kb_stats(db=db, kb_name=kb_name, plugin_namespace=plugin_namespace)
