"""知识库文件夹 CRUD（kb-落地改造清单 D51）。

树形结构只做两层操作：**全量取本库文件夹**（一次查询，树在服务层内存组装）与
**按父级取直接子级**（提升/环检测用）。不做递归 CTE——单个知识库的文件夹数量
是组织维度的量级（百级），一次取全量比递归查询更简单也更快。
"""

from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud.base import TenantScopedCrud, result_rowcount
from backend.src.app.kb.model import KbFolder
from backend.src.app.kb.utils.namespace import instance_namespace


class CRUDFolder(TenantScopedCrud[KbFolder]):
    """知识库文件夹数据库操作。"""

    async def list_by_kb(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
    ) -> list[KbFolder]:
        """取本库全部文件夹（服务层据此组装树/判定环）。"""
        ns = instance_namespace(plugin_namespace)
        stmt = (
            select(KbFolder)
            .where(KbFolder.plugin_namespace == ns, KbFolder.kb_name == kb_name)
            .order_by(KbFolder.sort_order.asc(), KbFolder.name.asc())
        )
        return list((await db.execute(stmt)).scalars().all())

    async def list_children(
        self,
        db: AsyncSession,
        parent_id: str | None,
        *,
        kb_name: str,
        plugin_namespace: str | None = None,
    ) -> list[KbFolder]:
        """取直接子文件夹（``parent_id=None`` 取根级）。"""
        ns = instance_namespace(plugin_namespace)
        stmt = select(KbFolder).where(
            KbFolder.plugin_namespace == ns,
            KbFolder.kb_name == kb_name,
            KbFolder.parent_id.is_(None) if parent_id is None else KbFolder.parent_id == parent_id,
        )
        return list((await db.execute(stmt)).scalars().all())

    async def name_taken(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        parent_id: str | None,
        name: str,
        exclude_folder_id: str | None = None,
        plugin_namespace: str | None = None,
    ) -> bool:
        """同级重名判定（服务层据此抛 ConflictError）。

        不用 DB 唯一约束：Postgres 唯一索引中 NULL 互不相等，根级重名拦不住，
        需要额外的 partial index；服务层判定更简单且可测。
        """
        ns = instance_namespace(plugin_namespace)
        conditions = [
            KbFolder.plugin_namespace == ns,
            KbFolder.kb_name == kb_name,
            KbFolder.name == name,
            KbFolder.parent_id.is_(None) if parent_id is None else KbFolder.parent_id == parent_id,
        ]
        if exclude_folder_id is not None:
            conditions.append(KbFolder.folder_id != exclude_folder_id)
        stmt = select(func.count()).select_from(KbFolder).where(*conditions)
        return int((await db.scalar(stmt)) or 0) > 0

    async def create(
        self,
        db: AsyncSession,
        *,
        folder_id: str,
        kb_name: str,
        name: str,
        parent_id: str | None = None,
        sort_order: int = 0,
        plugin_namespace: str | None = None,
    ) -> KbFolder:
        """新建文件夹。"""
        obj = KbFolder(
            folder_id=folder_id,
            kb_name=kb_name,
            plugin_namespace=instance_namespace(plugin_namespace),
            name=name,
            parent_id=parent_id,
            sort_order=sort_order,
        )
        db.add(obj)
        await db.flush()
        return obj

    async def update_fields(
        self,
        db: AsyncSession,
        folder_id: str,
        values: dict[str, Any],
        *,
        plugin_namespace: str | None = None,
    ) -> int:
        """按显式字段字典更新（name / parent_id / sort_order）。

        用 ``values`` 而非 ``**fields``：一是类型安全（``**`` 展开会与 ``plugin_namespace``
        形参冲突），二是能明确表达「把 parent_id 置为 NULL」而不与「不改该列」混淆。
        """
        ns = instance_namespace(plugin_namespace)
        if not values:
            return 0
        result = await db.execute(
            update(KbFolder).where(KbFolder.folder_id == folder_id, KbFolder.plugin_namespace == ns).values(**values)
        )
        await db.flush()
        return result_rowcount(result)

    async def delete(self, db: AsyncSession, folder_id: str, *, plugin_namespace: str | None = None) -> int:
        """删除文件夹行（子项提升由服务层先行完成）。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(
            delete(KbFolder).where(KbFolder.folder_id == folder_id, KbFolder.plugin_namespace == ns)
        )
        await db.flush()
        return result_rowcount(result)

    async def delete_by_kb(self, db: AsyncSession, kb_name: str, *, plugin_namespace: str | None = None) -> int:
        """按知识库删除全部文件夹（级联删除知识库时调用）。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(delete(KbFolder).where(KbFolder.kb_name == kb_name, KbFolder.plugin_namespace == ns))
        await db.flush()
        return result_rowcount(result)


folder_dao = CRUDFolder(KbFolder)
