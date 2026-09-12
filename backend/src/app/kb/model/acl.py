"""RAG 数据权限模型 v2（kb-ownership-and-acl-v2 spec §4）。

两级 ACL：
- KB 级：哪些主体（user/role/dept/group）在该库上拥有哪个权限级别（owner/manage/contribute/read）
- 文档级：KB 内文档的可见性收窄——文档可见集 ⊆ KB 可见集（D47），只做收窄不做放大

主体 = (principal_type, principal_id)；effect 支持显式 deny；expires_at 支持临时授权。
DB 是 source-of-truth，Milvus 侧标量字段是文档级检索期镜像（变更传播在 service/acl/entries.py）。

rag_acl_audit 为授权变更审计表（append-only，只增不改不删，D48）。

v1 → v2 为破坏性重构（group_id → principal_type/principal_id，pre-launch 无存量数据）：
已存在的 v1 表需 DROP 后由 create_all 按 v2 形态重建（见 ragf_schema_migrations.py 说明）。
"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import BigInteger, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone

__all__ = ['AclAudit', 'DocAcl', 'KbAcl']


class KbAcl(MappedBase):
    """RAG 知识库级访问控制列表（v2：主体 + 级别 + allow/deny + 有效期）"""

    __tablename__ = 'rag_kb_acl'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.UniqueConstraint(
            'plugin_namespace', 'kb_name', 'principal_type', 'principal_id', name='uq_rag_kb_acl_ns_kb_principal'
        ),
        sa.Index('idx_rag_kb_acl_ns_principal', 'plugin_namespace', 'principal_type', 'principal_id'),
        {'comment': 'RAG 知识库级访问控制列表'},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True, comment='主键')
    kb_name: Mapped[str] = mapped_column(Text, comment='知识库标识')
    plugin_namespace: Mapped[str] = mapped_column(Text, comment='部署级域标识')
    principal_type: Mapped[str] = mapped_column(sa.String(16), comment='主体类型（user/role/dept/group）')
    principal_id: Mapped[str] = mapped_column(
        Text, comment='主体 ID（user=sys_user.id / role=sys_role.id / dept=sys_dept.id）'
    )
    perm: Mapped[str] = mapped_column(
        sa.String(16), default='read', comment='权限级别（owner/manage/contribute/read，序数比较）'
    )
    effect: Mapped[str] = mapped_column(sa.String(8), default='allow', comment='允许/拒绝（allow/deny，deny 优先）')
    expires_at: Mapped[datetime | None] = mapped_column(
        TimeZone, nullable=True, comment='过期时间（NULL=永久；过期条目求值时忽略）'
    )
    created_by: Mapped[str | None] = mapped_column(Text, nullable=True, comment='创建人')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
    updated_time: Mapped[datetime] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间'
    )


class DocAcl(MappedBase):
    """RAG 文档级访问控制列表（归一化行，每行一个主体）

    文档级 ACL 只收窄 KB 可见集（D47）：镜像到 Milvus 的标量字段（owner_id/groups）
    只能表达 user/dept 两类主体的 allow 语义，因此写路径约束主体类型 ∈ {user, dept}、
    effect=allow、expires_at IS NULL（KB 级无此限制）。
    """

    __tablename__ = 'rag_doc_acl'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.UniqueConstraint(
            'plugin_namespace',
            'kb_name',
            'document_id',
            'principal_type',
            'principal_id',
            name='uq_rag_doc_acl_ns_doc_principal',
        ),
        sa.Index('idx_rag_doc_acl_ns_principal', 'plugin_namespace', 'principal_type', 'principal_id'),
        {'comment': 'RAG 文档级访问控制列表（归一化行，每行一个主体）'},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True, comment='主键')
    document_id: Mapped[str] = mapped_column(Text, comment='文档ID')
    kb_name: Mapped[str] = mapped_column(Text, comment='知识库标识')
    plugin_namespace: Mapped[str] = mapped_column(Text, comment='部署级域标识')
    principal_type: Mapped[str] = mapped_column(sa.String(16), comment='主体类型（镜像约束：user/dept）')
    principal_id: Mapped[str] = mapped_column(Text, comment='主体 ID（user=sys_user.id / dept=sys_dept.id）')
    perm: Mapped[str] = mapped_column(
        sa.String(16), default='read', comment='文档级无级别语义，恒为 read（镜像可表达性约束）'
    )
    effect: Mapped[str] = mapped_column(
        sa.String(8), default='allow', comment='恒为 allow（文档级 deny 无法在 Milvus 召回内下推）'
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        TimeZone, nullable=True, comment='恒为 NULL（文档级临时授权无召回内下推通道）'
    )
    created_by: Mapped[str | None] = mapped_column(Text, nullable=True, comment='创建人')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')


class AclAudit(MappedBase):
    """RAG 授权变更审计（append-only：只增不改不删，D48）"""

    __tablename__ = 'rag_acl_audit'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_rag_acl_audit_ns_kb', 'plugin_namespace', 'kb_name'),
        sa.Index('idx_rag_acl_audit_created', 'created_time'),
        {'comment': 'RAG 授权变更审计（append-only）'},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True, comment='主键')
    plugin_namespace: Mapped[str] = mapped_column(Text, comment='部署级域标识')
    kb_name: Mapped[str] = mapped_column(Text, comment='知识库标识')
    document_id: Mapped[str | None] = mapped_column(Text, nullable=True, comment='文档ID（文档级事件）')
    action: Mapped[str] = mapped_column(
        Text, comment='动作（kb_owner_init/kb_acl_update/doc_acl_update/kb_transfer/...）'
    )
    principal_type: Mapped[str | None] = mapped_column(sa.String(16), nullable=True, comment='变更涉及的主体类型')
    principal_id: Mapped[str | None] = mapped_column(Text, nullable=True, comment='变更涉及的主体 ID')
    perm: Mapped[str | None] = mapped_column(sa.String(16), nullable=True, comment='变更涉及的权限级别')
    effect: Mapped[str | None] = mapped_column(sa.String(8), nullable=True, comment='变更涉及的 allow/deny')
    before_json: Mapped[dict | None] = mapped_column(sa.JSON, nullable=True, comment='变更前快照')
    after_json: Mapped[dict | None] = mapped_column(sa.JSON, nullable=True, comment='变更后快照')
    operator_id: Mapped[str | None] = mapped_column(Text, nullable=True, comment='操作人')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
