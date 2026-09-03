"""分块 CRUD（ragf-design §6.1/D9：kb 域数据 Owner；ingest 只写、检索只读）。"""

from sqlalchemy import Select, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud.base import TenantScopedCrud, result_rowcount
from backend.src.app.kb.model import Chunk
from backend.src.app.kb.utils.namespace import instance_namespace


class CRUDChunk(TenantScopedCrud[Chunk]):
    """分块数据库操作"""

    async def replace_by_document(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        kb_name: str,
        rows: list[dict],
        version_id: int = 1,
        plugin_namespace: str | None = None,
    ) -> int:
        """幂等替换文档某版本的全部分块（先删该版本、再批量写入），返回写入数。"""
        ns = instance_namespace(plugin_namespace)
        await db.execute(
            delete(Chunk).where(
                Chunk.document_id == document_id,
                Chunk.kb_name == kb_name,
                Chunk.plugin_namespace == ns,
                Chunk.version_id == version_id,
            )
        )
        await db.flush()
        objects = [
            Chunk(
                chunk_id=row['chunk_id'],
                document_id=document_id,
                kb_name=kb_name,
                plugin_namespace=ns,
                version_id=version_id,
                chunk_index=int(row.get('chunk_index') or 0),
                content=row['content'],
                token_count=row.get('token_count'),
                char_pos_start=row.get('char_pos_start'),
                char_pos_end=row.get('char_pos_end'),
                meta=row.get('meta') or {},
            )
            for row in rows
        ]
        if objects:
            db.add_all(objects)
            await db.flush()
        return len(objects)

    async def get_page_select(
        self,
        *,
        document_id: str,
        kb_name: str | None = None,
        version_id: int | None = None,
        plugin_namespace: str | None = None,
    ) -> Select:
        """构造文档分块查询（供分页器使用，version_id 缺省 = 当前 active_version 由调用方解析）。"""
        ns = instance_namespace(plugin_namespace)
        stmt: Select = select(Chunk).where(Chunk.document_id == document_id, Chunk.plugin_namespace == ns)
        if kb_name:
            stmt = stmt.where(Chunk.kb_name == kb_name)
        if version_id is not None:
            stmt = stmt.where(Chunk.version_id == version_id)
        return stmt.order_by(Chunk.chunk_index.asc())

    async def list_by_document(
        self,
        db: AsyncSession,
        document_id: str,
        *,
        kb_name: str | None = None,
        version_id: int | None = None,
        plugin_namespace: str | None = None,
    ) -> list[Chunk]:
        stmt = await self.get_page_select(
            document_id=document_id,
            kb_name=kb_name,
            version_id=version_id,
            plugin_namespace=plugin_namespace,
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def delete_by_document(
        self,
        db: AsyncSession,
        document_id: str,
        *,
        kb_name: str | None = None,
        plugin_namespace: str | None = None,
    ) -> int:
        """删除文档全部分块。"""
        ns = instance_namespace(plugin_namespace)
        stmt = delete(Chunk).where(Chunk.document_id == document_id, Chunk.plugin_namespace == ns)
        if kb_name:
            stmt = stmt.where(Chunk.kb_name == kb_name)
        result = await db.execute(stmt)
        await db.flush()
        return result_rowcount(result)

    async def delete_by_kb(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
    ) -> int:
        """删除知识库全部分块。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(delete(Chunk).where(Chunk.kb_name == kb_name, Chunk.plugin_namespace == ns))
        await db.flush()
        return result_rowcount(result)

    async def count_by_kb(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
    ) -> int:
        return await self.count_scoped(db, plugin_namespace=plugin_namespace, kb_name=kb_name)

    async def count_by_document(
        self,
        db: AsyncSession,
        document_id: str,
        *,
        kb_name: str | None = None,
        version_id: int | None = None,
        plugin_namespace: str | None = None,
    ) -> int:
        ns = instance_namespace(plugin_namespace)
        filters: list = [Chunk.document_id == document_id, Chunk.plugin_namespace == ns]
        if kb_name:
            filters.append(Chunk.kb_name == kb_name)
        if version_id is not None:
            filters.append(Chunk.version_id == version_id)
        stmt = select(func.count()).select_from(Chunk).where(*filters)
        return int((await db.execute(stmt)).scalar_one())


chunk_dao = CRUDChunk(Chunk)
