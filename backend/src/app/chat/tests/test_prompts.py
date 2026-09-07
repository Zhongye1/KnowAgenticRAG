"""chat 提示词/上下文组装纯函数测试（M9：token 估算、引用裁剪、消息组装）。"""

from __future__ import annotations

from backend.src.app.chat.service.prompts import (
    EMPTY_RESULT_MESSAGE,
    build_attachments_text,
    build_context_text,
    build_messages,
    build_system_prompt,
    estimate_tokens,
    truncate_citations,
)


def _citation(n: int, content: str = '分块原文') -> dict[str, object]:
    return {
        'n': n,
        'kb_name': 'dev',
        'document_id': f'doc-{n}',
        'version_id': 2,
        'chunk_id': f'doc-{n}:2:0',
        'source': 'guide.md',
        'score': 0.9,
        'content': content,
    }


def test_estimate_tokens_ascii_and_wide() -> None:
    """token 粗估：ASCII ≈ 4 字符/token，CJK ≈ 1 字符/token。"""
    assert estimate_tokens('a' * 400) == 100
    assert estimate_tokens('知识库') == 3
    assert estimate_tokens('ab知识') == 1 + 2
    assert estimate_tokens('') >= 1


def test_truncate_citations_drops_tail_within_budget() -> None:
    """超预算时丢弃尾部片段，首条必留，返回丢弃条数。"""
    citations = [_citation(n) for n in range(1, 6)]
    kept, dropped = truncate_citations(citations, budget_tokens=1)
    assert [item['n'] for item in kept] == [1]
    assert dropped == 4


def test_truncate_citations_keeps_all_within_budget() -> None:
    citations = [_citation(n) for n in range(1, 4)]
    kept, dropped = truncate_citations(citations, budget_tokens=10_000)
    assert [item['n'] for item in kept] == [1, 2, 3]
    assert dropped == 0


def test_build_context_text_includes_source_and_version() -> None:
    context = build_context_text([_citation(1, '内容A'), _citation(2, '内容B')])
    assert '【片段1】' in context
    assert '来源：dev/guide.md，版本 2' in context
    assert '【片段2】' in context


def test_build_system_prompt_embeds_context() -> None:
    prompt = build_system_prompt('【片段1】（来源：dev/guide.md，版本 2）\n内容A')
    assert '检索片段：' in prompt
    assert '【片段1】' in prompt
    assert '不要编造' in prompt


def test_build_messages_trims_history_rounds_and_roles() -> None:
    history = [
        {'role': 'user', 'content': f'问题{i}'} if i % 2 == 0 else {'role': 'assistant', 'content': f'回答{i}'}
        for i in range(6)
    ]
    history.insert(1, {'role': 'tool', 'content': '不该进入'})
    messages = build_messages(query_text='当前问题', context_text='片段', history=history, history_rounds=2)
    assert messages[0]['role'] == 'system'
    assert messages[-1] == {'role': 'user', 'content': '当前问题'}
    assert len(messages) == 1 + 4 + 1  # system + 近 2 轮(4 条) + 当前问题
    assert all(item['role'] in {'user', 'assistant'} for item in messages[1:-1])


def test_build_messages_accepts_empty_history() -> None:
    messages = build_messages(query_text='问题', context_text='', history=None)
    assert len(messages) == 2
    assert messages[0]['role'] == 'system'


def test_build_messages_with_attachments_text() -> None:
    """随问附件块拼接到当前问题后；无附件时不追加。"""
    attachments = [{'filename': 'a.md', 'content': '附件内容'}, {'filename': 'b.txt', 'content': '第二个'}]
    text = build_attachments_text(attachments)
    assert '【附件1】（文件名：a.md）' in text
    assert '附件内容' in text
    assert '【附件2】' in text

    messages = build_messages(query_text='问题', context_text='', attachments_text=text)
    assert messages[-1]['content'].startswith('问题')
    assert '【附件1】' in messages[-1]['content']

    assert not build_attachments_text(None)
    assert not build_attachments_text([])
    plain = build_messages(query_text='问题', context_text='')
    assert plain[-1]['content'] == '问题'


def test_empty_result_message_defined() -> None:
    assert '未检索到' in EMPTY_RESULT_MESSAGE
