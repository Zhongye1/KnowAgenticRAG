"""MCP 调用审计写入（agent-layer spec M10/D33）。

``tools/call`` 每次执行后 best-effort 落库：调用人(sub/tenant)、工具、
kb/document、query（审计维度 sub × kb × action × query）、结果码与耗时；
落库失败只告警，不阻断 JSON-RPC 响应。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.src.app.mcp.model.mcp_call_log import McpCallLog
from backend.src.common.log import log

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from backend.src.app.mcp.schemas import UserContext

__all__ = ['QUERY_TEXT_MAX', 'build_call_log_fields', 'record_call_log']

# 与 SearchArgs/AnswerArgs 的 query_text 上限一致，同时约束审计列体积
QUERY_TEXT_MAX = 2000


def _text(value: Any) -> str | None:
    """参数摘要取值：丢弃结构化对象，仅保留定位/查询类文本并截断。"""
    if value is None or isinstance(value, (dict, list)):
        return None
    text = str(value).strip()
    return text[:QUERY_TEXT_MAX] if text else None


def build_call_log_fields(
    *,
    method: str,
    tool_name: str | None,
    user: UserContext,
    args: dict[str, Any] | None,
    code: str,
    msg: str | None = None,
    cost_time: float = 0.0,
    total_tokens: int | None = None,
) -> dict[str, Any]:
    """构造审计字段：只取定位/查询字段，不落全量 claims、history 或文件内容。"""
    raw = dict(args or {})
    return {
        'method': method,
        'tool_name': tool_name,
        'user_sub': user.sub,
        'tenant': user.tenant,
        'kb_name': _text(raw.get('kb_name')),
        'document_id': _text(raw.get('document_id')),
        'query_text': _text(raw.get('query_text')),
        'total_tokens': total_tokens,
        'status': 1 if code == 'SUCCESS' else 0,
        'code': code,
        'msg': msg,
        'cost_time': cost_time,
    }


async def record_call_log(db: AsyncSession, **fields: Any) -> None:
    """Best-effort 落库：失败仅告警，不影响 MCP 响应。"""
    try:
        db.add(McpCallLog(**fields))
        await db.commit()
    except Exception as exc:
        log.warning(
            'mcp 调用日志落库失败 method={} tool={} err={}',
            fields.get('method'),
            fields.get('tool_name'),
            exc,
        )
        try:
            await db.rollback()
        except Exception:
            log.warning('mcp 调用日志回滚失败 method={}', fields.get('method'))
