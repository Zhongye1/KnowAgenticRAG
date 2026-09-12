"""RAG ACL CRUD v2（kb-ownership-and-acl-v2 spec §4）。

KB 级与文档级 ACL 条目读写。主体 = (principal_type, principal_id)，DB 是
source-of-truth；Milvus 侧标量字段是文档级镜像（变更传播在 service/acl/entries.py）。
"""

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud.base import TenantScopedCrud
from backend.src.app.kb.model.acl import DocAcl, KbAcl
from backend.src.app.kb.schema.acl import DocAclEntry, KBAclEntry
from backend.src.app.kb.utils.namespace import instance_namespace

MAX_DOC_ENTRIES = 32  # 对齐 Milvus groups ARRAY max_capacity（镜像可表达条目上限）


class CRUDKbAcl(TenantScopedCrud[KbAcl]):
    """KB 级 ACL 数据库操作。"""

    async def list_entries(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        plugin_namespace: str | None = None,
    ) -> list[KbAcl]:
        """查询 KB 全部授权条目（含已过期，求值时过滤）。"""
        ns = instance_namespace(plugin_namespace)
        stmt = select(KbAcl).where(KbAcl.plugin_namespace == ns, KbAcl.kb_name == kb_name)
        rows = await db.scalars(stmt)
        return list(rows.all())

    async def list_entries_by_kbs(
        self,
        db: AsyncSession,
        *,
        kb_names: Sequence[str] | None = None,
        plugin_namespace: str | None = None,
    ) -> list[KbAcl]:
        """批量查询授权条目（整域或指定 KB 集合，供 resolve_visible_kbs 防逐库 N+1）。"""
        ns = instance_namespace(plugin_namespace)
        stmt = select(KbAcl).where(KbAcl.plugin_namespace == ns)
        if kb_names is not None:
            if not kb_names:
                return []
            stmt = stmt.where(KbAcl.kb_name.in_(kb_names))
        rows = await db.scalars(stmt)
        return list(rows.all())

    async def replace_entries(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        entries: Sequence[KBAclEntry],
        created_by: str | None = None,
        plugin_namespace: str | None = None,
    ) -> int:
        """全量替换 KB 授权条目（幂等）；返回条目数。"""
        ns = instance_namespace(plugin_namespace)
        await db.execute(delete(KbAcl).where(KbAcl.plugin_namespace == ns, KbAcl.kb_name == kb_name))
        for entry in entries:
            db.add(
                KbAcl(
                    kb_name=kb_name,
                    plugin_namespace=ns,
                    principal_type=entry.principal_type,
                    principal_id=entry.principal_id,
                    perm=entry.perm,
                    effect=entry.effect,
                    expires_at=entry.expires_at,
                    created_by=created_by,
                )
            )
        await db.flush()
        return len(entries)

    async def delete_by_kb(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        plugin_namespace: str | None = None,
    ) -> int:
        """删除 KB 全部 ACL 行（KB 删除时联动清理）。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(delete(KbAcl).where(KbAcl.plugin_namespace == ns, KbAcl.kb_name == kb_name))
        await db.flush()
        return getattr(result, 'rowcount', 0) or 0


class CRUDDocAcl(TenantScopedCrud[DocAcl]):
    """文档级 ACL 数据库操作。"""

    async def list_entries(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        kb_name: str | None = None,
        plugin_namespace: str | None = None,
    ) -> list[DocAcl]:
        """查询文档全部授权条目。"""
        ns = instance_namespace(plugin_namespace)
        filters: list[Any] = [DocAcl.plugin_namespace == ns, DocAcl.document_id == document_id]
        if kb_name is not None:
            filters.append(DocAcl.kb_name == kb_name)
        stmt = select(DocAcl).where(*filters)
        rows = await db.scalars(stmt)
        return list(rows.all())

    async def replace_entries(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        kb_name: str,
        entries: Sequence[DocAclEntry],
        created_by: str | None = None,
        plugin_namespace: str | None = None,
    ) -> int:
        """全量替换文档授权条目（幂等，超限截断到 MAX_DOC_ENTRIES）；返回条目数。"""
        ns = instance_namespace(plugin_namespace)
        await db.execute(
            delete(DocAcl).where(
                DocAcl.plugin_namespace == ns,
                DocAcl.kb_name == kb_name,
                DocAcl.document_id == document_id,
            )
        )
        for entry in entries[:MAX_DOC_ENTRIES]:
            db.add(
                DocAcl(
                    document_id=document_id,
                    kb_name=kb_name,
                    plugin_namespace=ns,
                    principal_type=entry.principal_type,
                    principal_id=entry.principal_id,
                    perm=entry.perm,
                    effect=entry.effect,
                    expires_at=entry.expires_at,
                    created_by=created_by,
                )
            )
        await db.flush()
        return min(len(entries), MAX_DOC_ENTRIES)

    async def delete_by_document(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        plugin_namespace: str | None = None,
    ) -> int:
        """删除文档全部 ACL 行（文档删除时联动清理）。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(
            delete(DocAcl).where(DocAcl.plugin_namespace == ns, DocAcl.document_id == document_id)
        )
        await db.flush()
        return getattr(result, 'rowcount', 0) or 0

    async def delete_by_kb(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        plugin_namespace: str | None = None,
    ) -> int:
        """删除 KB 下全部文档 ACL 行（KB 删除时联动清理）。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(delete(DocAcl).where(DocAcl.plugin_namespace == ns, DocAcl.kb_name == kb_name))
        await db.flush()
        return getattr(result, 'rowcount', 0) or 0

    async def delete_expired_by_kb(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        now: datetime,
        plugin_namespace: str | None = None,
    ) -> int:
        """清理 KB 下已过期授权条目（巡检任务用；文档级当前不接受 expires_at，防御性保留）。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(
            delete(DocAcl).where(
                DocAcl.plugin_namespace == ns,
                DocAcl.kb_name == kb_name,
                DocAcl.expires_at.is_not(None),
                DocAcl.expires_at <= now,
            )
        )
        await db.flush()
        return getattr(result, 'rowcount', 0) or 0


kb_acl_dao = CRUDKbAcl(KbAcl)
doc_acl_dao = CRUDDocAcl(DocAcl)
