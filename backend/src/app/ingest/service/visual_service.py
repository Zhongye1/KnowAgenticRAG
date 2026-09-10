"""PixelRAG 视觉管线编排（双管线摄取 spec D7）。

流程：claim(parsing) → 下载/限额复检 → render→tiles（事务外）→ 视觉编码
（DashScope，事务外批量）→ 事务内解析 ACL → tile 图落 MinIO → 向量写
ragf_visual（ACL 镜像 + 指纹守卫）→ documents 回写（pipeline='visual'）→
job success。

与 Knowhere 管线同构的失败语义：渲染失败 → parsing_failed；编码/索引失败 →
indexing_failed；不自动重试，不静默降级。
"""

from __future__ import annotations

import asyncio
import os
import tempfile

from typing import Any

from backend.src.app.ingest.engine.pixelrag import PixelRagEngineError, Tile, render_to_tiles
from backend.src.app.ingest.engine.visual_encoder import get_visual_encoder
from backend.src.app.ingest.limits import IngestLimitError, validate_ingest_file
from backend.src.app.ingest.service.ingest_service import resolve_acl_fields
from backend.src.app.ingest.service.job_service import job_service
from backend.src.app.kb.crud import dedup_dao, document_dao, knowledge_base_dao
from backend.src.app.kb.service.document_storage import download_document_bytes, upload_document_bytes
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.db import async_db_session
from backend.src.database.milvus_visual_ops import insert_visual_rows

__all__ = ['VisualIngestService', 'build_visual_rows', 'visual_ingest_service', 'visual_tile_object_key']


def visual_tile_object_key(ns: str, kb_name: str, document_id: str, image_id: str) -> str:
    """tile 图对象键：``kb/{ns}/{kb}/{doc}/tiles/{image_id}.jpg``。"""
    return f'kb/{ns}/{kb_name}/{document_id}/tiles/{image_id}.jpg'


def build_visual_rows(
    tiles: list[Tile],
    *,
    document_id: str,
    kb_name: str,
    acl_fields: dict[str, Any],
    vectors: list[list[float]],
) -> list[dict[str, Any]]:
    """tiles + 向量 → ragf_visual 行（纯函数；id 幂等 = {document_id}_t{序号}）。"""
    rows: list[dict[str, Any]] = []
    for idx, (tile, vector) in enumerate(zip(tiles, vectors, strict=True)):
        image_id = f'{document_id}_t{idx}'
        rows.append({
            'id': image_id,
            'image_id': image_id,
            'vector': vector,
            'image_path': visual_tile_object_key(acl_fields['namespace'], kb_name, document_id, image_id),
            'kb_name': kb_name,
            'document_id': document_id,
            'page': int(tile.get('page', idx)),
            'position': str(tile.get('position', f'strip_{idx}')),
            'chunk_type': 'tile',
            'parent_section': '',
            'content_summary': '',
            'source_chunk_id': '',
            **acl_fields,
        })
    return rows


