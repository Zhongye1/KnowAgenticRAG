"""MCP 调用日志表（agent-layer spec M10/D33）。

审计维度 ``sub × kb × action × query``：调用人(sub/tenant)、工具、kb/document、
query 摘要、结果码与耗时。参数摘要不落全量 claims、history 或文件内容（PII
最小化）；落库失败不阻断 JSON-RPC（见 ``backend.src.app.mcp.call_log``）。
"""

from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import DataClassBase, TimeZone, UniversalText, id_key
from backend.src.utils.timezone import timezone


class McpCallLog(DataClassBase):
    """MCP 调用日志"""

    __tablename__ = 'mcp_call_log'  # type: ignore[reportAssignmentType]

    id: Mapped[id_key] = mapped_column(init=False)
    method: Mapped[str] = mapped_column(sa.String(32), comment='JSON-RPC 方法')
    tool_name: Mapped[str | None] = mapped_column(sa.String(64), comment='工具名')
    user_sub: Mapped[str] = mapped_column(sa.String(128), comment='调用方身份（user:/pat）')
    tenant: Mapped[str] = mapped_column(sa.String(64), comment='租户/域（MCP 层收口的授权边界）')
    kb_name: Mapped[str | None] = mapped_column(sa.String(100), comment='知识库标识')
    document_id: Mapped[str | None] = mapped_column(sa.String(255), comment='文档 ID（定位类工具）')
    query_text: Mapped[str | None] = mapped_column(UniversalText, comment='检索/问答文本（审计用）')
    total_tokens: Mapped[int | None] = mapped_column(sa.BigInteger, comment='生成 token 用量（answer 类工具）')
    status: Mapped[int] = mapped_column(comment='调用状态（0异常 1正常）')
    code: Mapped[str] = mapped_column(
        sa.String(32), insert_default='SUCCESS', comment='结果码（SUCCESS / 稳定 data.code）'
    )
    msg: Mapped[str | None] = mapped_column(UniversalText, comment='错误消息')
    cost_time: Mapped[float] = mapped_column(insert_default=0.0, comment='调用耗时（毫秒）')
    created_time: Mapped[datetime] = mapped_column(
        TimeZone, init=False, default_factory=timezone.now, comment='创建时间'
    )
