"""图谱提及与建图台账模型（RAG 清单 Phase 5 / D62）。

- ``GraphMention``：chunk → 实体的提及关系。它回答「这个实体在哪段原文里出现过」，
  也是「删除某文档的图谱」的删除锚点。
- ``GraphDocumentIndex``：**建图台账**，图谱域自己拥有「哪些文档已建图」这个事实。

为什么台账不落在 kb 的 ``documents`` 表上（清单原文写的是「``graph_indexed`` 自愈字段」）：
``create_all`` **不给既有表补列**，加列要动 `ragf_schema_migrations.py`；而且「是否已建图」
是图谱域的状态，放在别人的表上会让两个域共同拥有同一列。独立台账既避免改 kb 表，也让
自愈（对比台账与实际分块）有单一 Owner。
"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import BigInteger, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone

__all__ = ['GraphDocumentIndex', 'GraphMention']


class GraphMention(MappedBase):
    """实体提及（分块 → 实体）"""

    __tablename__ = 'graph_mentions'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_graph_mentions_chunk', 'chunk_id'),
        sa.Index('idx_graph_mentions_entity', 'entity_id'),
        sa.Index('idx_graph_mentions_document', 'plugin_namespace', 'document_id'),
        {'comment': '实体提及（分块 → 实体；删除文档图谱的锚点）'},
    )

    mention_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='提及 ID（{chunk_id}:{entity_id}）')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    kb_name: Mapped[str] = mapped_column(Text, comment='所属知识库')
    chunk_id: Mapped[str] = mapped_column(Text, comment='来源分块')
    document_id: Mapped[str] = mapped_column(Text, comment='来源文档')
    entity_id: Mapped[str] = mapped_column(Text, comment='实体 ID')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')


class GraphDocumentIndex(MappedBase):
    """建图台账（图谱域拥有的「文档已建图」事实）"""

    __tablename__ = 'graph_document_index'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_graph_document_index_ns_kb', 'plugin_namespace', 'kb_name'),
        {'comment': '建图台账（自愈：与文档当前分块数比对决定是否需重建）'},
    )

    document_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='文档 ID')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    kb_name: Mapped[str] = mapped_column(Text, comment='所属知识库')
    version_id: Mapped[int] = mapped_column(BigInteger, default=1, comment='建图时的版本')
    chunk_count: Mapped[int] = mapped_column(BigInteger, default=0, comment='建图时的分块数（自愈比对基准）')
    entity_count: Mapped[int] = mapped_column(BigInteger, default=0, comment='贡献的实体数')
    triple_count: Mapped[int] = mapped_column(BigInteger, default=0, comment='贡献的三元组数')
    status: Mapped[str] = mapped_column(Text, default='indexed', comment='状态（indexed/failed）')
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True, comment='失败原因')
    indexed_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='建图时间')