class VisualIngestService:
    """PixelRAG 视觉管线编排（分段事务，与 Knowhere 管线同构）。"""

    @staticmethod
    async def run_document_parse(  # ruff:ignore[complex-structure] —— 与 legacy run_document_ingest 同约定
        *,
        document_id: str,
        kb_name: str,
        plugin_namespace: str | None = None,
        job_id: str,
    ) -> dict[str, Any]:
        """执行视觉管线摄取（入口即任务体）。"""
        ns = instance_namespace(plugin_namespace)

        # ---- 事务 1：校验 + claim + job running ----
        async with async_db_session.begin() as db:
            kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=ns)
            if kb is None:
                raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
            doc = await document_dao.get(db, document_id, kb_name=kb_name, plugin_namespace=ns)
            if doc is None:
                raise errors.NotFoundError(msg=f'文档不存在: {document_id}')
            if not await job_service.prepare_run_with_db(db, job_id, stage='rendering'):
                log.info('视觉摄取任务已完成，跳过重复执行 job={}', job_id)
                return {'document_id': document_id, 'status': 'ready', 'skipped': True}
            doc.status = 'parsing'
            doc.error_message = None
            await db.flush()
            filename = doc.name or 'file'
            object_key = doc.source_uri or ''
            sha256 = doc.sha256

        await job_service.append_log(job_id, f'PixelRAG 渲染开始 file={filename}')

        try:
            # ---- 事务外：下载 / 限额复检 / 渲染切片 ----
            data = await download_document_bytes(object_key)
            file_path = await asyncio.to_thread(_write_temp_file, data, filename)
            try:
                validate_ingest_file(file_path, filename)
                tiles = await asyncio.to_thread(render_to_tiles, file_path)
            finally:
                os.unlink(file_path)

            # ---- 视觉编码（事务外批量；fail-closed）----
            await job_service.progress(job_id, stage='embedding', current=0, total=len(tiles))
            encoder = get_visual_encoder()
            vectors = await asyncio.to_thread(encoder.embed_images, [tile['image_bytes'] for tile in tiles])

            # ---- 事务 2：ACL 镜像字段（读）----
            async with async_db_session.begin() as db:
                doc = await document_dao.get(db, document_id, kb_name=kb_name, plugin_namespace=ns)
                if doc is None:
                    raise errors.NotFoundError(msg=f'文档不存在: {document_id}')
                acl_fields = await resolve_acl_fields(db, doc=doc, ns=ns)

            rows = build_visual_rows(
                tiles, document_id=document_id, kb_name=kb_name, acl_fields=acl_fields, vectors=vectors
            )

            # ---- tile 图落 MinIO + 向量写 ragf_visual ----
            await job_service.progress(job_id, stage='indexing', current=0, total=len(rows))
            for idx, row in enumerate(rows):
                await upload_document_bytes(
                    row['image_path'],
                    tiles[idx]['image_bytes'],
                    content_type='image/jpeg',
                )
            inserted = await asyncio.to_thread(
                lambda: insert_visual_rows(kb_name=kb_name, document_id=document_id, rows=rows, plugin_namespace=ns)
            )
        except (IngestLimitError, PixelRagEngineError) as exc:
            return await _fail(job_id, document_id, kb_name, ns, 'parsing_failed', str(exc))
        except errors.NotFoundError:
            raise
        except Exception as exc:
            return await _fail(
                job_id,
                document_id,
                kb_name,
                ns,
                'indexing_failed',
                f'{type(exc).__name__}: {exc}',
            )

        # ---- 事务 3：documents 回写 + job success ----
        async with async_db_session.begin() as db:
            doc = await document_dao.get(db, document_id, kb_name=kb_name, plugin_namespace=ns)
            if doc is not None:
                doc.chunk_count = len(rows)
                doc.status = 'ready'
                doc.error_message = None
                doc.pipeline = 'visual'
                doc.ingest_params = {
                    'engine': 'pixelrag',
                    'provider': settings.RAGF_VISUAL_PROVIDER,
                    'model': settings.RAGF_VISUAL_MODEL,
                    'dim': settings.RAGF_VISUAL_DIM,
                    'tiles': len(rows),
                }
                await db.flush()
                if sha256:
                    # dedup 后置登记（spec D9；SAVEPOINT 冲突容忍）
                    await dedup_dao.register(
                        db,
                        sha256=sha256,
                        kb_name=kb_name,
                        document_id=document_id,
                        plugin_namespace=ns,
                    )
            await job_service.mark_success_with_db(
                db,
                job_id,
                current=len(rows),
                total=len(rows),
                message=f'PixelRAG 管线完成（{inserted} tiles）',
            )

        log.info('PixelRAG 管线摄取完成 doc={} kb={} tiles={}', document_id, kb_name, len(rows))
        return {'document_id': document_id, 'status': 'ready', 'chunk_count': len(rows)}


def _write_temp_file(data: bytes, filename: str) -> str:
    suffix = os.path.splitext(filename)[1] or '.bin'
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
    return path


async def _fail(
    job_id: str,
    document_id: str,
    kb_name: str,
    ns: str,
    status: str,
    error: str,
) -> dict[str, str]:
    """落文档失败态 + job 失败态（独立事务）。"""
    try:
        async with async_db_session.begin() as db:
            doc = await document_dao.get(db, document_id, kb_name=kb_name, plugin_namespace=ns)
            if doc is not None:
                doc.status = status
                doc.error_message = (error or '')[:1000]
                await db.flush()
            await job_service.mark_failed_with_db(db, job_id, error=error)
    except Exception as exc:
        log.error('视觉管线落失败态失败 doc={}: {}', document_id, exc)
    return {'document_id': document_id, 'status': status, 'error': error}


visual_ingest_service = VisualIngestService()
