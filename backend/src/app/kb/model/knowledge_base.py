"""知识库注册表模型（EagleRAG knowledge_bases 迁移）。"""

from datetime import datetime
from typing import Any

import sqlalchemy as sa

from sqlalchemy import JSON, Float, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone


class KnowledgeBase(MappedBase):
    """知识库注册表"""

    __tablename__ = 'knowledge_bases'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_knowledge_bases_updated', 'updated_time'),
        sa.Index('idx_knowledge_bases_namespace', 'plugin_namespace'),
        {'comment': '知识库注册表'},
    )

    kb_name: Mapped[str] = mapped_column(Text, primary_key=True, comment='知识库标识（^[a-z0-9_]+$）')
    plugin_namespace: Mapped[str] = mapped_column(Text, primary_key=True, default='core', comment='部署级域标识')
    display_name: Mapped[str] = mapped_column(Text, comment='展示名称')
    description: Mapped[str] = mapped_column(Text, default='', comment='描述')
    theme: Mapped[str] = mapped_column(Text, default='blue', comment='主题色')
    icon: Mapped[str] = mapped_column(Text, default='database', comment='图标')
    pdf_text_page_ratio: Mapped[float] = mapped_column(Float, default=0.2, comment='PDF 文本页比例阈值')
    collections_used: Mapped[list[Any]] = mapped_column(JSON, default=list, comment='已写入的集合目录')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
    updated_time: Mapped[datetime] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间'
    )
