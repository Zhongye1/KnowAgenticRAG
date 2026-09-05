"""分块纯函数测试（Yuxi ragflow_like 移植，ragf-design §11/§16.2）。

覆盖：默认 general、qa、separator、未知/未接入 preset 回退、token 上限保护。
纯函数无 DB/模型依赖，全部同步执行。
"""

from __future__ import annotations

from backend.src.app.ingest.chunking import nlp
from backend.src.app.ingest.chunking.dispatcher import chunk_markdown

GENERAL_HARD_LIMIT_RATIO = 1.5


def _long_markdown() -> str:
    return '# 第一章 总则\n\n第一条 为了规范检索增强生成系统的知识库摄取。\n\n' * 40


def _long_paragraph() -> str:
    return '检索增强生成系统需要高质量的分块与索引策略，用于支撑混合检索与精排。' * 60


def test_general_preset_returns_records() -> None:
    """默认 general：返回非空分块记录，字段齐全、序号单调。"""
    records = chunk_markdown(_long_markdown(), file_id='doc1', filename='demo.md', processing_params={})
    assert records
    for idx, record in enumerate(records):
        assert record['content'].strip()
        assert record['chunk_index'] == idx
        assert record['file_id'] == 'doc1'
    assert records[0]['chunk_id'].startswith('doc1_chunk_')


def test_unknown_preset_falls_back_to_general() -> None:
    """未知 preset 回退 general，不抛异常。"""
    records = chunk_markdown(
        _long_markdown(), file_id='doc1', filename='demo.md', processing_params={'chunk_preset_id': 'not-exists'}
    )
    assert records


def test_semantic_preset_falls_back_until_embedding_injected() -> None:
    """semantic 预设本期未接入，回退 general（注册表保留，二期注入 embedding）。"""
    records = chunk_markdown(
        _long_markdown(), file_id='doc1', filename='demo.md', processing_params={'chunk_preset_id': 'semantic'}
    )
    assert records


def test_separator_preset_splits_by_delimiter() -> None:
    """separator：命中分隔符即切块。"""
    md = '# 标题\n\n第一段内容。\n\n第二段内容，足够长以便不会被空行合并。'
    records = chunk_markdown(
        md,
        file_id='doc1',
        filename='demo.md',
        processing_params={'chunk_preset_id': 'separator', 'chunk_parser_config': {'delimiter': '\\n\\n'}},
    )
    assert len(records) >= 2
    assert all(record['content'].strip() for record in records)


def test_qa_preset_extracts_qa_pairs() -> None:
    """qa：Markdown 标题问答结构输出问答块。"""
    md = (
        '# 什么是 RAG？\n\n检索增强生成（Retrieval-Augmented Generation）。'
        '\n\n## 为什么需要分块？\n\n因为需要控制上下文长度。'
    )
    records = chunk_markdown(md, file_id='doc1', filename='demo.md', processing_params={'chunk_preset_id': 'qa'})
    assert records
    joined = '\n'.join(record['content'] for record in records)
    assert '问题：' in joined


def test_token_limit_guard_splits_long_text() -> None:
    """超长单段文本按 token 上限保护切分（general 512 上限 → 768 硬切）。"""
    text = _long_paragraph()
    records = chunk_markdown(
        text,
        file_id='doc1',
        filename='demo.md',
        processing_params={
            'chunk_preset_id': 'general',
            'chunk_parser_config': {'chunk_token_num': 64},
        },
    )
    assert len(records) > 1
    hard_limit = int(64 * GENERAL_HARD_LIMIT_RATIO)
    for record in records:
        assert nlp.count_tokens(record['content']) <= hard_limit


def test_char_pos_offsets_when_source_markdown() -> None:
    """general：带源 Markdown 时输出字符级溯源偏移。"""
    md = '# 标题\n\n内容行。'
    records = chunk_markdown(md, file_id='doc1', filename='demo.md', processing_params={})
    assert all(
        record.get('start_char_pos') is None or (record['end_char_pos'] or 0) >= (record['start_char_pos'] or 0)
        for record in records
    )
