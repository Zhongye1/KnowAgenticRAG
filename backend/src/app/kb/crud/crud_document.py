"""文档元数据 CRUD（只读登记，不含摄取）。"""

from sqlalchemy import Select, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud.base import TenantScopedCrud, result_rowcount
from backend.src.app.kb.model import Document
from backend.src.app.kb.service.namespace import instance_namespace


class CRUDDocument(TenantScopedCrud[Document]):
    """文档元数据数据库操作。"""

    async def create(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        kb_name: str,
        name: str,
        source_type: str = 'file',
        source_uri: str | None = None,
        pipeline: str = '',
        status: str = 'pending',
        sha256: str | None = None,
        plugin_namespace: str | None = None,
    ) -> Document:
        """登记文档元数据（默认 pending，等待摄取层接管）。"""
        obj = Document(
            document_id=document_id,
            kb_name=kb_name,
            plugin_namespace=instance_namespace(plugin_namespace),
            name=name,
            source_type=source_type,
            source_uri=source_uri,
            pipeline=pipeline,
            status=status,
            sha256=sha256,
        )
        db.add(obj)
        await db.flush()
        return obj

    async def get(
        self,
        db: AsyncSession,
        document_id: str,
        *,
        plugin_namespace: str | None = None,
        kb_name: str | None = None,
    ) -> Document | None:
        """按文档 ID 查询（限定域，可选限定知识库）。"""
        return await self.select_scoped(
            db,
            document_id=document_id,
            plugin_namespace=plugin_namespace,
            kb_name=kb_name,
        )

    async def get_select(
        self,
        *,
        plugin_namespace: str | None = None,
        kb_name: str | None = None,
        query: str | None = None,
        source_type: str | None = None,
        status: str | None = None,
    ) -> Select:
        """构造文档列表查询（供分页器使用）。"""
        ns = instance_namespace(plugin_namespace)
        stmt: Select = select(Document).where(Document.plugin_namespace == ns)
        if kb_name:
            stmt = stmt.where(Document.kb_name == kb_name)
        if query:
            stmt = stmt.where(or_(Document.name.ilike(f'%{query}%'), Document.document_id.ilike(f'%{query}%')))
        if source_type:
            stmt = stmt.where(Document.source_type == source_type)
        if status:
            stmt = stmt.where(Document.status == status)
        stmt = stmt.order_by(Document.created_time.desc())
        return stmt

    async def count_by_kb(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
    ) -> int:
        """统计指定知识库的文档数。"""
        return await self.count_scoped(db, plugin_namespace=plugin_namespace, kb_name=kb_name)

    async def count(self, db: AsyncSession, *, plugin_namespace: str | None = None) -> int:
        """统计域内文档总数。"""
        return await self.count_scoped(db, plugin_namespace=plugin_namespace)

    async def delete_by_kb(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
    ) -> int:
        """按知识库删除全部文档登记行。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(delete(Document).where(Document.kb_name == kb_name, Document.plugin_namespace == ns))
        await db.flush()
        return result_rowcount(result)

    async def delete(
        self,
        db: AsyncSession,
        document_id: str,
        *,
        kb_name: str | None = None,
        plugin_namespace: str | None = None,
    ) -> int:
        """删除单篇文档登记行（限定域，可选限定知识库）。"""
        ns = instance_namespace(plugin_namespace)
        stmt = delete(Document).where(Document.document_id == document_id, Document.plugin_namespace == ns)
        if kb_name:
            stmt = stmt.where(Document.kb_name == kb_name)
        result = await db.execute(stmt)
        await db.flush()
        return result_rowcount(result)

    async def format_distribution(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
    ) -> list[tuple[str, int]]:
        """按 source_type 分组统计。"""
        ns = instance_namespace(plugin_namespace)
        stmt = (
            select(Document.source_type, func.count())
            .where(Document.kb_name == kb_name, Document.plugin_namespace == ns)
            .group_by(Document.source_type)
            .order_by(func.count().desc())
        )
        rows = await db.execute(stmt)
        return [(row[0], int(row[1])) for row in rows.all()]

    async def ingestion_volume(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
        days: int = 30,
    ) -> list[tuple[str, int]]:
        """按日期分组统计文档摄入量。"""
        ns = instance_namespace(plugin_namespace)
        stmt = (
            select(func.date(Document.created_time), func.count())
            .where(Document.kb_name == kb_name, Document.plugin_namespace == ns)
            .group_by(func.date(Document.created_time))
            .order_by(func.date(Document.created_time).desc())
            .limit(days)
        )
        rows = await db.execute(stmt)
        return [(row[0].isoformat(), int(row[1])) for row in rows.all()]

    async def facets(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
    ) -> list[dict[str, str | int]]:
        """返回 source_type / pipeline / status 分面。"""
        ns = instance_namespace(plugin_namespace)
        facets: list[dict[str, str | int]] = []
        for field in (Document.source_type, Document.pipeline, Document.status):
            stmt = (
                select(field, func.count())
                .where(Document.kb_name == kb_name, Document.plugin_namespace == ns)
                .group_by(field)
                .order_by(func.count().desc())
            )
            rows = await db.execute(stmt)
            for value, count in rows.all():
                facets.append({'field': field.name, 'value': value or '', 'count': int(count)})
        return facets


document_dao = CRUDDocument(Document)
