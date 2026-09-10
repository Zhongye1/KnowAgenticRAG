"""Knowhere 管线摄取编排（双管线摄取 spec D1/D6）。

流程（spec D5 状态机）：claim(parsing) → 下载/限额复检 → SDK 解析（事务外）
→ 产物映射 → embedding → 先写 Milvus 后写 PG chunks（失败删向量补偿）
→ documents 回写（structure/summary/pipeline 指纹）→ job success。

与 legacy 链路（ingest_service.run_document_ingest）的差异：
- 解析产物为 Knowhere 语义 chunk（含层级/摘要/关键词），不走 preset 分块器；
- 文档级产物（doc_nav 结构树、文档摘要）随摄取落 documents.structure/summary；
- 进度经 ingest_jobs 审计行对外（细粒度），documents.status 仍为粗粒度镜像。

失败语义：解析阶段 → parsing_failed；向量化/索引阶段 → indexing_failed。
不自动重试（对账 beat 与 rebuild 是重试入口），不静默降级（spec D1）。
"""

from __future__ import annotations

import asyncio
import os
import tempfile

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from backend.src.app.ingest.engine.knowhere import KnowhereEngineError, parse_with_knowhere
from backend.src.app.ingest.limits import IngestLimitError, validate_ingest_file
from backend.src.app.ingest.service.ingest_service import resolve_acl_fields
from backend.src.app.ingest.service.job_service import job_service
from backend.src.app.ingest.service.knowhere_mapping import KnowhereMapped, map_knowhere_result
from backend.src.app.kb.crud import dedup_dao, document_dao, keyword_dao, knowledge_base_dao
from backend.src.app.kb.model import DocumentKeyword
from backend.src.app.kb.service.chunk_service import ChunkService
from backend.src.app.kb.service.document_storage import download_document_bytes
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.app.model_provider.service.provider_service import normalize_model_spec, provider_service
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.db import async_db_session
from backend.src.database.milvus_kb_ops import (
    delete_ragf_vectors_by_document,
    insert_ragf_document_vectors,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['KnowhereIngestService', 'knowhere_ingest_service']


@dataclass
class _PhaseError(Exception):
    """管线阶段失败（status 指明落库失败态；compensate=需删向量补偿）。"""

    message: str
    status: str
    compensate: bool = False


class KnowhereIngestService:
    """Knowhere 管线编排（分段事务：解析/embedding 等长耗时阶段不占连接）。"""

    @staticmethod
    async def run_document_parse(
        *,
        document_id: str,
        kb_name: str,
        plugin_namespace: str | None = None,
        job_id: str,
    ) -> dict[str, Any]:
        """执行 Knowhere 管线摄取（入口即任务体；自行分段管理事务）。"""
        ns = instance_namespace(plugin_namespace)

        # ---- 事务 1：校验 + claim + job running ----
        async with async_db_session.begin() as db:
            kb, doc = await KnowhereIngestService._load_targets(db, kb_name, document_id, ns)
            if not await job_service.prepare_run_with_db(db, job_id, stage='rendering'):
                log.info('摄取任务已完成，跳过重复执行 job={}', job_id)
                return {'document_id': document_id, 'status': 'ready', 'skipped': True}
            doc.status = 'parsing'
            doc.error_message = None
            await db.flush()
            embed_spec = normalize_model_spec(kb.embedding_model) or 'huggingface:BAAI/bge-m3'
            version_id = int(doc.active_version or 1)
            filename = doc.name or 'file'
            object_key = doc.source_uri or ''
            sha256 = doc.sha256

        await job_service.append_log(job_id, f'Knowhere 解析开始 file={filename}')

        # ---- 主流程：长耗时阶段全部在事务外，失败统一落 _PhaseError ----
        try:
            result = await KnowhereIngestService._download_and_parse(object_key, filename)
            acl_fields = await KnowhereIngestService._load_acl_fields(kb_name, document_id, ns)
            mapped = map_knowhere_result(
                result,
                document_id=document_id,
                kb_name=kb_name,
                version_id=version_id,
                acl_fields=acl_fields,
            )
            if not mapped.chunk_rows:
                raise _PhaseError('解析结果为空（无可索引内容）', 'parsing_failed')
            vector_rows = await KnowhereIngestService._encode_and_insert(
                db_spec=embed_spec,
                mapped=mapped,
                document_id=document_id,
                kb_name=kb_name,
                job_id=job_id,
                ns=ns,
            )
            return await KnowhereIngestService._persist_success(
                document_id=document_id,
                kb_name=kb_name,
                job_id=job_id,
                ns=ns,
                embed_spec=embed_spec,
                version_id=version_id,
                mapped=mapped,
                vector_rows=vector_rows,
                object_key=object_key,
                sha256=sha256,
            )
        except _PhaseError as exc:
            if exc.compensate:
                await asyncio.to_thread(
                    lambda: delete_ragf_vectors_by_document(kb_name, document_id, plugin_namespace=ns)
                )
            return await _fail(
                job_id=job_id,
                document_id=document_id,
                kb_name=kb_name,
                ns=ns,
                status=exc.status,
                error=exc.message,
            )

    # ---------------- 分阶段实现 ----------------

    @staticmethod
    async def _load_targets(db: AsyncSession, kb_name: str, document_id: str, ns: str) -> tuple[Any, Any]:
        kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=ns)
        if kb is None:
            raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
        doc = await document_dao.get(db, document_id, kb_name=kb_name, plugin_namespace=ns)
        if doc is None:
            raise errors.NotFoundError(msg=f'文档不存在: {document_id}')
        return kb, doc

    @staticmethod
    async def _download_and_parse(object_key: str, filename: str) -> Any:
        """下载 / 限额复检 / SDK 解析（长耗时，fail-closed）。"""
        try:
            data = await download_document_bytes(object_key)
            file_path = await asyncio.to_thread(_write_temp_file, data, filename)
            try:
                validate_ingest_file(file_path, filename)
                return await asyncio.to_thread(parse_with_knowhere, file_path, file_name=filename)
            finally:
                os.unlink(file_path)
        except (IngestLimitError, KnowhereEngineError) as exc:
            raise _PhaseError(str(exc), 'parsing_failed') from exc
        except Exception as exc:
            raise _PhaseError(f'{type(exc).__name__}: {exc}', 'parsing_failed') from exc

    @staticmethod
    async def _load_acl_fields(kb_name: str, document_id: str, ns: str) -> dict[str, Any]:
        """ACL 镜像字段解析（独立短事务；spec D6 集中穿透）。"""
        async with async_db_session.begin() as db:
            doc = await document_dao.get(db, document_id, kb_name=kb_name, plugin_namespace=ns)
            if doc is None:
                raise errors.NotFoundError(msg=f'文档不存在: {document_id}')
            return await resolve_acl_fields(db, doc=doc, ns=ns)

    @staticmethod
    async def _encode_and_insert(
        *,
        db_spec: str,
        mapped: KnowhereMapped,
        document_id: str,
        kb_name: str,
        job_id: str,
        ns: str,
    ) -> list[dict[str, Any]]:
        """embedding + 先写 Milvus（§5.4；向量行带 ACL 镜像与动态元数据字段）。"""
        await job_service.progress(job_id, stage='embedding', current=0, total=len(mapped.chunk_rows))
        texts = [row['content'] for row in mapped.chunk_rows]
        try:
            async with async_db_session() as db:
                client = await provider_service.get_embedding_model(db, db_spec)
            embeddings = await client.abatch_encode(texts)
        except Exception as exc:
            raise _PhaseError(f'Embedding 失败 spec={db_spec}: {exc}', 'indexing_failed') from exc
        if len(embeddings) != len(mapped.chunk_rows):
            raise _PhaseError('Embedding 返回数量与分块数不一致', 'indexing_failed')

        dim = int(client.dimension) if client.dimension else len(embeddings[0])
        vector_rows = [
            {**row, 'embedding': embedding} for row, embedding in zip(mapped.vector_rows, embeddings, strict=True)
        ]
        await job_service.progress(job_id, stage='indexing', current=0, total=len(vector_rows))
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
            raise _PhaseError(f'Milvus 向量写入失败: {exc}', 'indexing_failed', compensate=True) from exc
        return vector_rows

    @staticmethod
    async def _persist_success(
        *,
        document_id: str,
        kb_name: str,
        job_id: str,
        ns: str,
        embed_spec: str,
        version_id: int,
        mapped: KnowhereMapped,
        vector_rows: list[dict[str, Any]],
        object_key: str,
        sha256: str | None,
    ) -> dict[str, Any]:
        """事务 3：PG chunks + documents 回写 + 关键词目录 + dedup 登记 + job success。"""
        try:
            async with async_db_session.begin() as db:
                await ChunkService.replace_document_chunks(
                    db,
                    document_id=document_id,
                    kb_name=kb_name,
                    chunks=mapped.chunk_rows,
                    version_id=version_id,
                    plugin_namespace=ns,
                )
                doc = await document_dao.get(db, document_id, kb_name=kb_name, plugin_namespace=ns)
                if doc is not None:
                    doc.chunk_count = len(mapped.chunk_rows)
                    doc.status = 'ready'
                    doc.error_message = None
                    doc.summary = mapped.doc_summary or None
                    doc.structure = mapped.doc_structure
                    doc.pipeline = 'knowhere'
                    doc.ingest_params = {
                        'engine': 'knowhere',
                        'knowhere_mode': settings.RAGF_KNOWHERE_MODE,
                        'embedding_model': embed_spec,
                        'content_chunks': mapped.content_chunk_count,
                        'sections': mapped.section_count,
                    }
                    await db.flush()
                await _replace_document_keywords(
                    db, document_id=document_id, kb_name=kb_name, ns=ns, counts=mapped.keyword_counts
                )
                if sha256:
                    # dedup 后置登记（spec D9；SAVEPOINT 冲突容忍，不阻断本事务）
                    await dedup_dao.register(
                        db,
                        sha256=sha256,
                        kb_name=kb_name,
                        document_id=document_id,
                        object_key=object_key,
                        plugin_namespace=ns,
                    )
                await job_service.mark_success_with_db(
                    db,
                    job_id,
                    current=len(mapped.chunk_rows),
                    total=len(mapped.chunk_rows),
                    message=(
                        f'Knowhere 管线完成（{mapped.content_chunk_count} chunks + {mapped.section_count} sections）'
                    ),
                )
        except Exception as exc:
            raise _PhaseError(f'chunks 元数据写入失败，已回滚向量: {exc}', 'indexing_failed', compensate=True) from exc

        log.info('Knowhere 管线摄取完成 doc={} kb={} chunks={}', document_id, kb_name, len(mapped.chunk_rows))
        return {
            'document_id': document_id,
            'status': 'ready',
            'chunk_count': len(mapped.chunk_rows),
            'sections': mapped.section_count,
        }


