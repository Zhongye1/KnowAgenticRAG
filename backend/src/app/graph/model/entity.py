"""图谱实体模型（RAG 清单 Phase 5 / D62）。

``(plugin_namespace, kb_name, normalized_name, label)`` 上有唯一约束：实体 ID 已由内容
确定性派生，这条约束是并发写入下的第二道保险——两张并发的抽取任务不会把同一实体写成
两行。它同时是幂等 upsert 的锚点。
"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import JSON, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone

__all__ = ['GraphEntity']


class GraphEntity(MappedBase):
    """图谱实体（跨文档共享：同一实体在多篇文档里出现只保留一行）"""

    __tablename__ = 'graph_entities'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.UniqueConstraint(
            'plugin_namespace', 'kb_name', 'normalized_name', 'label', name='uq_graph_entities_identity'
        ),
        sa.Index('idx_graph_entities_ns_kb', 'plugin_namespace', 'kb_name'),
        {'comment': '知识图谱实体（跨文档共享，按归一名称+标签去重）'},
    )

    entity_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='实体 ID（内容派生哈希）')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    kb_name: Mapped[str] = mapped_column(Text, comment='所属知识库')
    normalized_name: Mapped[str] = mapped_column(Text, comment='归一名称（去空白/小写，去重键）')
    name: Mapped[str] = mapped_column(Text, comment='原始名称（展示用）')
    label: Mapped[str] = mapped_column(Text, default='Entity', comment='实体类型')
    attributes: Mapped[list] = mapped_column(JSON, default=list, comment='属性（[{text,label}]，取并集）')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
    updated_time: Mapped[datetime | None] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间'
    )
