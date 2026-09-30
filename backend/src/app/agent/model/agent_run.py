"""Agent 运行状态机模型（agent 层设计 D87–D92）。

**语义已变**：本表原先只是「请求结束后的 best-effort 终态审计」（agentic-rag spec
D40/1.11），现在它是 **Run 的事实源**——状态、租约、归属、终态全部落在这里，
Celery 只负责投递。因此写入**不再是 best-effort**：状态流转失败即运行失败。

八态（③ D70，沿用 Yuxi 七态 + 自研 ``waiting_ingest``）：

- ``queued``：已提交，等待 worker 取单（队列表 ``agent_run_request`` 定序）；
- ``running``：已被某 worker 取走租约并执行；
- ``waiting_ingest``：等文档索引完成（本表新增态，Yuxi 无此场景）；
- ``interrupted``：被中断（等人工审批），由 resume 起新 Run 续跑（D71）；
- ``cancel_requested``：收到取消请求，等待 worker 收敛；
- ``cancelled``：取消完成；
- ``completed``：正常跑完；
- ``failed``：图/模型/权限错误，或租约过期被幂等收敛。

与 ``agent_run_attempt`` 的分工：本表是「一次运行」，attempt 表是「谁在跑第几次」——
重复投递靠 attempt 的唯一约束拒绝，租约过期靠 ``lease_expires_at`` 判定。
"""

from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import JSON, BigInteger, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone, UniversalText
from backend.src.utils.timezone import timezone

#: 八态取值（供服务层与迁移脚本共用，避免散落字符串）
AGENT_RUN_STATUSES: tuple[str, ...] = (
    'queued',
    'running',
    'waiting_ingest',
    'interrupted',
    'cancel_requested',
    'cancelled',
    'completed',
    'failed',
)

#: 终态（到达后不再流转）
AGENT_RUN_TERMINAL_STATUSES: tuple[str, ...] = ('cancelled', 'completed', 'failed')


class AgentRun(MappedBase):
    """一次 Agent 运行（状态机 + 审计 + 用量）。"""

    __tablename__ = 'agent_runs'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_agent_runs_namespace', 'plugin_namespace'),
        sa.Index('idx_agent_runs_status', 'status'),
        sa.Index('idx_agent_runs_created', 'created_time'),
        # 租约扫描（reconcile_waiting / 过期收敛）按此索引
        sa.Index('idx_agent_runs_lease', 'status', 'lease_expires_at'),
        sa.Index('idx_agent_runs_parent', 'parent_run_id'),
        {'comment': 'Agent 运行状态机 + 审计表'},
    )

    run_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='运行 ID（UUID）')
    kb_names: Mapped[list] = mapped_column(JSON, default=list, comment='本次问答覆盖的知识库')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    query: Mapped[str] = mapped_column(UniversalText, comment='原始问句（截断留存）')
    status: Mapped[str] = mapped_column(Text, default='queued', comment='八态：' + '/'.join(AGENT_RUN_STATUSES))
    model_spec: Mapped[str | None] = mapped_column(Text, nullable=True, comment='实际生效模型 spec')
    steps: Mapped[list] = mapped_column(JSON, default=list, comment='过程轨迹（D25 step 事件序列）')
    tool_call_count: Mapped[int] = mapped_column(BigInteger, default=0, comment='内层工具循环调用次数')
    rewrite_count: Mapped[int] = mapped_column(BigInteger, default=0, comment='T3 自省改写次数')
    usage: Mapped[dict] = mapped_column(JSON, default=dict, comment='token 用量')
    # --- 运行态字段（D87–D92）---
    worker_id: Mapped[str | None] = mapped_column(Text, nullable=True, comment='持租约的 worker 标识')
    heartbeat_at: Mapped[datetime | None] = mapped_column(TimeZone, nullable=True, comment='最近一次心跳时间')
    lease_expires_at: Mapped[datetime | None] = mapped_column(
        TimeZone, nullable=True, comment='租约到期时间（过期即视为 worker 失联）'
    )
    parent_run_id: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment='父 Run（审批/索引恢复起的新 Run 指向原 Run，D71）'
    )
    output_message_id: Mapped[str | None] = mapped_column(Text, nullable=True, comment='产出的助手消息 ID')
    error: Mapped[str | None] = mapped_column(Text, nullable=True, comment='失败原因（failed 时）')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
    updated_time: Mapped[datetime] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间（状态流转/心跳）'
    )