async def _replace_document_keywords(
    db: AsyncSession,
    *,
    document_id: str,
    kb_name: str,
    ns: str,
    counts: dict[str, int],
) -> None:
    """关键词目录幂等替换（先删后插；无关键词时清空旧目录）。"""
    await keyword_dao.delete_by_document(db, document_id, plugin_namespace=ns)
    if not counts:
        return
    db.add_all([
        DocumentKeyword(
            document_id=document_id,
            keyword=keyword,
            kb_name=kb_name,
            plugin_namespace=ns,
            node_count=count,
        )
        for keyword, count in counts.items()
    ])
    await db.flush()


def _write_temp_file(data: bytes, filename: str) -> str:
    """字节流落临时文件（保留扩展名，供引擎/限额按类型处理）。"""
    suffix = os.path.splitext(filename)[1] or '.bin'
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
    return path


async def _fail(
    *,
    job_id: str,
    document_id: str,
    kb_name: str,
    ns: str,
    status: str,
    error: str,
) -> dict[str, str]:
    """落文档失败态 + job 失败态（独立事务；调用方原事务已回滚）。"""
    try:
        async with async_db_session.begin() as db:
            doc = await document_dao.get(db, document_id, kb_name=kb_name, plugin_namespace=ns)
            if doc is not None:
                doc.status = status
                doc.error_message = (error or '')[:1000]
                await db.flush()
            await job_service.mark_failed_with_db(db, job_id, error=error)
    except Exception as exc:
        log.error('Knowhere 管线落失败态失败 doc={}: {}', document_id, exc)
    return {'document_id': document_id, 'status': status, 'error': error}


knowhere_ingest_service = KnowhereIngestService()
