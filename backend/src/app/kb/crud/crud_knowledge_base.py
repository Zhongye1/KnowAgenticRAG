"""知识库注册表 CRUD。"""

from sqlalchemy import Select, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud.base import TenantScopedCrud, result_rowcount
from backend.src.app.kb.model import KnowledgeBase
from backend.src.app.kb.schema.knowledge_base import KBCreateParam, KBUpdateParam
from backend.src.app.kb.service.namespace import instance_namespace


class CRUDKnowledgeBase(TenantScopedCrud[KnowledgeBase]):
    """知识库注册表数据库操作。"""

    async def get(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
    ) -> KnowledgeBase | None:
        """按复合主键查询知识库。"""
        return await self.select_scoped(db, kb_name=kb_name, plugin_namespace=plugin_namespace)

    async def get_select(
        self,
        *,
        plugin_namespace: str | None = None,
        query: str | None = None,
        sort: str = 'recent',
    ) -> Select:
        """构造列表查询（供分页器使用）。"""
        ns = instance_namespace(plugin_namespace)
        stmt: Select = select(KnowledgeBase).where(KnowledgeBase.plugin_namespace == ns)
        if query:
            stmt = stmt.where(
                or_(
                    KnowledgeBase.kb_name.ilike(f'%{query}%'),
                    KnowledgeBase.display_name.ilike(f'%{query}%'),
                )
            )
        if sort == 'name':
            stmt = stmt.order_by(KnowledgeBase.display_name.asc())
        else:
            stmt = stmt.order_by(KnowledgeBase.created_time.desc())
        return stmt

    async def create(
        self,
        db: AsyncSession,
        obj: KBCreateParam,
        *,
        plugin_namespace: str | None = None,
    ) -> KnowledgeBase:
        """创建知识库注册行。"""
        ns = instance_namespace(plugin_namespace)
        kb = KnowledgeBase(
            kb_name=obj.kb_name,
            plugin_namespace=ns,
            display_name=obj.display_name,
            description=obj.description,
            theme=obj.theme,
            icon=obj.icon,
            pdf_text_page_ratio=obj.pdf_text_page_ratio,
        )
        db.add(kb)
        await db.flush()
        return kb

    async def update(
        self,
        db: AsyncSession,
        kb_name: str,
        obj: KBUpdateParam,
        *,
        plugin_namespace: str | None = None,
    ) -> KnowledgeBase | None:
        """部分更新知识库，返回更新后的记录。"""
        kb = await self.get(db, kb_name, plugin_namespace=plugin_namespace)
        if kb is None:
            return None
        values = obj.model_dump(exclude_unset=True)
        for field, value in values.items():
            setattr(kb, field, value)
        await db.flush()
        return kb

    async def delete(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
    ) -> bool:
        """删除知识库注册行。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(
            delete(KnowledgeBase).where(
                KnowledgeBase.kb_name == kb_name,
                KnowledgeBase.plugin_namespace == ns,
            )
        )
        await db.flush()
        return result_rowcount(result) > 0

    async def count(self, db: AsyncSession, *, plugin_namespace: str | None = None) -> int:
        """统计域内知识库数量。"""
        return await self.count_scoped(db, plugin_namespace=plugin_namespace)

    async def list_all(self, db: AsyncSession, *, plugin_namespace: str | None = None) -> list[KnowledgeBase]:
        """列出域内全部知识库。"""
        return await self.select_models_scoped(db, plugin_namespace=plugin_namespace)

    async def merge_collections(
        self,
        db: AsyncSession,
        kb_name: str,
        collections: list[str],
        *,
        plugin_namespace: str | None = None,
    ) -> None:
        """合并集合目录（摄取层写入后调用）。"""
        kb = await self.get(db, kb_name, plugin_namespace=plugin_namespace)
        if kb is None:
            return
        merged = list(dict.fromkeys([*kb.collections_used, *collections]))
        kb.collections_used = merged
        await db.flush()


knowledge_base_dao = CRUDKnowledgeBase(KnowledgeBase)
