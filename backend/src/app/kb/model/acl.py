"""RAG 数据权限模型（agent-layer spec ACL 设计）。

两级 ACL：
- KB 级：哪些组可以访问该知识库
- 文档级：KB 内哪些文档对哪些组可见

Milvus 侧镜像这些字段（检索时过滤全靠它），DB 是 source-of-truth。
组 ID 引用 Admin 部门（``sys_dept.id``），只读引用、不反向写。
"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import BigInteger, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone

__all__ = ['DocAcl', 'KbAcl']


class KbAcl(MappedBase):
    """RAG 知识库级访问控制列表"""

    __tablename__ = 'rag_kb_acl'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.UniqueConstraint('plugin_namespace', 'kb_name', 'group_id', name='uq_rag_kb_acl_ns_kb_group'),
        sa.Index('idx_rag_kb_acl_ns_group', 'plugin_namespace', 'group_id'),
        {'comment': 'RAG 知识库级访问控制列表'},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True, comment='主键')
    kb_name: Mapped[str] = mapped_column(Text, comment='知识库标识')
    plugin_namespace: Mapped[str] = mapped_column(Text, comment='部署级域标识')
    group_id: Mapped[str] = mapped_column(Text, comment='组ID（引用 Admin 部门 sys_dept.id）')
    created_by: Mapped[str | None] = mapped_column(Text, nullable=True, comment='创建人')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')


class DocAcl(MappedBase):
    """RAG 文档级访问控制列表"""

    __tablename__ = 'rag_doc_acl'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.UniqueConstraint(
            'plugin_namespace', 'kb_name', 'document_id', 'group_id', name='uq_rag_doc_acl_ns_doc_group'
        ),
        sa.Index('idx_rag_doc_acl_ns_group', 'plugin_namespace', 'group_id'),
        {'comment': 'RAG 文档级访问控制列表（归一化行，每行一个组）'},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True, comment='主键')
    document_id: Mapped[str] = mapped_column(Text, comment='文档ID')
    kb_name: Mapped[str] = mapped_column(Text, comment='知识库标识')
    plugin_namespace: Mapped[str] = mapped_column(Text, comment='部署级域标识')
    group_id: Mapped[str] = mapped_column(Text, comment='组ID（引用 Admin 部门 sys_dept.id）')
    created_by: Mapped[str | None] = mapped_column(Text, nullable=True, comment='创建人')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
