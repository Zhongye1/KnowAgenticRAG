"""生成节点（证据就绪 → 组装上下文 → 流式产出回答）。

D25 事件顺序在此节点闭环：``step* → meta → citation → delta* → usage``；
``done`` 由 ``stream_bridge.run_agent_stream`` 在图结束后按终态组装（自包含）。

无命中时不调用模型，直接以 ``EMPTY_RESULT_MESSAGE`` 短路（与 chat 域同文案、同
``reason='empty_result'``），既省成本也让前端两条链路的空态表现一致。

**护栏接线（agent 层设计 §4.2）**：本节点接两类——

- ``stall ≠ total``：按**分片间隔**判超时（不是总时长），持续输出但耗时长的一轮不会被误杀；
- 空回复重试：模型返回空且自然停止时重发，用尽后以兜底话术收尾。

**为什么另外两类不在这里接**：本节点是**流式**的——``delta`` 一经发出就无法撤回，
重试会让客户端看到重复文本。因此「截断」只记录不重发（保持 ``reason='max_tokens'``），
「同文重复」由外层 rewrite 预算封顶而不在此判定。两者留待需要时以**缓冲式生成**接管。
"""

from __future__ import annotations

import asyncio

from typing import Any

from backend.src.app.agent.graph.guards import RoundSignals, RoundTracker
from backend.src.app.agent.graph.state import (
    AgentState,  # ruff: ignore[typing-only-first-party-import]  # LangGraph 经 pydantic 解析节点签名注解
)
from backend.src.app.agent.graph.stream_bridge import emit_citation, emit_delta, emit_meta, emit_step, emit_usage
from backend.src.app.chat.service.chat_service import build_citations
from backend.src.app.chat.service.prompts import (
    EMPTY_RESULT_MESSAGE,
    build_attachments_text,
    build_context_text,
    build_messages,
    truncate_citations,
)
from backend.src.common.log import log
from backend.src.core.config import settings

__all__ = ['make_generate_node']

#: 无输出兜底：重试用尽后仍为空时交付（对齐 WeKnora 的 stalled fallback——宁可说清
#: 发生了什么，也不要交付一条空消息）
STALLED_ANSWER_FALLBACK = '抱歉，本次未能生成有效回答，请重试。'


