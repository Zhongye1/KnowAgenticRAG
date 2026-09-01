"""文档去重 CRUD（EagleRAG storage/dedup.py 迁移）。

主键 ``(sha256, kb_name, plugin_namespace)``：同一文件可存在于多个知识库，
同一知识库内禁止重复。
"""

import hashlib

from sqlalchemy import delete, insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud.base import TenantScopedCrud, result_rowcount
from backend.src.app.kb.model import DocumentDedup
from backend.src.app.kb.service.namespace import instance_namespace


def compute_sha256_bytes(data: bytes) -> str:
    """计算字节流 SHA-256。"""
    return hashlib.sha256(data).hexdigest()


class CRUDDedup(TenantScopedCrud[DocumentDedup]):
    """文档去重数据库操作。"""

    async def get_by_sha256(
        self,
        db: AsyncSession,
        sha256: str,
        *,
        plugin_namespace: str | None = None,
        kb_name: str | None = None,
    ) -> DocumentDedup | None:
        """按指纹查询去重记录。"""
        return await self.select_scoped(db, sha256=sha256, plugin_namespace=plugin_namespace, kb_name=kb_name)

    async def check_duplicate(
        self,
        db: AsyncSession,
        sha256: str,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
    ) -> bool:
        """判断文件是否已在指定知识库内注册。"""
        return await self.get_by_sha256(db, sha256, plugin_namespace=plugin_namespace, kb_name=kb_name) is not None

    async def register(
        self,
        db: AsyncSession,
        *,
        sha256: str,
        kb_name: str,
        document_id: str,
        object_key: str | None = None,
        source_name: str | None = None,
        plugin_namespace: str | None = None,
    ) -> bool:
        """注册去重记录；已存在（重复注册）返回 False。"""
        ns = instance_namespace(plugin_namespace)
        stmt = insert(DocumentDedup).values(
            sha256=sha256,
            kb_name=kb_name,
            plugin_namespace=ns,
            document_id=document_id,
            object_key=object_key,
            source_name=source_name,
        )
        try:
            await db.execute(stmt)
            await db.flush()
        except IntegrityError:
            await db.rollback()
            return False
        else:
            return True

    async def delete_by_kb(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
    ) -> int:
        """按知识库删除去重记录。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(
            delete(DocumentDedup).where(DocumentDedup.kb_name == kb_name, DocumentDedup.plugin_namespace == ns)
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
        """按文档删除去重记录（限定域）。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(
            delete(DocumentDedup).where(DocumentDedup.document_id == document_id, DocumentDedup.plugin_namespace == ns)
        )
        await db.flush()
        return result_rowcount(result)

    async def list_object_keys_by_kb(
        self,
        db: AsyncSession,
        kb_name: str,
        *,
        plugin_namespace: str | None = None,
    ) -> list[str]:
        """按知识库列出已存储对象的 object_key（供级联删除清理对象存储）。"""
        ns = instance_namespace(plugin_namespace)
        stmt = select(DocumentDedup.object_key).where(
            DocumentDedup.kb_name == kb_name, DocumentDedup.plugin_namespace == ns
        )
        rows = await db.execute(stmt)
        return [row[0] for row in rows.all() if row[0]]


dedup_dao = CRUDDedup(DocumentDedup)
