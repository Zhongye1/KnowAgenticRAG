"""RAG ACL CRUD（agent-layer spec ACL 设计 §3/§8）。

KB 级与文档级 ACL 的读写。组 ID 引用 Admin 部门（``sys_dept.id``），
DB 是 source-of-truth；Milvus 侧标量字段是镜像（变更传播在 acl_service）。
"""

from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud.base import TenantScopedCrud
from backend.src.app.kb.model.acl import DocAcl, KbAcl
from backend.src.app.kb.utils.namespace import instance_namespace

MAX_DOC_GROUPS = 32  # 对齐 Milvus groups ARRAY max_capacity


class CRUDKbAcl(TenantScopedCrud[KbAcl]):
    """KB 级 ACL 数据库操作。"""

    async def list_kb_groups(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        plugin_namespace: str | None = None,
    ) -> list[str]:
        """查询 KB 已授权的组 ID 列表。"""
        ns = instance_namespace(plugin_namespace)
        stmt = select(KbAcl.group_id).where(KbAcl.plugin_namespace == ns, KbAcl.kb_name == kb_name)
        rows = await db.scalars(stmt)
        return list(rows.all())

    async def replace_kb_acl(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        group_ids: list[str],
        created_by: str | None = None,
        plugin_namespace: str | None = None,
    ) -> int:
        """全量替换 KB 的授权组（幂等）；返回当前授权组数。"""
        ns = instance_namespace(plugin_namespace)
        await db.execute(delete(KbAcl).where(KbAcl.plugin_namespace == ns, KbAcl.kb_name == kb_name))
        for group_id in dict.fromkeys(group_ids):
            db.add(KbAcl(kb_name=kb_name, plugin_namespace=ns, group_id=group_id, created_by=created_by))
        await db.flush()
        return len(set(group_ids))

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

    async def list_document_groups(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        kb_name: str | None = None,
        plugin_namespace: str | None = None,
    ) -> list[str]:
        """查询文档已授权的组 ID 列表（摄取时镜像到 Milvus groups 字段）。"""
        ns = instance_namespace(plugin_namespace)
        filters: list[Any] = [DocAcl.plugin_namespace == ns, DocAcl.document_id == document_id]
        if kb_name is not None:
            filters.append(DocAcl.kb_name == kb_name)
        stmt = select(DocAcl.group_id).where(*filters)
        rows = await db.scalars(stmt)
        return list(rows.all())

    async def replace_document_acl(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        kb_name: str,
        group_ids: list[str],
        created_by: str | None = None,
        plugin_namespace: str | None = None,
    ) -> int:
        """全量替换文档的授权组（幂等，超限截断到 MAX_DOC_GROUPS）；返回当前组数。"""
        ns = instance_namespace(plugin_namespace)
        groups = list(dict.fromkeys(group_ids))[:MAX_DOC_GROUPS]
        await db.execute(
            delete(DocAcl).where(
                DocAcl.plugin_namespace == ns,
                DocAcl.kb_name == kb_name,
                DocAcl.document_id == document_id,
            )
        )
        for group_id in groups:
            db.add(
                DocAcl(
                    document_id=document_id,
                    kb_name=kb_name,
                    plugin_namespace=ns,
                    group_id=group_id,
                    created_by=created_by,
                )
            )
        await db.flush()
        return len(groups)

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


kb_acl_dao = CRUDKbAcl(KbAcl)
doc_acl_dao = CRUDDocAcl(DocAcl)