def _chunk_text(chunk: Any) -> str:
    """从流式分片中取纯文本（兼容 content 为字符串或 content blocks 列表）。"""
    content = getattr(chunk, 'content', None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [
            str(block.get('text') or '') for block in content if isinstance(block, dict) and block.get('type') == 'text'
        ]
        return ''.join(parts)
    return ''


def _usage_from(chunk: Any) -> dict[str, int] | None:
    """把 LangChain 的 usage_metadata 归一为 D25 usage 形状。"""
    meta = getattr(chunk, 'usage_metadata', None)
    if not isinstance(meta, dict):
        return None
    return {
        'prompt_tokens': int(meta.get('input_tokens') or 0),
        'completion_tokens': int(meta.get('output_tokens') or 0),
        'total_tokens': int(meta.get('total_tokens') or 0),
    }


async def _stream_once(
    model: Any,
    messages: list[Any],
    *,
    temperature: float | None,
    max_tokens: int | None,
    thinking_level: str | None,
    stall_seconds: float,
) -> tuple[list[str], dict[str, int] | None, str | None, bool]:
    """跑一轮流式生成，返回 ``(分片, usage, finish_reason, 是否 stall)``。

    **stall ≠ total**：等待的是**下一个分片**，不是整轮总时长——只要持续有输出，
    一轮可以跑任意久（长回答、大工具结果），这与「总墙钟」是两笔预算。
    """
    parts: list[str] = []
    usage: dict[str, int] | None = None
    finish_reason: str | None = None
    stream = model.astream(
        messages,
        temperature=temperature,
        max_tokens=max_tokens,
        **({'thinking_level': thinking_level} if thinking_level else {}),
    ).__aiter__()
    while True:
        try:
            chunk = await asyncio.wait_for(anext(stream), timeout=max(1.0, stall_seconds))
        except StopAsyncIteration:
            return parts, usage, finish_reason, False
        except TimeoutError:
            log.warning('agent 生成 stall：连续 {}s 无输出，终止本轮', stall_seconds)
            return parts, usage, finish_reason, True
        text = _chunk_text(chunk)
        if text:
            parts.append(text)
            emit_delta(text)
        usage = _usage_from(chunk) or usage
        finish_reason = getattr(chunk, 'response_metadata', {}).get('finish_reason') or finish_reason


def make_generate_node(
    *,
    model: Any,
    kb_names: list[str],
    model_spec: str = '',
    context_max_tokens: int = 4096,
    history: list[dict[str, str]] | None = None,
    attachments: list[dict[str, Any]] | None = None,
    history_rounds: int = 10,
    temperature: float | None = None,
    max_tokens: int | None = None,
    thinking_level: str | None = None,
    tracker: RoundTracker | None = None,
) -> Any:
    """构造生成节点（模型与请求级参数在构建期注入；图按请求构建）。"""

    async def generate_node(state: AgentState) -> dict[str, Any]:
        hits = list(state.get('hits') or [])
        visual_items = list(state.get('visual_items') or [])
        retrieval = state.get('retrieval') or {}
        kb_label = str(state.get('kb_name') or (kb_names[0] if kb_names else ''))
        citations = build_citations(kb_label, hits)
        emit_meta({
            'kb_name': kb_label,
            'mode': str(retrieval.get('mode') or 'hybrid'),
            'model_spec': model_spec,
            'hit_count': len(hits),
            'visual_count': len(visual_items),
        })

        if not citations:
            step = emit_step('generate', '无命中，短路回答')
            emit_citation([], visual_items)
            emit_delta(EMPTY_RESULT_MESSAGE)
            emit_usage(None)
            return {
                'answer': EMPTY_RESULT_MESSAGE,
                'reason': 'empty_result',
                'citations': [],
                'model_spec': model_spec,
                'usage': {},
                'steps': [step],
            }

        kept, dropped = truncate_citations(citations, int(context_max_tokens))
        # step 先于 meta/citation/delta 发出：D25 约定「step 描述系统在做什么」，
        # 客户端据此在首 token 前渲染进度（generate 是最后一站，紧随 grade/rewrite）
        step = emit_step('generate', f'{len(kept)} 条引用，开始生成回答')
        emit_citation(kept, visual_items)
        log.debug('agent 生成上下文 kept={} dropped={}', len(kept), dropped)

        messages = build_messages(
            query_text=str(state.get('query') or ''),
            context_text=build_context_text(kept),
            history=history,
            history_rounds=history_rounds,
            attachments_text=build_attachments_text(attachments),
        )
        parts: list[str] = []
        usage: dict[str, int] | None = None
        finish_reason: str | None = None
        stalled = False
        reason = 'complete'
        guard = tracker or RoundTracker(empty_retries=int(settings.RAGF_AGENT_EMPTY_RETRIES))
        stall_seconds = float(settings.RAGF_AGENT_STALL_SECONDS)
        for attempt in range(int(settings.RAGF_AGENT_EMPTY_RETRIES) + 1):
            parts, usage, finish_reason, stalled = await _stream_once(
                model,
                messages,
                temperature=temperature,
                max_tokens=max_tokens,
                thinking_level=thinking_level,
                stall_seconds=stall_seconds,
            )
            if stalled:
                reason = 'stalled'
                break
            signals = RoundSignals(answer=''.join(parts), finish_reason=finish_reason)
            decision = guard.observe(signals)
            if decision.action == 'continue':
                break
            # 已有可交付文本时**不能重试**：delta 已发给客户端，重发会出现重复文本。
            # 故只对「空回复」走重试（无文本发出 → 安全），其余按终止处理。
            if decision.action == 'abort' or signals.answer.strip():
                reason = 'max_tokens' if signals.truncated else decision.reason
                break
            log.warning('agent 生成为空，安全重试 attempt={} / 上限 {}', attempt + 1, settings.RAGF_AGENT_EMPTY_RETRIES)

        answer = ''.join(parts)
        if not answer.strip():
            # 无任何可交付文本（stall 或空回复用尽）：给兜底话术，不交付空消息
            answer = STALLED_ANSWER_FALLBACK
            reason = reason if reason != 'complete' else 'empty_answer'
            emit_delta(answer)

        emit_usage(usage)
        return {
            'answer': answer,
            'reason': reason,
            'finish_reason': finish_reason,
            'citations': kept,
            'model_spec': model_spec,
            'usage': usage or {},
            'steps': [step],
        }

    return generate_node
