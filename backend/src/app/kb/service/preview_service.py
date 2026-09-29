"""预览编排服务（kb-落地改造清单 Phase 3 / D55）。

三件事：

1. **分级路由**（D55 §3A）：按 `documents.preview_kind`（服务端按扩展名判定并持久化）
   决定怎么把内容交给前端——Markdown/文本内联窗口、图片预签名、PDF 走 Range 代理。
2. **异步转换领取**（D55 §3B）：Office 文档首次预览时经 `document_preview_dao.claim_conversion`
   领取转换权并入队；并发请求不会起 N 个转换。
3. **降级梯**（D55.3）：转换失败/不可用时退到已入库的 `__parsed__.md` 渲染，
   响应带 `degraded` 与 `fallback_reason`，与项目既有的分层失败语义一致。

`document.preview_kind` 为空或不在合法集合时按文件名**兜底重算**（历史数据没有该列
的值），保证老文档也能预览。
"""

from __future__ import annotations

import asyncio

from typing import TYPE_CHECKING, Any

from backend.src.app.kb.crud import document_preview_dao
from backend.src.app.kb.service.document_storage import (
    download_document_bytes,
    get_document_url,
    kb_parsed_object_key,
    kb_preview_object_key,
    stat_kb_object,
)
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.app.kb.utils.preview_kinds import (
    MAX_INLINE_TEXT_BYTES,
    PREVIEW_KINDS,
    resolve_preview_kind,
)
from backend.src.common.log import log

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from backend.src.app.kb.model import Document

__all__ = ['PreviewDescriptor', 'preview_service']

# 预览描述：直接作为响应 data 的普通字典（无需为它造类型）
PreviewDescriptor = dict[str, Any]

# 转换产物状态取值
STATUS_CONVERTING = 'converting'
STATUS_READY = 'ready'
STATUS_FAILED = 'failed'


