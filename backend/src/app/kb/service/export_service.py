"""知识库导出服务（kb-落地改造清单 §9.2「整库导出 ZIP」）。

产物结构：:

    manifest.json              KB 元数据 + 文档清单（含 ACL）+ 导出元信息
    documents/{doc_id}/{name}  原文件字节
    parsed/{doc_id}.md         解析产物（Knowhere `__parsed__.md`）

三个设计取舍：

1. **异步**：大库同步打包必然超时（Yuxi 是同步打包 + `FileResponse` 本地文件），
   故落 `kb_exports` 行 + Celery 任务 + 轮询状态，产物进 MinIO 走预签名下载。
2. **按 document_id 分目录**：不同文档可能重名（`documents.name` 无唯一约束），
   用 id 做目录名天然避免覆盖，manifest 里给出映射。
3. **打包与读对象都在线程池**：`zipfile` 是同步 IO，对象读取也是同步 SDK；
   事务边界只包「读元数据」与「写终态」，长耗时段不占数据库连接（沿用 ingest 的分段事务惯例）。
"""

from __future__ import annotations

import asyncio
import inspect
import json
import zipfile

from collections.abc import Awaitable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from tempfile import mkdtemp
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from backend.src.app.kb.crud import document_dao, export_dao, knowledge_base_dao
from backend.src.app.kb.crud.crud_acl import doc_acl_dao
from backend.src.app.kb.service.document_storage import (
    download_document_bytes,
    kb_parsed_object_key,
    upload_document_bytes,
)
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.db import async_db_session

if TYPE_CHECKING:
    from collections.abc import Callable

__all__ = ['ExportService', 'ExportTooLargeError', 'build_manifest', 'export_service', 'write_zip']

MANIFEST_NAME = 'manifest.json'
MANIFEST_VERSION = 1


class ExportTooLargeError(RuntimeError):
    """ZIP 产物超过配置上限（防一个导出打满磁盘/对象存储）。"""


# loader 可同步可异步：已在内存的条目（manifest）没必要硬造一个 async 函数只为适配 await，
# 而读对象（MinIO）本身就是异步包装。`write_zip` 两者都接。
LoaderResult = bytes | None | Awaitable[bytes | None]


@dataclass(frozen=True)
class ExportEntry:
    """一个待写入 ZIP 的条目；`loader` 返回 None 表示跳过（对象已不存在）。"""

    arcname: str
    loader: Callable[[], LoaderResult]


def build_manifest(
    *,
    kb: dict[str, Any],
    documents: list[dict[str, Any]],
    export_id: str,
    exported_at: str,
) -> dict[str, Any]:
    """构造 manifest（纯函数，单测直覆盖）。

    `documents[].acl` 是该文档的 allow 条目（主体类型/ID），随导出一起带走，
    使导入侧能重建授权而不是丢成「谁都看不见」。
    """
    return {
        'manifest_version': MANIFEST_VERSION,
        'export_id': export_id,
        'exported_at': exported_at,
        'layout': {
            'documents': 'documents/{document_id}/{name}',
            'parsed': 'parsed/{document_id}.md',
        },
        'knowledge_base': kb,
        'documents': documents,
    }


async def write_zip(entries: list[ExportEntry], *, target: Path, max_bytes: int) -> tuple[int, int]:
    """把条目写入 ZIP；返回 (写入条目数, ZIP 字节数)。

    每写一个条目就检查产物大小——**按产物字节数封顶**而不是按源字节数估算，
    因为待打包的往往已是压缩过的 pdf/docx，估算会失准。超限抛 `ExportTooLargeError`
    并由调用方清理临时文件。
    """
    written = 0
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for entry in entries:
            payload = entry.loader()
            if inspect.isawaitable(payload):
                payload = await payload
            if payload is None:
                continue
            archive.writestr(entry.arcname, payload)
            written += 1
            # 本地临时文件的 stat 不是该规则针对的网络/DB 阻塞 IO；逐条目 to_thread 的调度
            # 开销反而更大，故就地读取并显式豁免（ASYNC240 = blocking-path-method-in-async-function）。
            size_now = target.stat().st_size  # ruff: ignore[blocking-path-method-in-async-function]
            if size_now > max_bytes:
                raise ExportTooLargeError(f'导出产物超过上限 {max_bytes} 字节（已写入 {written} 个条目），请分批导出')
    return written, target.stat().st_size  # ruff: ignore[blocking-path-method-in-async-function]


