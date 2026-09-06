"""文档元数据 CRUD（只读登记，不含摄取）。"""

from datetime import datetime
from typing import Any

from sqlalchemy import Select, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud.base import TenantScopedCrud, result_rowcount
from backend.src.app.kb.model import Document, DocumentKeyword
from backend.src.app.kb.utils.namespace import instance_namespace


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
        visibility: str = 'restricted',
        owner_id: str | None = None,
        plugin_namespace: str | None = None,
    ) -> Document:
        """登记文档元数据（默认 pending + restricted，等待摄取层接管）。"""
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
            visibility=visibility,
            owner_id=owner_id,
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

    async def resolve_searchable_document_ids(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        plugin_namespace: str | None = None,
        file_name: str | None = None,
        keyword: str | None = None,
        tag: str | None = None,
        updated_after: datetime | None = None,
        updated_before: datetime | None = None,
        file_type: str | None = None,
        path_prefix: str | None = None,
    ) -> list[str] | None:
        """文档级过滤 → document_id 集（M11/D26：keyword/tag/updated/file_type/path_prefix + file_name）。

        无条件返回 None（不过滤）；有条件但命中为空返回 []（检索方短路为空结果）。
        租户作用域与 kb_name 过滤强制注入；keyword/tag 经 ``document_keywords`` 目录解析。
        """
        ns = instance_namespace(plugin_namespace)
        conditions: list[Any] = [Document.plugin_namespace == ns, Document.kb_name == kb_name]

        file_name = (file_name or '').strip() or None
        if file_name:
            conditions.append(Document.name.ilike(f'%{file_name}%'))

        keyword = (keyword or '').strip() or None
        if keyword:
            conditions.append(
                select(DocumentKeyword.document_id)
                .where(
                    DocumentKeyword.plugin_namespace == ns,
                    DocumentKeyword.kb_name == kb_name,
                    DocumentKeyword.document_id == Document.document_id,
                    DocumentKeyword.keyword.ilike(f'%{keyword}%'),
                )
                .exists()
            )

        tag = (tag or '').strip() or None
        if tag:
            conditions.append(
                select(DocumentKeyword.document_id)
                .where(
                    DocumentKeyword.plugin_namespace == ns,
                    DocumentKeyword.kb_name == kb_name,
                    DocumentKeyword.document_id == Document.document_id,
                    DocumentKeyword.keyword == tag,
                )
                .exists()
            )

        if updated_after is not None:
            conditions.append(Document.updated_time >= updated_after)
        if updated_before is not None:
            conditions.append(Document.updated_time <= updated_before)

        ext = ((file_type or '').strip().lstrip('.').lower()) or None
        if ext:
            conditions.append(Document.name.ilike(f'%.{ext}'))

        prefix = (path_prefix or '').strip() or None
        if prefix:
            conditions.append(or_(Document.source_uri.startswith(prefix), Document.name.startswith(prefix)))

        if len(conditions) == 2:
            return None

        stmt = select(Document.document_id).where(*conditions).distinct()
        rows = await db.execute(stmt)
        return [row[0] for row in rows.all()]

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

    async def list_ids_by_kb(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
    ) -> list[str]:
        """按知识库列出文档 ID（级联删除/rebuild 用）。"""
        ns = instance_namespace(plugin_namespace)
        stmt = select(Document.document_id).where(
            Document.kb_name == kb_name,
            Document.plugin_namespace == ns,
        )
        rows = await db.execute(stmt)
        return [row[0] for row in rows.all()]

    async def list_by_ids(
        self,
        db: AsyncSession,
        document_ids: list[str],
        *,
        kb_name: str | None = None,
        plugin_namespace: str | None = None,
    ) -> list[Document]:
        """按文档 ID 批量读取（来源补全用，限定域，可选限定知识库）。"""
        ids = [str(item) for item in document_ids if item]
        if not ids:
            return []
        ns = instance_namespace(plugin_namespace)
        stmt = select(Document).where(Document.document_id.in_(ids), Document.plugin_namespace == ns)
        if kb_name:
            stmt = stmt.where(Document.kb_name == kb_name)
        result = await db.execute(stmt)
        return list(result.scalars().all())

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
