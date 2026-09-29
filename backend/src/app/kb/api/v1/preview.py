"""文档预览 API（kb-落地改造清单 Phase 3 / D55）。

两个端点：

- ``GET /documents/{id}/preview``：预览描述（按 ``kind`` 分流），Office 首次访问时
  **惰性触发**转换并入队，返回 ``status=converting`` 供前端退避轮询（D55.2）；
- ``GET|HEAD /documents/{id}/preview/content``：**服务端 Range 代理**（D55.1）——
  PDF 不走预签名直连，因为预签名 URL 签发后即绕过 ACL，而 PDF.js 一次浏览会发几十次
  Range 请求、URL 过期即中途 403 断流，且无法表达「转换未完成」这类业务态。
  代价是字节过服务端，但 PDF.js **只取所需窗口、不拉全量**。

ACL 与文档接口同源（``_require_kb_perm``）：未达阈值与不存在同形态 404（D50）。
"""

import asyncio

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Path, Query, Response
from starlette.responses import StreamingResponse

from backend.src.app.kb.crud import document_dao
from backend.src.app.kb.deps import CurrentKbUser, CurrentNamespace
from backend.src.app.kb.schema.preview import PreviewItem
from backend.src.app.kb.service.acl.resolver import Perm, perm_at_least, resolve_kb_perm
from backend.src.app.kb.service.document_storage import open_kb_object_range, stat_kb_object
from backend.src.app.kb.service.preview_service import preview_service
from backend.src.app.kb.utils.http_range import RangeNotSatisfiableError, parse_single_range
from backend.src.app.kb.utils.permissions import RAG_KB_READ
from backend.src.app.task.celery import celery_app
from backend.src.common.exception import errors
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.core.config import settings

# 运行期导入（不能用 TYPE_CHECKING 包起来）：FastAPI 在生成 OpenAPI 与解析依赖时
# 需要按名字取到这些别名，放进 TYPE_CHECKING 会变成无法解析的 ForwardRef。
from backend.src.database.db import CurrentSession, CurrentSessionTransaction

_PERM_READ = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_READ)), DependsRBAC]

router = APIRouter()

_DOCUMENT_ID = Annotated[str, Path(description='文档 ID')]
_STREAM_CHUNK = 64 * 1024
_PDF_MEDIA_TYPE = 'application/pdf'
_MARKDOWN_MEDIA_TYPE = 'text/markdown; charset=utf-8'


@dataclass(frozen=True)
class _StreamPlan:
    """一次内容请求的完整参数（ACL 已过、Range 已解析）。"""

    object_key: str
    degraded: bool
    size: int
    start: int
    end: int
    partial: bool
    etag: str

    @property
    def length(self) -> int:
        return self.end - self.start + 1 if self.partial else self.size

    @property
    def media_type(self) -> str:
        return _MARKDOWN_MEDIA_TYPE if self.degraded else _PDF_MEDIA_TYPE


async def _require_kb_perm(db: CurrentSession, kb_name: str, user: CurrentKbUser, threshold: Perm) -> None:
    """资源级权限断言：未达阈值与文档不存在同形态 404（不泄露存在性，D50）。"""
    perm = await resolve_kb_perm(db, user_id=user.user_id, dept_id=user.dept_id, roles=user.roles, kb_name=kb_name)
    if not perm_at_least(perm, threshold):
        raise errors.NotFoundError(msg='文档不存在')


@router.get('/{document_id}/preview', summary='文档预览描述（Office 首次访问触发转换）', dependencies=_PERM_READ)
async def get_document_preview(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    document_id: _DOCUMENT_ID,
    user: CurrentKbUser,
    offset: Annotated[int, Query(ge=0, description='内联文本窗口起始字节偏移（续读用）')] = 0,
) -> ResponseSchemaModel[PreviewItem]:
    doc = await document_dao.get(db, document_id)
    if doc is None:
        raise errors.NotFoundError(msg='文档不存在')
    await _require_kb_perm(db, doc.kb_name, user, Perm.READ)
    data = await preview_service.describe(db=db, doc=doc, offset=offset)
    if (
        data['status'] == 'converting'
        and settings.RAGF_PREVIEW_ENABLED
        and await preview_service.claim_conversion(db=db, doc=doc)
    ):
        celery_app.send_task('kb.preview_convert', args=[document_id])
    return response_base.success(data=PreviewItem.model_validate(data))


def _content_headers(plan: _StreamPlan) -> dict[str, str]:
    """组装 Range 响应头（GET 与 HEAD 共用，保证两者语义一致）。"""
    headers = {
        'Accept-Ranges': 'bytes',
        'Content-Type': plan.media_type,
        'Content-Length': str(plan.length),
        'Cache-Control': 'private, max-age=3600',
    }
    if plan.etag:
        headers['ETag'] = f'"{plan.etag}"'
    if plan.partial:
        headers['Content-Range'] = f'bytes {plan.start}-{plan.end}/{plan.size}'
    return headers


