"""摄取编排服务（双管线摄取 spec：路由规划 / 对账 / ACL 解析的共享层）。

legacy 工厂链已删除（未上线直接迁移 Knowhere 双管线，spec D2/D3）：本模块不再
持有解析/分块逻辑，保留三块共享职责——

1. ``plan_document_pipelines``：路由规划（读 KB 行 → PDF 形态探测 → 策略链 →
   可用性校验，不可用引擎直接 fail-closed 报错）；
2. ``resolve_acl_fields``：ACL 镜像字段解析（knowhere/visual 管线共用，D6）；
3. ``IngestService.reconcile_scan / mark_failed``：对账扫描（含视觉管线分支）
   与失败态回写。
"""

from __future__ import annotations

import asyncio
import os
import tempfile

from typing import TYPE_CHECKING, Any

from backend.src.app.ingest.routing.router import (
    filter_available_pipelines,
    resolve_routing_inputs,
    route,
)
from backend.src.app.kb.crud import doc_acl_dao, document_dao, knowledge_base_dao
from backend.src.app.kb.service.chunk_service import ChunkService
from backend.src.app.kb.service.document_storage import download_document_bytes
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.database.db import async_db_session
from backend.src.database.milvus_kb_ops import count_ragf_vectors_by_document

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

IN_PROGRESS_STATUSES = frozenset({'parsing', 'indexing'})
TERMINAL_FAILED_STATUSES = frozenset({'parsing_failed', 'indexing_failed', 'failed'})


class IngestService:
    """对账扫描与失败态回写。"""

    @staticmethod
    async def reconcile_scan(
        db: AsyncSession,
        *,
        kb_name: str | None = None,
        plugin_namespace: str | None = None,
        max_discrepancies: int = 20,
    ) -> dict[str, Any]:
        """对账扫描（ragf-design §14.7/M7）：ready 文档一致校验。

        文本管线（knowhere）：声明 chunk_count vs PG chunks vs Milvus 模板集合
        三方一致；视觉管线（visual）：声明 chunk_count vs ragf_visual 计数两方
        一致。不一致项进入异常清单（含原因）——beat 任务消费清单重新投递
        ``ingest.process_document``（幂等全量替换）。
        """
        ns = instance_namespace(plugin_namespace)
        kbs = (
            [await knowledge_base_dao.get(db, kb_name, plugin_namespace=ns)]
            if kb_name
            else await knowledge_base_dao.list_all(db, plugin_namespace=ns)
        )
        kbs = [kb for kb in kbs if kb is not None]
        checked = 0
        truncated = False
        anomalies: list[dict[str, Any]] = []
        for kb in kbs:
            stmt = await document_dao.get_select(kb_name=kb.kb_name, plugin_namespace=ns, status='ready')
            documents = list((await db.execute(stmt)).scalars().all())
            for doc in documents:
                if len(anomalies) >= max_discrepancies:
                    truncated = True
                    break
                checked += 1
                declared = int(doc.chunk_count or 0)
                pipeline = str(getattr(doc, 'pipeline', '') or '')
                # 视觉管线文档（pipeline=visual）：无 PG chunks，声明值对视觉集合计数（spec D7）
                if pipeline == 'visual':
                    from backend.src.database.milvus_visual_ops import count_visual_by_document

                    visual_count = await asyncio.to_thread(
                        count_visual_by_document, kb.kb_name, doc.document_id, plugin_namespace=ns
                    )
                    if declared == visual_count:
                        continue
                    anomalies.append({
                        'document_id': doc.document_id,
                        'kb_name': doc.kb_name,
                        'plugin_namespace': ns,
                        'declared_chunk_count': declared,
                        'pg_chunk_count': None,
                        'vector_count': visual_count,
                        'reasons': ['declared_chunk_count != milvus_visual (visual pipeline)'],
                    })
                    log.warning(
                        '摄取对账异常（visual）doc={} kb={} declared={} milvus_visual={}',
                        doc.document_id,
                        doc.kb_name,
                        declared,
                        visual_count,
                    )
                    continue
                pg_count = await ChunkService.count_by_document(
                    db,
                    doc.document_id,
                    kb_name=kb.kb_name,
                    plugin_namespace=ns,
                )
                vector_count = await asyncio.to_thread(
                    count_ragf_vectors_by_document,
                    kb.kb_name,
                    doc.document_id,
                    plugin_namespace=ns,
                )
                if declared == pg_count == vector_count:
                    continue
                reasons = []
                if declared != pg_count:
                    reasons.append('declared_chunk_count != pg_chunks')
                if pg_count != vector_count:
                    reasons.append('pg_chunks != milvus_vectors')
                anomalies.append({
                    'document_id': doc.document_id,
                    'kb_name': doc.kb_name,
                    'plugin_namespace': ns,
                    'declared_chunk_count': declared,
                    'pg_chunk_count': pg_count,
                    'vector_count': vector_count,
                    'reasons': reasons,
                })
                log.warning(
                    '摄取对账异常 doc={} kb={} declared={} pg={} milvus={}',
                    doc.document_id,
                    doc.kb_name,
                    declared,
                    pg_count,
                    vector_count,
                )
        return {
            'plugin_namespace': ns,
            'kb_count': len(kbs),
            'checked': checked,
            'anomaly_count': len(anomalies),
            'truncated': truncated,
            'anomalies': anomalies,
        }

    @staticmethod
    async def mark_failed(
        *,
        db: AsyncSession,
        document_id: str,
        kb_name: str,
        plugin_namespace: str | None,
        status: str,
        message: str,
    ) -> None:
        """落失败态（独立事务调用，供任务终态处理）。"""
        doc = await document_dao.get(db, document_id, kb_name=kb_name, plugin_namespace=plugin_namespace)
        if doc is None:
            return
        doc.status = status if status in TERMINAL_FAILED_STATUSES else 'failed'
        doc.error_message = (message or '')[:1000]
        await db.flush()


