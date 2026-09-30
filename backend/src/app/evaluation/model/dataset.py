"""评估数据集模型（RAG 清单 Phase 4 / D61，参照 Yuxi ``models_knowledge.py`` 四表）。

与 Yuxi 的三处差异：**① 多租户**——加 ``plugin_namespace`` 并由 ``TenantScopedCrud``
强制注入过滤（租户隔离收口在基类）；**② 主键**——用自然字符串主键（对齐本项目
``documents``/``chunks`` 的既有风格），不用自增 id；**③ KB 引用**——Yuxi 外键指向
``knowledge_bases.kb_id``，本项目 KB 的标识是 ``(plugin_namespace, kb_name)``。
"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import JSON, BigInteger, Boolean, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone

__all__ = ['EvalDataset', 'EvalDatasetItem']


class EvalDataset(MappedBase):
    """评估数据集（题目集合 + 标注能力声明）"""

    __tablename__ = 'eval_datasets'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_eval_datasets_ns_kb', 'plugin_namespace', 'kb_name'),
        {'comment': '评估数据集（kb 维度；题目标注决定可算哪些指标）'},
    )

    dataset_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='数据集 ID')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    kb_name: Mapped[str] = mapped_column(Text, comment='所属知识库')
    name: Mapped[str] = mapped_column(Text, comment='数据集名称')
    description: Mapped[str] = mapped_column(Text, default='', comment='描述')
    item_count: Mapped[int] = mapped_column(Integer, default=0, comment='题目数（冗余计数，构建后回填）')
    # 两轴标注开关：决定评估跑哪些指标（无 gold chunks 算不了 P/R/F1，无 gold answer 算不了 Judge）
    has_gold_chunks: Mapped[bool] = mapped_column(Boolean, default=False, comment='是否标注了相关分块')
    has_gold_answers: Mapped[bool] = mapped_column(Boolean, default=False, comment='是否标注了参考答案')
    build_metadata: Mapped[dict] = mapped_column(JSON, default=dict, comment='构建元信息（来源/采样参数/模型 spec）')
    created_by: Mapped[str | None] = mapped_column(Text, nullable=True, comment='创建者 uid')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
    updated_time: Mapped[datetime | None] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间'
    )


class EvalDatasetItem(MappedBase):
    """评估数据集题目（一问 + 可选的标注分块与参考答案）"""

    __tablename__ = 'eval_dataset_items'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.UniqueConstraint('dataset_id', 'item_index', name='uq_eval_dataset_items_dataset_index'),
        sa.Index('idx_eval_dataset_items_dataset', 'dataset_id'),
        {'comment': '评估数据集题目'},
    )

    item_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='题目 ID')
    dataset_id: Mapped[str] = mapped_column(
        Text,
        sa.ForeignKey('eval_datasets.dataset_id', ondelete='CASCADE'),
        comment='所属数据集',
    )
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    kb_name: Mapped[str] = mapped_column(Text, comment='所属知识库')
    item_index: Mapped[int] = mapped_column(BigInteger, default=0, comment='数据集内序号（稳定排序）')
    query_text: Mapped[str] = mapped_column(Text, comment='问题')
    gold_chunk_ids: Mapped[list] = mapped_column(JSON, default=list, comment='标注的相关分块 ID')
    gold_answer: Mapped[str | None] = mapped_column(Text, nullable=True, comment='参考答案（LLM Judge 判据）')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
