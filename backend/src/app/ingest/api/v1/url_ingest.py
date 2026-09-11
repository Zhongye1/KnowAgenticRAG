"""URL 摄取 API（双管线摄取 spec D10：SSRF 防护 + 出网白名单 + 直链下载）。"""

import asyncio

from mimetypes import guess_extension
from pathlib import Path as FilePath
from pathlib import PurePosixPath
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from starlette.authentication import UnauthenticatedUser

from backend.src.app.ingest.limits import IngestLimitError, validate_ingest_bytes
from backend.src.app.ingest.schema.ingest import IngestResultItem
from backend.src.app.ingest.schema.url_ingest import UrlIngestRequest
from backend.src.app.ingest.url_validator import (
    UrlValidationError,
    assert_egress_allowlist,
    assert_not_ssrf_target,
    download_url_capped,
    validate_url_format,
)
from backend.src.app.kb.crud import dedup_dao, knowledge_base_dao
from backend.src.app.kb.crud.crud_dedup import compute_sha256_bytes
from backend.src.app.kb.deps import CurrentNamespace
from backend.src.app.kb.service.document_service import document_service
from backend.src.app.kb.utils.permissions import RAG_KB_INGEST
from backend.src.common.exception import errors
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.core.config import settings
from backend.src.database.db import CurrentSessionTransaction

router = APIRouter(dependencies=[DependsJwtAuth])

_PERM_INGEST = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_INGEST)), DependsRBAC]

# content-type → 扩展名（URL 无扩展名时的推导；仅接受已知文档类型）
_CT_EXT = {
    'application/pdf': '.pdf',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'text/plain': '.txt',
    'text/csv': '.csv',
}


def _derive_filename(url: str, content_type: str) -> str:
    """由 URL 路径 + content-type 推导文件名（无扩展名时用 content-type 补）。"""
    name = (PurePosixPath(url).name or 'document').split('?')[0]
    if '.' in name:
        return name
    ct = content_type.split(';')[0].strip().lower()
    ext = _CT_EXT.get(ct) or guess_extension(ct) or '.bin'
    return f'{name or "document"}{ext}'


def _raise_422(exc: UrlValidationError | IngestLimitError) -> None:
    """结构化 422（code/reason/suggestion，与文件上传限额同构）。"""
    raise HTTPException(status_code=422, detail=exc.to_detail()) from exc


@router.post(
    '/{kb_name}/documents/ingest/url',
    summary='URL 摄取（spec D10：SSRF 防护/出网白名单/限额；仅文件直链）',
    dependencies=_PERM_INGEST,
)
async def ingest_document_from_url(
    request: Request,
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识', pattern=r'^[a-z0-9_]+$')],
    body: UrlIngestRequest,
) -> ResponseSchemaModel[IngestResultItem]:
    if not settings.RAGF_URL_INGEST_ENABLED:
        raise errors.ForbiddenError(msg='URL 摄取未开启（RAGF_URL_INGEST_ENABLED）')
    kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=current_namespace)
    if kb is None:
        raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')

    url = body.url.strip()
    # ① 格式 → ② SSRF → ③ 出网白名单（spec D10 前三步；下载内复检最终 URL）
    try:
        validate_url_format(url)
        assert_not_ssrf_target(url)
        assert_egress_allowlist(url)
        # ④ 限额内流式下载（最终 URL 复检 SSRF；TLS 失败按配置降级）
        path, content_type, _size = download_url_capped(
            url,
            max_bytes=settings.RAGF_INGEST_MAX_FILE_BYTES,
            timeout=settings.RAGF_URL_TIMEOUT_SECONDS,
            max_redirects=settings.RAGF_URL_MAX_REDIRECTS,
        )
    except UrlValidationError as exc:
        _raise_422(exc)
    except IngestLimitError as exc:
        _raise_422(exc)

    file_path = FilePath(path)
    try:
        data = await asyncio.to_thread(file_path.read_bytes)
    finally:
        await asyncio.to_thread(file_path.unlink, missing_ok=True)

    filename = _derive_filename(url, content_type)
    try:
        validate_ingest_bytes(data, filename)
    except IngestLimitError as exc:
        _raise_422(exc)

    # 去重预检（spec D9：登记在管线成功后，此处仅 409 提示）
    sha256 = compute_sha256_bytes(data)
    existing = await dedup_dao.get_by_sha256(db, sha256, kb_name=kb_name, plugin_namespace=current_namespace)
    if existing is not None and not body.force:
        raise errors.ConflictError(msg='该文件已存在于知识库中（需强制重摄取请带 force=true）')

    owner_id = None if isinstance(request.user, UnauthenticatedUser) else str(request.user.id)
    owner_dept_id = None if isinstance(request.user, UnauthenticatedUser) else request.user.dept_id

    doc = await document_service.upload_bytes(
        db,
        kb_name=kb_name,
        name=filename,
        data=data,
        content_type=content_type or 'application/octet-stream',
        source_type='url',
        owner_id=owner_id,
        owner_dept_id=owner_dept_id,
    )

    from backend.src.app.task.celery import celery_app

    celery_app.send_task(
        'ingest.process_document',
        kwargs={
            'document_id': doc.document_id,
            'kb_name': doc.kb_name,
            'plugin_namespace': doc.plugin_namespace,
        },
    )
    return response_base.success(
        data=IngestResultItem(
            document_id=doc.document_id,
            kb_name=doc.kb_name,
            name=doc.name,
            sha256=sha256,
            status=doc.status,
            queued=True,
        )
    )
