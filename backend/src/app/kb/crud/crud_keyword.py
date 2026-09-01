"""文档关键词（标签）目录 CRUD。"""

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud.base import TenantScopedCrud, result_rowcount
from backend.src.app.kb.model import DocumentKeyword
from backend.src.app.kb.service.namespace import instance_namespace


class CRUDKeyword(TenantScopedCrud[DocumentKeyword]):
    """文档关键词目录数据库操作。"""

    async def list_tags(
        self,
        db: AsyncSession,
        *,
        plugin_namespace: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        """标签目录：关键词 + 覆盖文档数 + 出现知识库 + 出现次数。"""
        ns = instance_namespace(plugin_namespace)
        stmt = (
            select(
                DocumentKeyword.keyword,
                func.count(DocumentKeyword.document_id.distinct()),
                func.sum(DocumentKeyword.node_count),
            )
            .where(DocumentKeyword.plugin_namespace == ns)
            .group_by(DocumentKeyword.keyword)
            .order_by(func.count(DocumentKeyword.document_id.distinct()).desc())
            .limit(limit)
        )
        rows = await db.execute(stmt)
        keywords = [row[0] for row in rows.all()]
        kb_map: dict[str, list[str]] = {}
        if keywords:
            kb_stmt = (
                select(DocumentKeyword.keyword, DocumentKeyword.kb_name.distinct())
                .where(DocumentKeyword.plugin_namespace == ns, DocumentKeyword.keyword.in_(keywords))
                .group_by(DocumentKeyword.keyword, DocumentKeyword.kb_name)
            )
            kb_rows = await db.execute(kb_stmt)
            for keyword, kb_name in kb_rows.all():
                kb_map.setdefault(keyword, []).append(kb_name)
        return [
            {
                'keyword': row[0],
                'document_count': int(row[1]),
                'node_count': int(row[2] or 0),
                'kb_names': kb_map.get(row[0], []),
            }
            for row in rows.all()
        ]

    async def resolve_tags(
        self,
        db: AsyncSession,
        tags: list[str],
        *,
        plugin_namespace: str | None = None,
        cap: int = 1000,
    ) -> list[str]:
        """把标签解析为文档 ID 列表（scope filter 用，上限 cap）。"""
        if not tags:
            return []
        ns = instance_namespace(plugin_namespace)
        stmt = (
            select(DocumentKeyword.document_id.distinct())
            .where(DocumentKeyword.plugin_namespace == ns, DocumentKeyword.keyword.in_(tags))
            .limit(cap)
        )
        rows = await db.execute(stmt)
        return [row[0] for row in rows.all()]

    async def delete_by_kb(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
    ) -> int:
        """按知识库删除关键词目录（文档级删除由 FK 级联）。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(
            delete(DocumentKeyword).where(DocumentKeyword.kb_name == kb_name, DocumentKeyword.plugin_namespace == ns)
        )
        await db.flush()
        return result_rowcount(result)


keyword_dao = CRUDKeyword(DocumentKeyword)
