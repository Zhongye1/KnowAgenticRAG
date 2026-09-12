"""Agent 运行审计模型（agentic-rag spec D40 / 1.11）。

D40：首版不引入 LangGraph checkpointer，Agent 为单次运行（stateless）；
运行审计落本表即可满足「谁在什么时候问了什么、走了多少步、改写了没有」。

写入是 **best-effort**（见 ``agent/service/run_log.py``）：审计失败只告警，
不影响问答响应——与 ``mcp_call_log`` 同一约定。
"""

from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import JSON, BigInteger, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone, UniversalText
from backend.src.utils.timezone import timezone


class AgentRun(MappedBase):
    """一次 Agent 运行的审计行（不可变，仅追加）。

    ``steps`` 与 ``usage`` 为 JSON 快照：前者是 D25 ``step`` 事件序列
    （plan/act/grade/rewrite/generate），后者是 token 用量。状态取值：

    - ``ok``：跑完且检索有命中；
    - ``empty``：跑完但无命中（done.reason = empty_result）；
    - ``error``：图/模型/权限错误（error 事件）；
    - ``cancelled``：客户端中断或超时，未产出 done。
    """

    __tablename__ = 'agent_runs'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_agent_runs_namespace', 'plugin_namespace'),
        sa.Index('idx_agent_runs_status', 'status'),
        sa.Index('idx_agent_runs_created', 'created_time'),
        {'comment': 'Agent 运行审计表'},
    )

    run_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='运行 ID（UUID）')
    kb_names: Mapped[list] = mapped_column(JSON, default=list, comment='本次问答覆盖的知识库')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    query: Mapped[str] = mapped_column(UniversalText, comment='原始问句（截断留存）')
    status: Mapped[str] = mapped_column(Text, default='ok', comment='结果（ok/empty/error/cancelled）')
    model_spec: Mapped[str | None] = mapped_column(Text, nullable=True, comment='实际生效模型 spec')
    steps: Mapped[list] = mapped_column(JSON, default=list, comment='过程轨迹（D25 step 事件序列）')
    tool_call_count: Mapped[int] = mapped_column(BigInteger, default=0, comment='内层工具循环调用次数')
    rewrite_count: Mapped[int] = mapped_column(BigInteger, default=0, comment='T3 自省改写次数')
    usage: Mapped[dict] = mapped_column(JSON, default=dict, comment='token 用量')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
