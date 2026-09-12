"""RAG 授权变更审计 CRUD（kb-ownership-and-acl-v2 spec §7.2，D48）。

append-only：只提供写入与查询，不提供 update/delete——审计记录不可篡改。
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud.base import TenantScopedCrud
from backend.src.app.kb.model.acl import AclAudit
from backend.src.app.kb.utils.namespace import instance_namespace


class CRUDAclAudit(TenantScopedCrud[AclAudit]):
    """授权变更审计数据库操作。"""

    async def append(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        action: str,
        document_id: str | None = None,
        principal_type: str | None = None,
        principal_id: str | None = None,
        perm: str | None = None,
        effect: str | None = None,
        before_json: dict | None = None,
        after_json: dict | None = None,
        operator_id: str | None = None,
        plugin_namespace: str | None = None,
    ) -> AclAudit:
        """追加一条审计记录（与授权变更同事务提交）。"""
        row = AclAudit(
            plugin_namespace=instance_namespace(plugin_namespace),
            kb_name=kb_name,
            document_id=document_id,
            action=action,
            principal_type=principal_type,
            principal_id=principal_id,
            perm=perm,
            effect=effect,
            before_json=before_json,
            after_json=after_json,
            operator_id=operator_id,
        )
        db.add(row)
        await db.flush()
        return row

    async def list_by_kb(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        document_id: str | None = None,
        limit: int = 100,
        plugin_namespace: str | None = None,
    ) -> list[AclAudit]:
        """按 KB（可选文档）倒序查询审计记录。"""
        ns = instance_namespace(plugin_namespace)
        stmt = select(AclAudit).where(AclAudit.plugin_namespace == ns, AclAudit.kb_name == kb_name)
        if document_id is not None:
            stmt = stmt.where(AclAudit.document_id == document_id)
        stmt = stmt.order_by(AclAudit.created_time.desc(), AclAudit.id.desc()).limit(limit)
        rows = await db.scalars(stmt)
        return list(rows.all())


acl_audit_dao = CRUDAclAudit(AclAudit)
