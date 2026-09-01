"""文档元数据登记模型（EagleRAG documents 迁移，不包含摄取逻辑）。"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import BigInteger, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone


class Document(MappedBase):
    """文档元数据登记表"""

    __tablename__ = 'documents'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_documents_kb', 'kb_name'),
        sa.Index('idx_documents_namespace', 'plugin_namespace'),
        sa.Index('idx_documents_ns_kb', 'plugin_namespace', 'kb_name'),
        sa.Index('idx_documents_status', 'status'),
        sa.Index('idx_documents_source_type', 'source_type'),
        {'comment': '文档元数据登记表'},
    )

    document_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='文档 ID')
    kb_name: Mapped[str] = mapped_column(Text, default='default', comment='所属知识库')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    name: Mapped[str] = mapped_column(Text, comment='文档名称')
    source_type: Mapped[str] = mapped_column(Text, default='', comment='来源类型')
    source_uri: Mapped[str | None] = mapped_column(Text, nullable=True, comment='来源 URI')
    pipeline: Mapped[str] = mapped_column(Text, default='', comment='摄取管道')
    status: Mapped[str] = mapped_column(
        Text, default='pending', comment='状态（pending/parsing/indexing/ready/failed）'
    )
    sha256: Mapped[str | None] = mapped_column(Text, nullable=True, comment='文件指纹')
    chunk_count: Mapped[int] = mapped_column(BigInteger, default=0, comment='文本块数')
    active_version: Mapped[int] = mapped_column(BigInteger, default=1, comment='当前版本（Phase 2 版本化占位，默认 1）')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
    updated_time: Mapped[datetime] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间'
    )