class ExportService:
    """知识库导出业务逻辑。"""

    @staticmethod
    async def create_export(
        *,
        db: Any,
        kb_name: str,
        created_by: str | None,
    ) -> dict[str, Any]:
        """建导出任务（pending）；调用方负责派发 Celery 任务。"""
        kb = await knowledge_base_dao.get(db, kb_name)
        if kb is None:
            raise errors.NotFoundError(msg='知识库不存在')
        row = await export_dao.create(db, export_id=uuid4().hex, kb_name=kb_name, created_by=created_by)
        return {'export_id': row.export_id, 'status': row.status, 'kb_name': kb_name}

    @staticmethod
    async def get_export(*, db: Any, kb_name: str, export_id: str) -> dict[str, Any]:
        """查询导出状态；成功时附带预签名下载 URL。"""
        row = await export_dao.get(db, export_id)
        if row is None or row.kb_name != kb_name:
            raise errors.NotFoundError(msg='导出任务不存在')
        data: dict[str, Any] = {
            'export_id': row.export_id,
            'kb_name': row.kb_name,
            'status': row.status,
            'document_count': row.document_count,
            'size_bytes': row.size_bytes,
            'error': row.error,
            'created_time': row.created_time,
            'url': None,
        }
        if row.status == 'success' and row.object_key:
            from backend.src.app.kb.service.document_storage import get_document_url

            data['url'] = await asyncio.to_thread(get_document_url, row.object_key)
        return data

    @staticmethod
    async def list_exports(*, db: Any, kb_name: str, limit: int = 20) -> list[dict[str, Any]]:
        rows = await export_dao.list_by_kb(db, kb_name, limit=limit)
        return [
            {
                'export_id': row.export_id,
                'status': row.status,
                'document_count': row.document_count,
                'size_bytes': row.size_bytes,
                'error': row.error,
                'created_time': row.created_time,
            }
            for row in rows
        ]

    @staticmethod
    async def run_export(export_id: str, plugin_namespace: str | None = None) -> dict[str, Any]:
        """执行导出（Celery 任务体调它；分段事务，长耗时段不占连接）。"""
        ns = instance_namespace(plugin_namespace)
        # ---- 事务 1：读取元数据并置 running ----
        async with async_db_session.begin() as db:
            row = await export_dao.get(db, export_id, plugin_namespace=ns)
            if row is None:
                log.warning('导出任务不存在 export={}', export_id)
                return {'export_id': export_id, 'status': 'skipped'}
            if row.status == 'success':
                return {'export_id': export_id, 'status': 'success', 'skipped': True}
            kb_name = row.kb_name
            kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=ns)
            if kb is None:
                await export_dao.mark_status(db, export_id, 'failed', error='知识库不存在', plugin_namespace=ns)
                return {'export_id': export_id, 'status': 'failed', 'error': '知识库不存在'}
            kb_meta = {
                'kb_name': kb.kb_name,
                'display_name': kb.display_name,
                'description': kb.description,
                'embedding_model': kb.embedding_model,
                'routing_mode': kb.routing_mode,
                'query_params': kb.query_params or {},
                'owner_id': kb.owner_id,
                'is_public': kb.is_public,
                'plugin_namespace': kb.plugin_namespace,
            }
            docs = await document_dao.select_models_scoped(db, kb_name=kb_name, plugin_namespace=ns)
            acl_rows = await doc_acl_dao.list_entries_by_kb(db, kb_name=kb_name, plugin_namespace=ns)
            await export_dao.mark_status(db, export_id, 'running', plugin_namespace=ns)

        acl_by_doc: dict[str, list[dict[str, str]]] = {}
        for entry in acl_rows:
            acl_by_doc.setdefault(entry.document_id, []).append({
                'principal_type': entry.principal_type,
                'principal_id': entry.principal_id,
            })

        entries: list[ExportEntry] = []
        doc_metas: list[dict[str, Any]] = []
        for doc in docs:
            per_doc_acl = acl_by_doc.get(doc.document_id, [])
            doc_metas.append({
                'document_id': doc.document_id,
                'name': doc.name,
                'status': doc.status,
                'sha256': doc.sha256,
                'chunk_count': doc.chunk_count,
                'pipeline': doc.pipeline,
                'source_type': doc.source_type,
                'visibility': doc.visibility,
                'owner_id': doc.owner_id,
                'folder_id': doc.folder_id,
                'created_time': _iso(doc.created_time),
                'updated_time': _iso(doc.updated_time),
                'acl': per_doc_acl,
            })
            if doc.source_uri:
                entries.append(
                    ExportEntry(
                        arcname=f'documents/{doc.document_id}/{_safe_name(doc.name)}',
                        loader=_object_loader(doc.source_uri),
                    )
                )
            entries.append(
                ExportEntry(
                    arcname=f'parsed/{doc.document_id}.md',
                    loader=_object_loader(kb_parsed_object_key(ns, kb_name, doc.document_id)),
                )
            )

        manifest = build_manifest(
            kb=kb_meta,
            documents=doc_metas,
            export_id=export_id,
            exported_at=datetime.now(UTC).isoformat(),
        )
        entries.insert(
            0,
            ExportEntry(
                arcname=MANIFEST_NAME,
                loader=_bytes_loader(json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8')),
            ),
        )

        max_bytes = int(settings.RAGF_EXPORT_MAX_BYTES)
        workdir = Path(await asyncio.to_thread(mkdtemp, prefix='kb-export-'))
        target = workdir / f'{export_id}.zip'
        try:
            written, size = await write_zip(entries, target=target, max_bytes=max_bytes)
            payload = await asyncio.to_thread(_read_bytes, target)
            object_key = f'kb/{ns}/{kb_name}/exports/{export_id}.zip'
            await upload_document_bytes(object_key, payload, content_type='application/zip')
        except ExportTooLargeError as exc:
            await _mark_failed(ns, export_id, str(exc))
            return {'export_id': export_id, 'status': 'failed', 'error': str(exc)}
        except Exception as exc:
            log.warning('导出打包失败 export={}: {}', export_id, exc)
            await _mark_failed(ns, export_id, f'导出失败: {exc}')
            return {'export_id': export_id, 'status': 'failed', 'error': str(exc)}
        finally:
            await asyncio.to_thread(_cleanup, workdir)

        async with async_db_session.begin() as db:
            await export_dao.mark_status(
                db,
                export_id,
                'success',
                object_key=object_key,
                document_count=len(doc_metas),
                size_bytes=size,
                plugin_namespace=ns,
            )
        log.info('导出完成 kb={} export={} docs={} bytes={}', kb_name, export_id, len(doc_metas), size)
        return {
            'export_id': export_id,
            'status': 'success',
            'document_count': len(doc_metas),
            'size_bytes': size,
            'entries': written,
        }


def _iso(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


def _safe_name(name: str) -> str:
    """文件名净化：去路径分隔符，防 zip-slip（写侧也要防，读侧才敢信）。"""
    cleaned = str(name or 'file').replace('\\', '_').replace('/', '_').strip()
    return cleaned or 'file'


def _resolve(value: LoaderResult) -> LoaderResult:
    """同步 loader 的返回值原样透出（`write_zip` 侧统一判 awaitable）。"""
    return value


def _read_bytes(path: Path) -> bytes:
    return path.read_bytes()


def _bytes_loader(payload: bytes) -> Callable[[], LoaderResult]:
    """已在内存的条目（如 manifest）：同步返回即可，`write_zip` 两者都接。"""

    def _load() -> LoaderResult:
        return payload

    return _load


def _object_loader(object_key: str) -> Callable[[], LoaderResult]:
    """对象读取器：对象不存在时返回 None 由 `write_zip` 跳过，不让单个缺失对象断掉整次导出。"""

    async def _load() -> bytes | None:
        try:
            return await download_document_bytes(object_key)
        except Exception as exc:
            log.warning('导出读取对象失败 key={}: {}', object_key, exc)
            return None

    return _load


def _cleanup(workdir: Path) -> None:
    import shutil

    shutil.rmtree(workdir, ignore_errors=True)


async def _mark_failed(ns: str, export_id: str, error: str) -> None:
    try:
        async with async_db_session.begin() as db:
            await export_dao.mark_status(db, export_id, 'failed', error=error[:1000], plugin_namespace=ns)
    except Exception as exc:  # pragma: no cover - 环境相关
        log.error('导出失败态落库失败 export={}: {}', export_id, exc)


export_service = ExportService()
