"""文档预览转换 CRUD（kb-落地改造清单 Phase 3 / D55）。

`claim_conversion` 是并发闸门：只有「无行 / 指纹变了 / 上次失败」三种情况返回
need_dispatch=True，其余（转换中、已就绪且指纹一致）复用现有行不重复派发，
避免 N 个并发预览请求起 N 个 LibreOffice 转换。
"""

from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud.base import result_rowcount
from backend.src.app.kb.model import DocumentPreview
from backend.src.app.kb.utils.namespace import instance_namespace

# 可复用的转换状态：进行中（等它跑完）与已就绪（内容未变可直接用）
_REUSABLE_STATUSES = frozenset({'converting', 'ready'})


def _reusable_row(row: DocumentPreview | None, source_sha256: str | None) -> DocumentPreview | None:
    """返回可复用的转换行；不可复用返回 None。

    独立成函数是为了**保住类型收窄**：用 `same_source and row.status in ...` 这种
    布尔中间变量会让 pyright 丢失 `row is not None` 的收窄。
    """
    if row is None:
        return None
    if row.source_sha256 == source_sha256 and row.status in _REUSABLE_STATUSES:
        return row
    return None


class CRUDDocumentPreview:
    """文档预览转换数据库操作。"""

    async def get(
        self,
        db: AsyncSession,
        document_id: str,
        *,
        plugin_namespace: str | None = None,
    ) -> DocumentPreview | None:
        """按文档查询预览行。"""
        ns = instance_namespace(plugin_namespace)
        stmt = select(DocumentPreview).where(
            DocumentPreview.document_id == document_id, DocumentPreview.plugin_namespace == ns
        )
        return (await db.execute(stmt)).scalars().first()

    async def claim_conversion(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        kb_name: str,
        source_sha256: str | None,
        plugin_namespace: str | None = None,
    ) -> tuple[DocumentPreview, bool]:
        """领取转换权；返回 (行, 是否需要派发转换任务)。

        复用条件（need_dispatch=False）：已有行且 `source_sha256` 一致，且状态为
        `converting`（进行中）或 `ready`（已就绪）。指纹不一致（文件被替换）或
        上次 `failed`（可重试）时重新领取。
        """
        ns = instance_namespace(plugin_namespace)
        existing = await self.get(db, document_id, plugin_namespace=ns)
        reusable = _reusable_row(existing, source_sha256)
        if reusable is not None:
            return reusable, False
        if existing is not None:
            existing.kb_name = kb_name
            existing.status = 'converting'
            existing.source_sha256 = source_sha256
            existing.error = None
            existing.object_key = None
            existing.page_count = 0
            await db.flush()
            return existing, True
        obj = DocumentPreview(
            document_id=document_id,
            kb_name=kb_name,
            plugin_namespace=ns,
            status='converting',
            source_sha256=source_sha256,
        )
        db.add(obj)
        await db.flush()
        return obj, True

    async def mark_status(
        self,
        db: AsyncSession,
        document_id: str,
        status: str,
        *,
        object_key: str | None = None,
        page_count: int | None = None,
        error: str | None = None,
        plugin_namespace: str | None = None,
    ) -> int:
        """推进转换状态（只更新传入字段）。"""
        ns = instance_namespace(plugin_namespace)
        values: dict[str, Any] = {'status': status}
        if object_key is not None:
            values['object_key'] = object_key
        if page_count is not None:
            values['page_count'] = page_count
        if error is not None:
            values['error'] = error
        result = await db.execute(
            update(DocumentPreview)
            .where(DocumentPreview.document_id == document_id, DocumentPreview.plugin_namespace == ns)
            .values(**values)
        )
        await db.flush()
        return result_rowcount(result)

    async def delete_by_document(
        self,
        db: AsyncSession,
        document_id: str,
        *,
        plugin_namespace: str | None = None,
    ) -> int:
        """按文档删除预览行（级联删除文档时调用）。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(
            delete(DocumentPreview).where(
                DocumentPreview.document_id == document_id, DocumentPreview.plugin_namespace == ns
            )
        )
        await db.flush()
        return result_rowcount(result)


document_preview_dao = CRUDDocumentPreview()