async def resolve_acl_fields(db: AsyncSession, *, doc: Any, ns: str) -> dict[str, Any]:
    """解析文档 ACL 字段（镜像到 Milvus 行；DB 为 source-of-truth）。

    visibility/owner_id 取 documents 行（缺省 restricted/None）；groups 取
    rag_doc_acl 授权组行。legacy 文档（ACL 字段为空）按 restricted 处理，
    需重新摄取才能进入授权检索范围（backfill 语义）。
    供 knowhere / visual 管线共用（spec D6：镜像字段集中穿透）。
    """
    visibility = str(getattr(doc, 'visibility', None) or 'restricted')
    owner_id = getattr(doc, 'owner_id', None) or ''
    groups = await doc_acl_dao.list_document_groups(
        db, document_id=str(doc.document_id), kb_name=str(doc.kb_name), plugin_namespace=ns
    )
    return {
        'namespace': ns,
        'visibility': visibility,
        'owner_id': owner_id,
        'groups': groups,
    }


async def plan_document_pipelines(
    document_id: str,
    kb_name: str,
    plugin_namespace: str | None = None,
) -> list[str]:
    """路由规划（双管线摄取 spec D2/D3）：决定文档走 knowhere / visual。

    只读阶段：读 KB 行（routing_mode / pdf_text_page_ratio）与文档行（文件名 /
    对象键），auto 模式下 PDF 需下载做形态探测（事务外）。不可用引擎直接
    fail-closed 报错（legacy 兜底已随旧工厂链删除）。
    """
    ns = instance_namespace(plugin_namespace)
    async with async_db_session() as db:
        kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=ns)
        if kb is None:
            raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
        doc = await document_dao.get(db, document_id, kb_name=kb_name, plugin_namespace=ns)
        if doc is None:
            raise errors.NotFoundError(msg=f'文档不存在: {document_id}')
        if doc.status in IN_PROGRESS_STATUSES:
            raise errors.ConflictError(msg='文档正在摄取中，请等待完成后再试')
        filename = doc.name or 'file'
        object_key = doc.source_uri or ''
        kb_routing_mode = getattr(kb, 'routing_mode', None)
        text_page_ratio = getattr(kb, 'pdf_text_page_ratio', None)

    ctx = resolve_routing_inputs(
        filename=filename,
        kb_routing_mode=kb_routing_mode,
        text_page_ratio=text_page_ratio,
    )

    # auto 模式下 PDF 形态探测需要本地文件；text/visual/hybrid 强制模式跳过探测
    local_path: str | None = None
    if ctx.routing_mode == 'auto' and ctx.is_pdf:
        local_path = await _download_for_probe(object_key, filename)

    try:
        pipelines = route(ctx)
    finally:
        if local_path:
            os.unlink(local_path)
    pipelines = filter_available_pipelines(pipelines, filename=filename)
    log.info('文档路由完成 doc={} kb={} file={} pipelines={}', document_id, kb_name, filename, pipelines)
    return pipelines


async def _download_for_probe(object_key: str, filename: str) -> str | None:
    """下载对象到临时文件供 PDF 形态探测（失败返回 None → 探测 selector 弃权）。"""
    try:
        data = await download_document_bytes(object_key)
    except Exception as exc:
        log.warning('PDF 形态探测下载失败（回退保守路由）file={}: {}', filename, exc)
        return None
    fd, path = tempfile.mkstemp(suffix='.pdf')
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
    return path


__all__ = [
    'IngestService',
    'ingest_service',
    'plan_document_pipelines',
    'resolve_acl_fields',
]

ingest_service = IngestService()
