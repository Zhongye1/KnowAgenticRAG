"""Agent Run 的 FIFO 排队记录（agent 层设计 §4.1 / D87–D92）。

**为什么需要独立队列表**：并发提交要串行化——同一 ``(uid, agent_slug, thread_id)``
同时只能有一个活跃 Run；不同线程之间按提交先后公平调度。Redis 做分布式锁会在
多副本与重投递下丢语义，故队列的**事实源同样放 PG**，Redis 只做锁与唤醒。

排序键用 **自增主键**（``id``），而不是时间戳或 UUID：FIFO 需要一个全局单调、
不受时钟回拨影响的序，数据库序列是唯一可靠来源。``run_id`` 上建唯一索引——
一次 Run 只能有一条排队记录，重复提交由数据库拒绝而不是靠应用层判重。
"""

from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import BigInteger, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone

#: 排队记录状态：pending 等待派发 / dispatched 已投递 worker / done 已终态 / cancelled 撤销
AGENT_RUN_REQUEST_STATUSES: tuple[str, ...] = ('pending', 'dispatched', 'done', 'cancelled')


class AgentRunRequest(MappedBase):
    """FIFO 队列表：一行 = 一次 Run 的排队记录。"""

    __tablename__ = 'agent_run_requests'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('uq_agent_run_requests_run', 'run_id', unique=True),
        # 队头查询：同一排队键内按 id 升序取最小的一条
        sa.Index('idx_agent_run_requests_queue', 'uid', 'agent_slug', 'thread_id', 'status', 'id'),
        {'comment': 'Agent Run FIFO 队列表'},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True, comment='自增序（FIFO 排序键）')
    run_id: Mapped[str] = mapped_column(Text, comment='Run ID（UUID，唯一）')
    uid: Mapped[str] = mapped_column(Text, comment='提交用户 ID（排队键之一）')
    agent_slug: Mapped[str] = mapped_column(Text, default='default', comment='Agent 标识（排队键之一）')
    thread_id: Mapped[str | None] = mapped_column(Text, nullable=True, comment='会话线程标识（排队键之一）')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    status: Mapped[str] = mapped_column(
        Text, default='pending', comment='状态：' + '/'.join(AGENT_RUN_REQUEST_STATUSES)
    )
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='入队时间')
    updated_time: Mapped[datetime] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间'
    )
