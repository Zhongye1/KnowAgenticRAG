"""评估运行模型（RAG 清单 Phase 4 / D61，参照 Yuxi ``models_knowledge.py``）。

``EvalRun`` 是**一次评估**（数据集 × 检索配置 × Judge 模型），``EvalRunItem`` 是逐题
结果。检索指标（P/R/F1@K）与答案指标（LLM Judge）都落在 item 的 ``metrics`` JSON 上，
run 的 ``metrics`` 存聚合值——保留逐题明细使"某题为什么变差"可回答。
"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import JSON, BigInteger, Float, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone

__all__ = ['EVAL_RUN_TERMINAL_STATUSES', 'EvalRun', 'EvalRunItem']

# 终态：到了这两个状态就不应再有 worker 写入（与 ingest 的状态机同思路）
EVAL_RUN_TERMINAL_STATUSES = frozenset({'completed', 'failed'})


class EvalRun(MappedBase):
    """一次评估运行（数据集 + 检索配置 + Judge 模型）"""

    __tablename__ = 'eval_runs'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_eval_runs_ns_kb', 'plugin_namespace', 'kb_name'),
        sa.Index('idx_eval_runs_status', 'status'),
        {'comment': '评估运行（一次评估 = 数据集 × 检索配置 × Judge 模型）'},
    )

    run_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='运行 ID')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    kb_name: Mapped[str] = mapped_column(Text, comment='被评估的知识库')
    dataset_id: Mapped[str | None] = mapped_column(
        Text,
        sa.ForeignKey('eval_datasets.dataset_id', ondelete='SET NULL'),
        nullable=True,
        comment='数据集 ID（数据集删除后保留运行记录，故 SET NULL）',
    )
    name: Mapped[str] = mapped_column(Text, default='', comment='运行名称')
    status: Mapped[str] = mapped_column(Text, default='pending', comment='状态（pending/running/completed/failed）')
    # 评估配置快照：改检索参数后重跑可对比，配置必须随 run 冻结，不能读"当前值"
    retrieval_config: Mapped[dict] = mapped_column(JSON, default=dict, comment='检索参数快照')
    judge_spec: Mapped[str] = mapped_column(Text, default='', comment='Judge 模型 spec（空=只算检索指标）')
    metrics: Mapped[dict] = mapped_column(JSON, default=dict, comment='聚合指标')
    overall_score: Mapped[float | None] = mapped_column(Float, nullable=True, comment='综合得分')
    total_items: Mapped[int] = mapped_column(Integer, default=0, comment='题目总数')
    completed_items: Mapped[int] = mapped_column(Integer, default=0, comment='已完成题数（进度）')
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True, comment='失败原因')
    created_by: Mapped[str | None] = mapped_column(Text, nullable=True, comment='发起者 uid')
    started_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='开始时间')
    completed_time: Mapped[datetime | None] = mapped_column(TimeZone, nullable=True, comment='完成时间')


class EvalRunItem(MappedBase):
    """评估逐题结果（生成的答案、召回命中与逐题指标都留档）"""

    __tablename__ = 'eval_run_items'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.UniqueConstraint('run_id', 'item_index', name='uq_eval_run_items_run_index'),
        sa.Index('idx_eval_run_items_run', 'run_id'),
        {'comment': '评估逐题结果'},
    )

    result_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='结果 ID（{run_id}:{item_index}）')
    run_id: Mapped[str] = mapped_column(
        Text,
        sa.ForeignKey('eval_runs.run_id', ondelete='CASCADE'),
        comment='所属运行',
    )
    dataset_item_id: Mapped[str | None] = mapped_column(Text, nullable=True, comment='来源题目 ID')
    # 租户列冗余存：使逐题结果可按域直接清理/统计，不必回连 eval_runs；
    # ``kb_name`` 不冗余——它由 run 唯一决定，重复存会造出「两处事实」
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    item_index: Mapped[int] = mapped_column(BigInteger, default=0, comment='运行内序号')
    query_text: Mapped[str] = mapped_column(Text, comment='问题快照（数据集变更后仍可读）')
    gold_chunk_ids: Mapped[list] = mapped_column(JSON, default=list, comment='标注分块快照')
    gold_answer: Mapped[str | None] = mapped_column(Text, nullable=True, comment='参考答案快照')
    generated_answer: Mapped[str | None] = mapped_column(Text, nullable=True, comment='线上链路生成的答案')
    retrieved_chunk_ids: Mapped[list] = mapped_column(JSON, default=list, comment='本次实际召回的 chunk_id 序')
    citations: Mapped[list] = mapped_column(JSON, default=list, comment='引用快照（含来源/分数）')
    usage: Mapped[dict] = mapped_column(JSON, default=dict, comment='token 用量')
    metrics: Mapped[dict] = mapped_column(JSON, default=dict, comment='逐题指标（检索 + 答案）')
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True, comment='本题失败原因')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
