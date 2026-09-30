"""Agent Run 的 attempt 归属（agent 层设计 §4.1 / D87–D92）。

**解决什么问题**：Celery 在 worker 崩溃/网络抖动时会**重复投递**同一任务。
若不加约束，两个 worker 会同时执行同一个 Run——既浪费模型配额，又会让状态机
被两个写入者互相覆盖。做法是给每次执行发一个 attempt 号，并在
``(run_id, attempt_no)`` 上建唯一约束：**重复投递在插入 attempt 时就被数据库拒绝**，
而不是靠应用层的概率性判重。

租约是 attempt 的时间约束（见 ``agent_runs.lease_expires_at``）：attempt 存续期间
worker 必须续租，否则该 attempt 被判定为 ``lost``，由对账任务幂等收敛为 ``failed``。
"""

from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import BigInteger, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone

#: attempt 终态：running 执行中 / succeeded 正常结束 / failed 失败 / lost 租约丢失
AGENT_RUN_ATTEMPT_STATUSES: tuple[str, ...] = ('running', 'succeeded', 'failed', 'lost')


class AgentRunAttempt(MappedBase):
    """attempt 归属表：一行 = 某个 Run 的第 N 次执行尝试。"""

    __tablename__ = 'agent_run_attempts'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        UniqueConstraint('run_id', 'attempt_no', name='uq_agent_run_attempts_run_no'),
        sa.Index('idx_agent_run_attempts_worker', 'worker_id'),
        {'comment': 'Agent Run attempt 归属表（防重复投递双跑）'},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True, comment='主键')
    run_id: Mapped[str] = mapped_column(Text, comment='Run ID（UUID）')
    attempt_no: Mapped[int] = mapped_column(BigInteger, default=1, comment='第几次尝试（从 1 起）')
    worker_id: Mapped[str] = mapped_column(Text, comment='执行该 attempt 的 worker 标识')
    status: Mapped[str] = mapped_column(
        Text, default='running', comment='状态：' + '/'.join(AGENT_RUN_ATTEMPT_STATUSES)
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True, comment='失败原因')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
    updated_time: Mapped[datetime] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间'
    )
