"""Agent 运行审计写入（agentic-rag spec D40 / 1.11）。

单次运行结束后 best-effort 落 ``agent_runs``：问句、知识库、状态、轨迹步数、
工具调用/改写计数与 token 用量。落库失败只告警，不阻断 SSE/REST 响应
（与 ``mcp/call_log.py`` 同一约定）。

行内不落模型回答正文与引用内容：审计只回答「谁问过什么、系统怎么跑的」，
正文与引用已在对话/检索侧有归属，重复留存会放大 PII 面。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import uuid4

from backend.src.app.agent.model.agent_run import AgentRun
from backend.src.common.log import log

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['RUN_QUERY_MAX', 'build_run_fields', 'new_run_id', 'record_agent_run']

# 与 ChatParam.query_text / mcp QUERY_TEXT_MAX 一致，约束审计列体积
RUN_QUERY_MAX = 2000

# done.reason → status（无 done 时由调用方给 error/cancelled）
_REASON_STATUS = {'empty_result': 'empty', 'complete': 'ok', 'max_tokens': 'ok'}


def new_run_id() -> str:
    """运行 ID（UUID4 字符串；与 LangGraph 的 thread/checkpoint 无关，D40 无状态）。"""
    return str(uuid4())


def status_for(*, done: dict[str, Any] | None, outcome: str) -> str:
    """终态 → 审计状态：有 done 看 done.reason，无 done 沿用事件流结果。"""
    if not done:
        # 无 done：error 事件已流过 → error；否则是客户端中断/超时（有 meta 无 done）
        return 'error' if outcome == 'error' else 'cancelled'
    reason = str(done.get('reason') or '')
    return _REASON_STATUS.get(reason, 'ok')


def build_run_fields(
    *,
    run_id: str,
    kb_names: list[str],
    plugin_namespace: str | None,
    query: str,
    status: str,
    steps: list[dict[str, Any]] | None = None,
    usage: dict[str, Any] | None = None,
    model_spec: str | None = None,
    tool_calls: int = 0,
    rewrites: int = 0,
) -> dict[str, Any]:
    """构造审计字段（纯函数，便于单测）：只保留标量/JSON 快照，截断问句。"""
    text = str(query or '').strip()
    return {
        'run_id': run_id,
        'kb_names': [str(item) for item in kb_names],
        'plugin_namespace': str(plugin_namespace or 'core'),
        'query': text[:RUN_QUERY_MAX],
        'status': str(status),
        'model_spec': str(model_spec) if model_spec else None,
        'steps': list(steps or []),
        'tool_call_count': max(0, int(tool_calls)),
        'rewrite_count': max(0, int(rewrites)),
        'usage': dict(usage or {}),
    }


async def record_agent_run(db: AsyncSession, **fields: Any) -> None:
    """Best-effort 落库：失败仅告警，不影响 Agent 响应。"""
    try:
        db.add(AgentRun(**fields))
        await db.commit()
    except Exception as exc:
        log.warning('agent 运行审计落库失败 run_id={} err={}', fields.get('run_id'), exc)
        try:
            await db.rollback()
        except Exception:
            log.warning('agent 运行审计回滚失败 run_id={}', fields.get('run_id'))
