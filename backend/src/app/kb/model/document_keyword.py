"""文档关键词（标签）目录模型（EagleRAG document_keywords 迁移）。

供检索范围过滤（scope filter）列出标签并解析标签 → 文档 ID。
"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import BigInteger, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone


class DocumentKeyword(MappedBase):
    """文档关键词目录表"""

    __tablename__ = 'document_keywords'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_document_keywords_kb_keyword', 'kb_name', 'keyword'),
        sa.Index('idx_document_keywords_namespace_kb_keyword', 'plugin_namespace', 'kb_name', 'keyword'),
        sa.Index('idx_document_keywords_keyword', 'keyword'),
        {'comment': '文档关键词（标签）目录表'},
    )

    document_id: Mapped[str] = mapped_column(
        Text, ForeignKey('documents.document_id', ondelete='CASCADE'), primary_key=True, comment='文档 ID'
    )
    keyword: Mapped[str] = mapped_column(Text, primary_key=True, comment='关键词')
    kb_name: Mapped[str] = mapped_column(Text, default='default', comment='所属知识库')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    node_count: Mapped[int] = mapped_column(BigInteger, default=0, comment='出现次数')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
