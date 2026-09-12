"""LangGraph 流式事件 → D25 事件桥（agentic-rag spec D38 / §7 红线 1）。

职责边界：本模块是 agent 域内**唯一**允许 import LangGraph 流式 API 的地方。
service 层以上只消费 ``(event_name, payload)`` 的 D25 事件元组——与 chat 域
``ChatEvent`` 同构，前端无需为 Agent 写第二套解析器。

两层词汇表：

1. **信封**（``_ENVELOPE_*``）：图节点经本模块的 ``emit_*`` 助手发出的中立结构，
   节点因此也不直接依赖 LangGraph（``emit_*`` 已封装 ``get_stream_writer``）。
2. **D25 事件**：``translate`` 把信封映射为 ``step/meta/citation/delta/usage``，
   ``build_done_payload`` 把终态映射为自包含 ``done``。

图外调用 ``emit_*`` 是安全的空操作（``get_stream_writer`` 在运行上下文外抛
``RuntimeError``），节点可脱离图单独单测。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langgraph.config import get_stream_writer

from backend.src.common.log import log

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Callable

__all__ = [
    'AgentEvent',
    'build_done_payload',
    'emit_citation',
    'emit_delta',
    'emit_meta',
    'emit_step',
    'emit_usage',
    'run_agent_stream',
    'translate',
]

AgentEvent = tuple[str, dict[str, Any]]

# 信封 type（节点侧中立词汇，不掺 D25 常量）
_TYPE = 'type'
_STEP = 'step'
_META = 'meta'
_CITATION = 'citation'
_DELTA = 'delta'
_USAGE = 'usage'


def _writer() -> Callable[[Any], None] | None:
    """取当前图运行的 StreamWriter；图外返回 None（节点可独立单测）。"""
    try:
        return get_stream_writer()
    except RuntimeError:
        return None


def _emit(envelope: dict[str, Any]) -> None:
    if (writer := _writer()) is not None:
        writer(envelope)


def emit_step(name: str, detail: str = '') -> dict[str, str]:
    """发 ``step`` 事件，并返回可并入 state.steps 的同构条目（避免两处重复描述）。"""
    item = {'name': str(name), 'detail': str(detail)}
    _emit({_TYPE: _STEP, 'name': item['name'], 'detail': item['detail']})
    return item


def emit_meta(payload: dict[str, Any]) -> None:
    """发 ``meta`` 事件（检索就绪后、生成之前）。"""
    _emit({_TYPE: _META, 'payload': dict(payload)})


def emit_citation(citations: list[dict[str, Any]], images: list[dict[str, Any]] | None = None) -> None:
    """发 ``citation`` 事件（D24 引用 + 视觉来源）。"""
    _emit({_TYPE: _CITATION, 'citations': list(citations), 'images': list(images or [])})


def emit_delta(content: str) -> None:
    """发 ``delta`` 事件（模型增量；空串不发）。"""
    if content:
        _emit({_TYPE: _DELTA, 'content': content})


def emit_usage(usage: dict[str, Any] | None) -> None:
    """发 ``usage`` 事件。"""
    _emit({_TYPE: _USAGE, 'usage': dict(usage or {})})


def _usage_payload(usage: dict[str, Any] | None) -> dict[str, int]:
    """usage 负载：缺省补 0（与 chat 域名同构）。"""
    if not usage:
        return {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    return {
        'prompt_tokens': int(usage.get('prompt_tokens') or 0),
        'completion_tokens': int(usage.get('completion_tokens') or 0),
        'total_tokens': int(usage.get('total_tokens') or 0),
    }


def translate(envelope: Any) -> AgentEvent | None:
    """信封 → D25 事件（纯函数）。未知/畸形信封返回 None（前向兼容）。"""
    if not isinstance(envelope, dict):
        return None
    kind = envelope.get(_TYPE)
    if kind == _STEP:
        return ('step', {'name': str(envelope.get('name') or ''), 'detail': str(envelope.get('detail') or '')})
    if kind == _META:
        return ('meta', dict(envelope.get('payload') or {}))
    if kind == _CITATION:
        return (
            'citation',
            {'citations': list(envelope.get('citations') or []), 'images': list(envelope.get('images') or [])},
        )
    if kind == _DELTA:
        content = str(envelope.get('content') or '')
        return ('delta', {'content': content}) if content else None
    if kind == _USAGE:
        return ('usage', _usage_payload(envelope.get('usage')))
    return None


def build_done_payload(state: dict[str, Any], *, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """终态 → 自包含 ``done`` 负载（聊天 ``done`` 的超集，增 ``agent`` 元数据）。

    客户端可只消费 ``done`` 重建完整响应（EagleRAG/D25 契约对齐）。
    引用与视觉来源随 ``done`` 一并送达，非流式响应因此可从同一事件序列还原。
    """
    retrieval = state.get('retrieval') or {}
    finish_reason = state.get('finish_reason')
    answer = str(state.get('answer') or '')
    reason = str(state.get('reason') or ('max_tokens' if finish_reason == 'length' else 'complete'))
    # T1 不检索路径没有检索层 route，这里补一个语义等价的占位，保证负载自洽
    route = dict(retrieval.get('route') or {})
    if not route:
        route = {
            'mode': str(retrieval.get('mode') or 'none'),
            'selected': [],
            'reason': 'plan: need_retrieval=false' if not retrieval else 'agent: 工具未产出检索路由',
            'kb_names': list(state.get('kb_names') or []),
        }
    return {
        'reason': reason,
        'answer': answer,
        'kb_name': str(state.get('kb_name') or ''),
        'kb_names': list(state.get('kb_names') or []),
        'mode': str(retrieval.get('mode') or route['mode']),
        'model_spec': str(state.get('model_spec') or ''),
        'hit_count': len(state.get('hits') or []),
        'visual_count': len(state.get('visual_items') or []),
        'citations': list(state.get('citations') or []),
        'images': list(state.get('visual_items') or []),
        'route': route,
        'steps': list(state.get('steps') or []),
        'usage': _usage_payload(state.get('usage')),
        'agent': {
            'need_retrieval': bool(state.get('need_retrieval', True)),
            'sub_queries': list(state.get('sub_queries') or []),
            'plan_rationale': str(state.get('plan_rationale') or ''),
            'grade_score': float(state.get('grade_score') or 0.0),
            'rewrites': int(state.get('rewrite_count') or 0),
            'tool_calls': int(state.get('tool_calls') or 0),
            **(extra or {}),
        },
    }


async def run_agent_stream(
    graph: Any,
    inputs: dict[str, Any],
    *,
    config: dict[str, Any] | None = None,
    extra_done: dict[str, Any] | None = None,
) -> AsyncIterator[AgentEvent]:
    """驱动图执行并直出 D25 事件序列（末尾必为 ``done``）。

    只用两种流模式，避免内层 ReAct 的中间 token 混入答案流：

    - ``custom``：节点经 ``emit_*`` 发出的信封 → ``translate``
    - ``values``：取最终态，用于组装自包含 ``done``
    """
    final_state: dict[str, Any] = {}
    async for mode, chunk in graph.astream(inputs, stream_mode=['custom', 'values'], config=config):
        if mode == 'custom':
            event = translate(chunk)
            if event is not None:
                yield event
        elif mode == 'values' and isinstance(chunk, dict):
            final_state = chunk
    log.debug('agent 图执行结束 state_keys={}', sorted(final_state))
    yield ('done', build_done_payload(final_state, extra=extra_done))