class PreviewService:
    """文档预览业务逻辑。"""

    # ---------------- 路由 ----------------

    @staticmethod
    def resolve_kind(doc: Document) -> str:
        """取生效预览类别：持久化值优先，非法/为空则按文件名重算（历史数据兜底）。"""
        stored = (doc.preview_kind or '').strip()
        if stored in PREVIEW_KINDS:
            return stored
        return resolve_preview_kind(doc.name or '')

    # ---------------- 描述组装 ----------------

    @staticmethod
    async def describe(
        *,
        db: AsyncSession,
        doc: Document,
        offset: int = 0,
    ) -> PreviewDescriptor:
        """组装预览描述；Office 未就绪时返回 converting 并**由调用方决定是否入队**。"""
        kind = PreviewService.resolve_kind(doc)
        base = PreviewDescriptor(
            document_id=doc.document_id,
            name=doc.name,
            kind=kind,
            status='ready',
            content_url=None,
            url=None,
            content=None,
            offset=offset,
            next_offset=None,
            total_bytes=None,
            page_count=None,
            degraded=False,
            fallback_reason=None,
        )
        if kind == 'unsupported':
            base['status'] = 'unsupported'
            return base
        if kind == 'image':
            return await PreviewService._describe_image(base=base, doc=doc)
        if kind in {'markdown', 'text'}:
            return await PreviewService._describe_text(base=base, doc=doc, offset=offset)
        if kind == 'pdf':
            return await PreviewService._describe_pdf(base=base, doc=doc)
        return await PreviewService._describe_office(db=db, base=base, doc=doc)

    @staticmethod
    async def _describe_image(*, base: PreviewDescriptor, doc: Document) -> PreviewDescriptor:
        """图片：预签名 URL 直连（单次、小、`<img>` 直接用，不值得代理）。"""
        if doc.source_uri:
            base['url'] = await asyncio.to_thread(get_document_url, doc.source_uri)
        else:
            base['status'] = 'unsupported'
        return base

    @staticmethod
    async def _describe_text(*, base: PreviewDescriptor, doc: Document, offset: int) -> PreviewDescriptor:
        """Markdown / 文本：内联窗口 + 续读游标（按字节算，直接映射对象 Range）。"""
        if not doc.source_uri:
            base['status'] = 'unsupported'
            return base
        return await PreviewService._apply_text_window(base, doc.source_uri, offset)

    @staticmethod
    async def _apply_text_window(
        base: PreviewDescriptor,
        object_key: str,
        offset: int,
        *,
        degraded: bool = False,
        fallback_reason: str | None = None,
    ) -> PreviewDescriptor:
        """读对象的一个字节窗口并解码；返回 next_offset 供续读。"""
        try:
            size, _etag = await asyncio.to_thread(stat_kb_object, object_key)
        except Exception as exc:
            base['status'] = 'unsupported'
            base['fallback_reason'] = f'对象不可读: {exc}'
            return base
        safe_offset = max(0, min(offset, size))
        length = min(MAX_INLINE_TEXT_BYTES, max(0, size - safe_offset))
        data = await asyncio.to_thread(_read_range_sync, object_key, safe_offset, length)
        base['content'] = data.decode('utf-8', errors='replace')
        base['offset'] = safe_offset
        base['total_bytes'] = size
        base['next_offset'] = safe_offset + length if safe_offset + length < size else None
        base['degraded'] = degraded
        base['fallback_reason'] = fallback_reason
        return base

    @staticmethod
    async def _describe_pdf(*, base: PreviewDescriptor, doc: Document) -> PreviewDescriptor:
        """原生 PDF：直接走 Range 代理。"""
        if not doc.source_uri:
            base['status'] = 'unsupported'
            return base
        base['content_url'] = PreviewService.content_path(doc.document_id)
        try:
            size, _etag = await asyncio.to_thread(stat_kb_object, doc.source_uri)
            base['total_bytes'] = size
        except Exception as exc:
            log.warning('PDF 预览取 size 失败 doc={}: {}', doc.document_id, exc)
        return base

    @staticmethod
    async def _describe_office(*, db: AsyncSession, base: PreviewDescriptor, doc: Document) -> PreviewDescriptor:
        """Office：查转换状态；ready 走 Range 代理，failed/缺失走降级梯。"""
        row = await document_preview_dao.get(db, doc.document_id)
        if row is not None and row.status == STATUS_READY and row.object_key:
            base['content_url'] = PreviewService.content_path(doc.document_id)
            base['page_count'] = int(row.page_count or 0)
            try:
                size, _etag = await asyncio.to_thread(stat_kb_object, row.object_key)
                base['total_bytes'] = size
            except Exception as exc:
                log.warning('预览产物取 size 失败 doc={}: {}', doc.document_id, exc)
            return base
        if row is not None and row.status == STATUS_FAILED:
            # 降级梯第 2 级：退回已入库的 Knowhere 解析产物 Markdown
            return await PreviewService._degrade_to_parsed_markdown(base=base, doc=doc, reason=row.error)
        base['status'] = STATUS_CONVERTING
        return base

    @staticmethod
    async def _degrade_to_parsed_markdown(
        *,
        base: PreviewDescriptor,
        doc: Document,
        reason: str | None,
    ) -> PreviewDescriptor:
        """降级到 `__parsed__.md`（Knowhere 产物，本来就在 MinIO，零成本保底）。"""
        ns = instance_namespace(doc.plugin_namespace)
        parsed_key = kb_parsed_object_key(ns, doc.kb_name, doc.document_id)
        try:
            exists = await asyncio.to_thread(_object_exists, parsed_key)
        except Exception as exc:
            log.warning('探测解析产物失败 doc={}: {}', doc.document_id, exc)
            exists = False
        if not exists:
            # 降级梯第 3 级：无可渲染来源，仅下载
            base['status'] = STATUS_FAILED
            base['fallback_reason'] = reason or '转换失败且无解析产物'
            return base
        base['kind'] = 'markdown'
        base['status'] = STATUS_READY
        await PreviewService._apply_text_window(
            base,
            parsed_key,
            0,
            degraded=True,
            fallback_reason=reason or '转换失败，已降级为解析产物',
        )
        return base

    # ---------------- 转换领取 ----------------

    @staticmethod
    async def claim_conversion(*, db: AsyncSession, doc: Document) -> bool:
        """领取转换权；True 表示调用方应派发 `kb.preview_convert`。"""
        if PreviewService.resolve_kind(doc) != 'office':
            return False
        _row, need_dispatch = await document_preview_dao.claim_conversion(
            db,
            document_id=doc.document_id,
            kb_name=doc.kb_name,
            source_sha256=doc.sha256,
        )
        return need_dispatch

    # ---------------- 路径 ----------------

    @staticmethod
    def content_path(document_id: str) -> str:
        """Range 代理端点路径（相对 API v1 前缀；由 Schema 层拼前缀更稳，见 preview API）。"""
        return f'/documents/{document_id}/preview/content'

    @staticmethod
    async def resolve_content_object(*, db: AsyncSession, doc: Document) -> tuple[str | None, bool]:
        """Range 代理要读哪个对象：返回 (object_key, degraded)。

        Office 且转换就绪 → 产物 PDF；原生 PDF → 源对象；转换失败 → 降级到解析产物
        （此时 `degraded=True`，代理以 `text/markdown` 返回而非 PDF）。
        """
        kind = PreviewService.resolve_kind(doc)
        if kind == 'pdf':
            return doc.source_uri, False
        if kind == 'office':
            row = await document_preview_dao.get(db, doc.document_id)
            if row is not None and row.status == STATUS_READY and row.object_key:
                return row.object_key, False
            ns = instance_namespace(doc.plugin_namespace)
            return kb_parsed_object_key(ns, doc.kb_name, doc.document_id), True
        return None, False

    @staticmethod
    async def preview_object_key_for(*, doc: Document) -> str:
        """本文件的预览产物对象键（转换任务写这里）。"""
        ns = instance_namespace(doc.plugin_namespace)
        return kb_preview_object_key(ns, doc.kb_name, doc.document_id)

    @staticmethod
    async def source_bytes(*, doc: Document) -> bytes:
        """读取源文件字节（转换任务用；受摄取限额约束，量级可控）。"""
        if not doc.source_uri:
            return b''
        return await download_document_bytes(doc.source_uri)


preview_service = PreviewService()


# ---------------------------------------------------------------------------
# 同步小工具（放线程池调用；不在事件循环里做阻塞 IO）
# ---------------------------------------------------------------------------


def _read_range_sync(object_key: str, offset: int, length: int) -> bytes:
    from backend.src.app.kb.service.document_storage import open_kb_object_range

    response = open_kb_object_range(object_key, offset=offset, length=length)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def _object_exists(object_key: str) -> bool:
    from backend.src.app.kb.service.document_storage import stat_kb_object

    try:
        stat_kb_object(object_key)
    except Exception:
        return False
    return True
