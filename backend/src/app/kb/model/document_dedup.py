"""文档去重模型（EagleRAG document_dedup 迁移）。

去重主键为 ``(sha256, kb_name, plugin_namespace)``：同一物理文件可存在于多个
知识库，但同一知识库内不允许重复上传。
"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone


class DocumentDedup(MappedBase):
    """文档去重表"""

    __tablename__ = 'document_dedup'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_document_dedup_kb', 'kb_name'),
        sa.Index('idx_document_dedup_namespace', 'plugin_namespace'),
        {'comment': '文档去重表'},
    )

    sha256: Mapped[str] = mapped_column(Text, primary_key=True, comment='文件 SHA-256')
    kb_name: Mapped[str] = mapped_column(Text, primary_key=True, comment='所属知识库')
    plugin_namespace: Mapped[str] = mapped_column(Text, primary_key=True, default='core', comment='部署级域标识')
    document_id: Mapped[str] = mapped_column(Text, comment='文档 ID')
    object_key: Mapped[str | None] = mapped_column(Text, nullable=True, comment='对象存储键')
    source_name: Mapped[str | None] = mapped_column(Text, nullable=True, comment='来源文件名')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
