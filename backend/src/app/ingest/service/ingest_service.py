"""摄取编排服务（Yuxi knowledge/implementations/milvus.py index 段重写，ragf-design §5.3/§5.4/§16.2）。

职责：状态 claim → 解析（Markdown）→ 落 MinIO → 分块 → embedding → 双写
（先向量后 PG chunks，§5.4）→ 状态回写。事务边界由 Celery 任务持有；本服务
只做步骤编排，失败抛 ``IngestStepError``（带目标失败态），任务层负责落库失败态。
chunks 经 kb 域公开契约写入（D9），本域不持有 chunk 表结构。
"""

from __future__ import annotations

import asyncio
import os
import tempfile

from typing import TYPE_CHECKING, Any

from backend.src.app.ingest.chunking import nlp
from backend.src.app.ingest.chunking.dispatcher import chunk_markdown
from backend.src.app.ingest.chunking.presets import (
    CHUNK_ENGINE_VERSION,
    normalize_chunk_preset_id,
)
from backend.src.app.ingest.parser.factory import (
    DIRECT_TEXT_EXTENSIONS,
    OCR_EXTENSIONS,
    OFFICE_TEXT_EXTENSIONS,
    parse_document,
    parse_document_with_fallback,
)
from backend.src.app.ingest.routing.router import (
    filter_available_pipelines,
    resolve_routing_inputs,
    route,
)
from backend.src.app.kb.crud import doc_acl_dao, document_dao, knowledge_base_dao
from backend.src.app.kb.service.chunk_service import ChunkService
from backend.src.app.kb.service.document_storage import (
    download_document_bytes,
    kb_object_key,
    kb_parsed_object_key,
    upload_document_bytes,
)
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.app.model_provider.service.provider_service import normalize_model_spec, provider_service
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.db import async_db_session
from backend.src.database.milvus_kb_ops import (
    count_ragf_vectors_by_document,
    delete_ragf_vectors_by_document,
    insert_ragf_document_vectors,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

IN_PROGRESS_STATUSES = frozenset({'parsing', 'indexing'})
TERMINAL_FAILED_STATUSES = frozenset({'parsing_failed', 'indexing_failed', 'failed'})


class IngestStepError(Exception):
    """摄取步骤失败（status 指明落库失败态：parsing_failed / indexing_failed）。"""

    def __init__(self, message: str, status: str) -> None:
        super().__init__(message)
        self.status = status


class IngestService:
    """文档摄取编排。"""

    @staticmethod
    async def run_document_ingest(  # ruff:ignore[complex-structure]
        db: AsyncSession,
        *,
        document_id: str,
        kb_name: str,
        plugin_namespace: str | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """执行单文档摄取（调用方持有事务；异常时自行回滚并落失败态）。"""
        ns = instance_namespace(plugin_namespace)
        kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=ns)
        if kb is None:
            raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
        doc = await document_dao.get(db, document_id, kb_name=kb_name, plugin_namespace=ns)
        if doc is None:
            raise errors.NotFoundError(msg=f'文档不存在: {document_id}')

        if doc.status in IN_PROGRESS_STATUSES:
            raise errors.ConflictError(msg='文档正在摄取中，请等待完成后再试')

        # claim：进入 parsing，清空上次失败信息
        doc.status = 'parsing'
        doc.error_message = None
        await db.flush()

        processing = _resolve_processing_params(doc, params)
        embed_spec = normalize_model_spec(kb.embedding_model) or 'huggingface:BAAI/bge-m3'
        version_id = int(doc.active_version or 1)
        filename = doc.name or 'file'
        object_key = doc.source_uri or kb_object_key(ns, kb_name, document_id, filename)

        # ① 解析：对象 → Markdown（引擎失败 → parsing_failed；OCR 引擎按 M4
        #    MinerU-HTTP → RapidOCR 兜底，实际引擎回写指纹便于重摄取复现）
        try:
            data = await download_document_bytes(object_key)
            if os.path.splitext(filename)[1].lower() in OCR_EXTENSIONS:
                markdown, ocr_engine_used = await parse_document_with_fallback(data, filename, processing)
                processing['ocr_engine'] = ocr_engine_used
            else:
                markdown = await parse_document(data, filename, processing)
        except IngestStepError:
            raise
        except Exception as exc:
            raise IngestStepError(f'解析失败: {exc}', 'parsing_failed') from exc
        if not markdown or not markdown.strip():
            raise IngestStepError('解析结果为空', 'parsing_failed')

        # ② Markdown 落 MinIO（对账/再摄取/来源回放）
        try:
            await upload_document_bytes(
                kb_parsed_object_key(ns, kb_name, document_id),
                markdown.encode('utf-8'),
                content_type='text/markdown',
            )
        except Exception as exc:
            raise IngestStepError(f'Markdown 落对象存储失败: {exc}', 'parsing_failed') from exc

        # ③ 进入 indexing
        doc.status = 'indexing'
        await db.flush()

        # ④ 分块
        try:
            records = chunk_markdown(markdown, file_id=document_id, filename=filename, processing_params=processing)
        except Exception as exc:
            raise IngestStepError(f'分块失败: {exc}', 'indexing_failed') from exc
        meta_rows = _map_chunk_records(records, preset=processing['chunk_preset_id'])
        if not meta_rows:
            raise IngestStepError('分块结果为空（无可索引内容）', 'indexing_failed')

        # ⑤ embedding（provider 域客户端；网络失败 → indexing_failed 可重试）
        texts = [row['content'] for row in meta_rows]
        try:
            client = await provider_service.get_embedding_model(db, embed_spec)
            embeddings = await client.abatch_encode(texts)
        except IngestStepError:
            raise
        except Exception as exc:
            raise IngestStepError(f'Embedding 失败 spec={embed_spec}: {exc}', 'indexing_failed') from exc
        if len(embeddings) != len(meta_rows):
            raise IngestStepError('Embedding 返回数量与分块数不一致', 'indexing_failed')

        dim = (
            int(client.dimension)
            if client.dimension
            else len(embeddings[0])
            if embeddings
            else settings.RAGF_TEMPLATE_DIM
        )
        # ACL 字段镜像（agent-layer spec §3.2：DB 为准、Milvus 为镜像）
        acl_fields = await resolve_acl_fields(db, doc=doc, ns=ns)
        vector_rows = [
            {
                'chunk_id': f'{document_id}:{version_id}:{idx}',
                'embedding': embedding,
                'content': row['content'],
                'kb_name': kb_name,
                'document_id': document_id,
                'version_id': version_id,
                'chunk_index': idx,
                **acl_fields,
            }
            for idx, (row, embedding) in enumerate(zip(meta_rows, embeddings, strict=True))
        ]

        # ⑥ 双写：先向量（§5.4）
        try:
            await asyncio.to_thread(
                lambda: insert_ragf_document_vectors(
                    kb_name=kb_name,
                    document_id=document_id,
                    dim=dim,
                    rows=vector_rows,
                    plugin_namespace=ns,
                )
            )
        except Exception as exc:
            raise IngestStepError(f'Milvus 向量写入失败: {exc}', 'indexing_failed') from exc

        # ⑦ 后 PG chunks；失败 → 删向量补偿后抛 indexing_failed
        try:
            await ChunkService.replace_document_chunks(
                db,
                document_id=document_id,
                kb_name=kb_name,
                chunks=meta_rows,
                version_id=version_id,
                plugin_namespace=ns,
            )
        except Exception as exc:
            await asyncio.to_thread(lambda: delete_ragf_vectors_by_document(kb_name, document_id, plugin_namespace=ns))
            raise IngestStepError(f'chunks 元数据写入失败，已回滚向量: {exc}', 'indexing_failed') from exc

        # ⑧ 状态回写 + 参数指纹
        doc.chunk_count = len(meta_rows)
        doc.status = 'ready'
        doc.error_message = None
        doc.ingest_params = {
            'chunk_preset_id': processing['chunk_preset_id'],
            'chunk_parser_config': processing['chunk_parser_config'],
            'chunk_engine_version': processing['chunk_engine_version'],
            'ocr_engine': processing.get('ocr_engine') or '',
            'embedding_model': embed_spec,
        }
        doc.pipeline = f'ragf:{processing["chunk_preset_id"]}'
        await db.flush()
        log.info('文档摄取完成 doc={} kb={} chunks={}', document_id, kb_name, len(meta_rows))
        return {'document_id': document_id, 'status': 'ready', 'chunk_count': len(meta_rows)}

    @staticmethod
    async def reconcile_scan(
        db: AsyncSession,
        *,
        kb_name: str | None = None,
        plugin_namespace: str | None = None,
        max_discrepancies: int = 20,
    ) -> dict[str, Any]:
        """对账扫描（ragf-design §14.7/M7）：ready 文档三方一致校验。

        比较 ``documents.chunk_count``（声明）与 PG ``chunks`` 计数、Milvus 模板
        集合向量计数；不一致项进入异常清单（含原因）。只读扫描、不派发任务 ——
        beat 任务消费清单重新投递 ``ingest.process_document``（幂等全量替换）。
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
                declared = int(doc.chunk_count or 0)
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
    供 legacy / knowhere / visual 三条管线共用（spec D6：镜像字段集中穿透）。
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


def _resolve_processing_params(doc: Any, request: dict[str, Any] | None) -> dict[str, Any]:
    """合并已存指纹与单次请求参数；缺省 preset=general。"""
    base = dict((doc.ingest_params or {}) if doc is not None else {})
    merged = {**base, **(dict(request or {}) if request else {})}
    preset = normalize_chunk_preset_id(merged.get('chunk_preset_id'))
    parser_config = merged.get('chunk_parser_config')
    parser_config = dict(parser_config) if isinstance(parser_config, dict) else {}
    return {
        'chunk_preset_id': preset,
        'chunk_parser_config': parser_config,
        'chunk_engine_version': CHUNK_ENGINE_VERSION,
        'ocr_engine': str(merged.get('ocr_engine') or settings.RAGF_OCR_ENGINE or ''),
    }


def _map_chunk_records(records: list[dict[str, Any]], *, preset: str) -> list[dict[str, Any]]:
    """分块记录 → PG chunks 行（Yuxi start_char_pos/end_char_pos → fba char_pos_*）。"""
    rows: list[dict[str, Any]] = []
    for record in records:
        content = str(record.get('content') or '').strip()
        if not content:
            continue
        start = record.get('start_char_pos')
        rows.append({
            'content': content,
            'chunk_index': int(record.get('chunk_index') or len(rows)),
            'token_count': nlp.count_tokens(content),
            'char_pos_start': int(start) if start is not None else None,
            'char_pos_end': int(record['end_char_pos']) if record.get('end_char_pos') is not None else None,
            'meta': {
                'preset': preset,
                'chunk_engine_version': CHUNK_ENGINE_VERSION,
            },
        })
    return rows


def _resolve_engine_extension(filename: str) -> str:
    ext = os.path.splitext(filename or '')[1].lower()
    if ext in DIRECT_TEXT_EXTENSIONS:
        return 'direct_text'
    if ext in OFFICE_TEXT_EXTENSIONS:
        return 'office_text'
    if ext in OCR_EXTENSIONS:
        return settings.RAGF_OCR_ENGINE or 'mineru'
    return 'unsupported'


async def plan_document_pipelines(
    document_id: str,
    kb_name: str,
    plugin_namespace: str | None = None,
) -> list[str]:
    """路由规划（双管线摄取 spec D2/D3）：决定文档走 legacy / knowhere / visual。

    只读阶段：读 KB 行（routing_mode / pdf_text_page_ratio）与文档行（文件名 /
    对象键），auto 模式下 PDF 需下载做形态探测（事务外）。返回管线列表，任务层
    据此执行 legacy 或派发 knowhere/visual 任务。
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
        source_uri=object_key if str(object_key).startswith(('http://', 'https://')) else None,
    )

    # auto 模式下 PDF 形态探测需要本地文件；text/visual/hybrid 强制模式跳过探测
    local_path: str | None = None
    if ctx.routing_mode == 'auto' and ctx.is_pdf and not ctx.is_http:
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


ingest_service = IngestService()

__all__ = [
    'IngestService',
    'IngestStepError',
    '_resolve_engine_extension',
    'ingest_service',
    'plan_document_pipelines',
    'resolve_acl_fields',
]
