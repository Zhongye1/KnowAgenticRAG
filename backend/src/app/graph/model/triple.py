"""图谱三元组模型（RAG 清单 Phase 5 / D62）。

三元组 ID 对**方向敏感**（`compute_triple_id` 把源/目标顺序纳入哈希）：「A 属于 B」与
「B 属于 A」是两条不同的关系。``source_entity_id`` / ``target_entity_id`` 各自建索引——
子图抽取按两端分别展开，这是替代 Neo4j 遍历的关键访问路径。
"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone

__all__ = ['GraphTriple']


class GraphTriple(MappedBase):
    """图谱三元组（实体间的一条有向关系）"""

    __tablename__ = 'graph_triples'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_graph_triples_ns_kb', 'plugin_namespace', 'kb_name'),
        sa.Index('idx_graph_triples_source', 'source_entity_id'),
        sa.Index('idx_graph_triples_target', 'target_entity_id'),
        {'comment': '知识图谱三元组（有向；两端各建索引供子图展开）'},
    )

    triple_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='三元组 ID（内容派生哈希，方向敏感）')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    kb_name: Mapped[str] = mapped_column(Text, comment='所属知识库')
    source_entity_id: Mapped[str] = mapped_column(Text, comment='源实体 ID')
    target_entity_id: Mapped[str] = mapped_column(Text, comment='目标实体 ID')
    relation_type: Mapped[str] = mapped_column(Text, default='RELATED_TO', comment='关系类型')
    text: Mapped[str] = mapped_column(Text, default='', comment='关系描述原文（供检索与展示）')
    extractor_type: Mapped[str] = mapped_column(Text, default='', comment='抽取器类型（溯源）')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
