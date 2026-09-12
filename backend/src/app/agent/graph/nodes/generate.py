"""生成节点（证据就绪 → 组装上下文 → 流式产出回答）。

D25 事件顺序在此节点闭环：``step* → meta → citation → delta* → usage``；
``done`` 由 ``stream_bridge.run_agent_stream`` 在图结束后按终态组装（自包含）。

无命中时不调用模型，直接以 ``EMPTY_RESULT_MESSAGE`` 短路（与 chat 域同文案、同
``reason='empty_result'``），既省成本也让前端两条链路的空态表现一致。
"""

from __future__ import annotations

from typing import Any

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

__all__ = ['make_generate_node']


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
        try:
            async for chunk in model.astream(
                messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **({'thinking_level': thinking_level} if thinking_level else {}),
            ):
                text = _chunk_text(chunk)
                if text:
                    parts.append(text)
                    emit_delta(text)
                usage = _usage_from(chunk) or usage
                finish_reason = getattr(chunk, 'response_metadata', {}).get('finish_reason') or finish_reason
        except Exception as exc:
            log.warning('agent 生成失败 err={}', exc)
            raise

        emit_usage(usage)
        return {
            'answer': ''.join(parts),
            'reason': 'max_tokens' if finish_reason == 'length' else 'complete',
            'finish_reason': finish_reason,
            'citations': kept,
            'model_spec': model_spec,
            'usage': usage or {},
            'steps': [step],
        }

    return generate_node
