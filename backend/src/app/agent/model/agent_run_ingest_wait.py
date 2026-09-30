"""Run ↔ 待索引文档的等待关系（agent 层设计 §4.1，D69 用）。

**场景**：智能体文档流是「附件上传 → 落隐式知识库的 documents 行 → 入队摄取 →
摄取完成回调 → 恢复 Run」。附件刚上传时文档还没 ``ready``，检索工具命中不到它，
此时 Run 不能报「无结果」，而应转入 ``waiting_ingest`` 挂起，等摄取完成事件再恢复。

**为什么单独建表**：等待关系是**多对多**的——一个 Run 可能等多个文档，一个文档
完成也可能唤醒多个 Run（同一附件被多处引用）。用 ``agent_runs`` 上的一个 JSON 列
表达会让「按文档反查等待中的 Run」变成全表扫描，而摄取回调恰恰是**按 document_id
反查**的。唯一约束 ``(run_id, document_id)`` 保证同一对关系只登记一次，
重复事件因此天然幂等（回调重放不会恢复两次）。
"""

from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import BigInteger, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone

#: 等待状态：waiting 等待中 / resolved 已就绪并恢复 / failed 索引失败 / timeout 对账超时
AGENT_RUN_INGEST_WAIT_STATUSES: tuple[str, ...] = ('waiting', 'resolved', 'failed', 'timeout')


class AgentRunIngestWait(MappedBase):
    """Run 等待文档索引完成的登记行。"""

    __tablename__ = 'agent_run_ingest_waits'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        UniqueConstraint('run_id', 'document_id', name='uq_agent_run_ingest_waits_run_doc'),
        # 摄取回调按 document_id 反查等待中的 Run——这是热路径，必须走索引
        sa.Index('idx_agent_run_ingest_waits_doc', 'document_id', 'status'),
        {'comment': 'Agent Run ↔ 待索引文档等待关系'},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True, comment='主键')
    run_id: Mapped[str] = mapped_column(Text, comment='等待中的 Run ID')
    document_id: Mapped[str] = mapped_column(Text, comment='被等待的文档 ID（documents.id）')
    kb_name: Mapped[str] = mapped_column(Text, comment='文档所属知识库')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    status: Mapped[str] = mapped_column(
        Text, default='waiting', comment='状态：' + '/'.join(AGENT_RUN_INGEST_WAIT_STATUSES)
    )
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='登记时间')
    resolved_time: Mapped[datetime | None] = mapped_column(TimeZone, nullable=True, comment='恢复/失败时间')
