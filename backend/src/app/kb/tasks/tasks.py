"""kb.* Celery 任务（kb-ownership-and-acl-v2 spec §7.3）。

``kb.acl_reconcile`` 为 ACL 巡检入口：清理过期授权条目 + 比对修复文档级
ACL 的 Milvus 镜像漂移（DB 始终是 source-of-truth，镜像最终一致，D48/D49）。
"""

from __future__ import annotations

import asyncio

from typing import Any

from backend.src.app.kb.crud.crud_acl import doc_acl_dao, kb_acl_dao
from backend.src.app.kb.crud.crud_document import document_dao
from backend.src.app.kb.crud.crud_knowledge_base import knowledge_base_dao
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.app.task.celery import celery_app
from backend.src.common.log import log
from backend.src.database.db import async_db_session
from backend.src.database.milvus_kb_ops import read_ragf_document_acl, update_ragf_document_acl
from backend.src.database.milvus_visual_ops import read_visual_document_acl, update_visual_document_acl
from backend.src.utils.timezone import timezone

__all__ = ['acl_reconcile_task']


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
