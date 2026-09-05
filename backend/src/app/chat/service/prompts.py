"""chat 提示词与上下文组装纯函数（D18/M9：无 IO，单测直接覆盖）。"""

from __future__ import annotations

import math

from typing import Any

SYSTEM_PROMPT = (
    '你是一个基于企业私有知识库的研发知识助手。请严格依据下方「检索片段」回答用户问题：\n'
    '- 只使用片段中的信息作答；片段不足以回答时明确说明，不要编造。\n'
    '- 回答中需要引用片段时用 [n] 标注（n 为片段编号），编号对应检索片段列表。\n'
    '- 面向工程师：可归纳版本差异、兼容性说明等要点，并保留出处可溯源。'
)
EMPTY_RESULT_MESSAGE = '未检索到与问题相关的知识库内容。请换一种问法，或确认该知识库已收录相关文档。'
CONTEXT_BLOCK_OVERHEAD_TOKENS = 40


def estimate_tokens(text: str) -> int:
    """粗估 token：ASCII 约 4 字符/token、CJK 等宽字符约 1 字符/token。"""
    ascii_chars = sum(1 for ch in text if ord(ch) < 128)
    wide_chars = len(text) - ascii_chars
    return max(1, math.ceil(ascii_chars / 4) + wide_chars)


def _block_text(citation: dict[str, Any]) -> str:
    source = str(citation.get('source') or citation.get('document_id') or '')
    version = int(citation.get('version_id') or 1)
    content = str(citation.get('content') or '')
    return f'【片段{citation["n"]}】（来源：{citation.get("kb_name")}/{source}，版本 {version}）\n{content}'


def truncate_citations(citations: list[dict[str, Any]], budget_tokens: int) -> tuple[list[dict[str, Any]], int]:
    """按 token 预算裁剪上下文；返回 (保留片段, 丢弃条数)。"""
    kept: list[dict[str, Any]] = []
    total = 0
    for citation in citations:
        cost = estimate_tokens(_block_text(citation)) + CONTEXT_BLOCK_OVERHEAD_TOKENS
        if kept and total + cost > budget_tokens:
            break
        kept.append(citation)
        total += cost
    return kept, len(citations) - len(kept)


def build_context_text(citations: list[dict[str, Any]]) -> str:
    """把保留片段组装为上下文块（含来源与版本）。"""
    return '\n\n'.join(_block_text(citation) for citation in citations)


def build_system_prompt(context_text: str) -> str:
    """系统提示词 = 行为约束 + 检索片段上下文。"""
    if not context_text:
        return SYSTEM_PROMPT
    return f'{SYSTEM_PROMPT}\n\n检索片段：\n{context_text}'


def build_messages(
    *,
    query_text: str,
    context_text: str,
    history: list[dict[str, str]] | None = None,
    history_rounds: int = 10,
) -> list[dict[str, str]]:
    """组装 LLM 消息：system(含上下文) + 近 N 轮历史 + 当前问题。"""
    messages: list[dict[str, str]] = [{'role': 'system', 'content': build_system_prompt(context_text)}]
    for item in (history or [])[-max(1, history_rounds) * 2 :]:
        role = item.get('role')
        content = item.get('content')
        if role in {'user', 'assistant', 'system'} and content:
            messages.append({'role': role, 'content': content})
    messages.append({'role': 'user', 'content': query_text})
    return messages