async def _iter_object(object_key: str, start: int, length: int) -> AsyncIterator[bytes]:
    """流式转发对象区间；不整段读入内存（大 PDF 按需分页的关键）。"""
    response = await asyncio.to_thread(open_kb_object_range, object_key, start, length)
    try:
        while True:
            chunk = await asyncio.to_thread(response.read, _STREAM_CHUNK)
            if not chunk:
                break
            yield chunk
    finally:
        await asyncio.to_thread(_close_quietly, response)


def _close_quietly(response: Any) -> None:
    try:
        response.close()
    finally:
        response.release_conn()


async def _resolve_stream(
    *,
    db: CurrentSession,
    document_id: str,
    user: CurrentKbUser,
    range_header: str | None,
) -> _StreamPlan:
    """公共前置：ACL → 定位对象 → 解析 Range。

    416 用 `RangeNotSatisfiableError` 向上抛（带 size），由端点转成带
    ``Content-Range: bytes */size`` 的 416。
    """
    doc = await document_dao.get(db, document_id)
    if doc is None:
        raise errors.NotFoundError(msg='文档不存在')
    await _require_kb_perm(db, doc.kb_name, user, Perm.READ)
    object_key, degraded = await preview_service.resolve_content_object(db=db, doc=doc)
    if not object_key:
        raise errors.NotFoundError(msg='文档没有可预览的内容')
    try:
        size, etag = await asyncio.to_thread(stat_kb_object, object_key)
    except Exception as exc:
        raise errors.NotFoundError(msg='预览内容不存在') from exc
    if size <= 0:
        return _StreamPlan(object_key, degraded, 0, 0, 0, False, etag)
    window = parse_single_range(range_header, size)
    if window is None:
        return _StreamPlan(object_key, degraded, size, 0, size - 1, False, etag)
    start, end = window
    # 单次窗口上限：防 `bytes=0-` 一次性拖全量（客户端会继续要下一段）
    cap = int(settings.RAGF_PREVIEW_MAX_RANGE_BYTES)
    if end - start + 1 > cap:
        end = start + cap - 1
    return _StreamPlan(object_key, degraded, size, start, end, True, etag)


def _unsatisfiable(size: int) -> Response:
    """416：语法合法但区间不可满足（RFC 7233 要求带 ``bytes */size``）。"""
    return Response(
        status_code=416,
        headers={'Accept-Ranges': 'bytes', 'Content-Range': f'bytes */{size}'},
    )


@router.get(
    '/{document_id}/preview/content',
    summary='预览内容（Range 代理，支持任意 offset）',
    dependencies=_PERM_READ,
)
async def get_document_preview_content(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    document_id: _DOCUMENT_ID,
    user: CurrentKbUser,
    range_header: Annotated[str | None, Header(alias='Range')] = None,
) -> Response:
    try:
        plan = await _resolve_stream(db=db, document_id=document_id, user=user, range_header=range_header)
    except RangeNotSatisfiableError:
        size, _etag = await _safe_size(db=db, document_id=document_id)
        return _unsatisfiable(size)
    if plan.size == 0:
        return Response(status_code=200, headers={'Accept-Ranges': 'bytes', 'Content-Length': '0'})
    return StreamingResponse(
        _iter_object(plan.object_key, plan.start, plan.length),
        status_code=206 if plan.partial else 200,
        headers=_content_headers(plan),
        media_type=plan.media_type,
    )


@router.head(
    '/{document_id}/preview/content',
    summary='预览内容探测（PDF.js 会先探 HEAD）',
    dependencies=_PERM_READ,
    include_in_schema=False,
)
async def head_document_preview_content(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    document_id: _DOCUMENT_ID,
    user: CurrentKbUser,
    range_header: Annotated[str | None, Header(alias='Range')] = None,
) -> Response:
    try:
        plan = await _resolve_stream(db=db, document_id=document_id, user=user, range_header=range_header)
    except RangeNotSatisfiableError:
        size, _etag = await _safe_size(db=db, document_id=document_id)
        return _unsatisfiable(size)
    return Response(
        status_code=206 if plan.partial else 200,
        headers=_content_headers(plan),
        media_type=plan.media_type,
    )


async def _safe_size(*, db: CurrentSession, document_id: str) -> tuple[int, str]:
    """416 响应要带总长度；此处失败就退化为 0（响应仍是 416，语义不丢）。"""
    doc = await document_dao.get(db, document_id)
    if doc is None:
        return 0, ''
    object_key, _degraded = await preview_service.resolve_content_object(db=db, doc=doc)
    if not object_key:
        return 0, ''
    try:
        return await asyncio.to_thread(stat_kb_object, object_key)
    except Exception:
        return 0, ''
