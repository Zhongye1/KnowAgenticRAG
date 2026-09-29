"""知识库导出任务 CRUD。"""

from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud.base import result_rowcount
from backend.src.app.kb.model import KbExport
from backend.src.app.kb.utils.namespace import instance_namespace

__all__ = ['export_dao']


class CRUDKbExport:
    """导出任务数据库操作。"""

    async def get(
        self,
        db: AsyncSession,
        export_id: str,
        *,
        plugin_namespace: str | None = None,
    ) -> KbExport | None:
        ns = instance_namespace(plugin_namespace)
        stmt = select(KbExport).where(KbExport.export_id == export_id, KbExport.plugin_namespace == ns)
        return (await db.execute(stmt)).scalars().first()

    async def create(
        self,
        db: AsyncSession,
        *,
        export_id: str,
        kb_name: str,
        created_by: str | None,
        plugin_namespace: str | None = None,
    ) -> KbExport:
        obj = KbExport(
            export_id=export_id,
            kb_name=kb_name,
            plugin_namespace=instance_namespace(plugin_namespace),
            status='pending',
            created_by=created_by,
        )
        db.add(obj)
        await db.flush()
        return obj

    async def mark_status(
        self,
        db: AsyncSession,
        export_id: str,
        status: str,
        *,
        object_key: str | None = None,
        document_count: int | None = None,
        size_bytes: int | None = None,
        error: str | None = None,
        plugin_namespace: str | None = None,
    ) -> int:
        """推进导出状态（只更新传入字段）。"""
        ns = instance_namespace(plugin_namespace)
        values: dict[str, Any] = {'status': status}
        if object_key is not None:
            values['object_key'] = object_key
        if document_count is not None:
            values['document_count'] = document_count
        if size_bytes is not None:
            values['size_bytes'] = size_bytes
        if error is not None:
            values['error'] = error
        result = await db.execute(
            update(KbExport).where(KbExport.export_id == export_id, KbExport.plugin_namespace == ns).values(**values)
        )
        await db.flush()
        return result_rowcount(result)

    async def list_by_kb(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        limit: int = 20,
        plugin_namespace: str | None = None,
    ) -> list[KbExport]:
        """列出该库最近导出（倒序），供前端展示历史与复用产物。"""
        ns = instance_namespace(plugin_namespace)
        stmt = (
            select(KbExport)
            .where(KbExport.kb_name == kb_name, KbExport.plugin_namespace == ns)
            .order_by(KbExport.created_time.desc())
            .limit(limit)
        )
        return list((await db.execute(stmt)).scalars().all())

    async def delete_by_kb(self, db: AsyncSession, kb_name: str, *, plugin_namespace: str | None = None) -> int:
        """按知识库删除导出行（级联删除知识库时调用）。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(delete(KbExport).where(KbExport.kb_name == kb_name, KbExport.plugin_namespace == ns))
        await db.flush()
        return result_rowcount(result)


export_dao = CRUDKbExport()
