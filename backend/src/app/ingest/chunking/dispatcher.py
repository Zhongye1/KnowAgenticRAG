"""分块调度器（Yuxi chunking/ragflow_like/dispatcher.py 移植，ragf-design D8/§16.2）。

纯函数包：输入 Markdown 字符串，输出 ``list[dict]`` 分块记录（content/chunk_index/
字符偏移等），不含任何模型/DB 依赖。semantic 预设依赖 embedding 注入，二期接入
（当前回退 general 并告警）。
"""

from __future__ import annotations

from typing import Any

from backend.src.app.ingest.chunking.parsers import book, general, laws, qa, separator
from backend.src.app.ingest.chunking.presets import map_to_internal_parser_id, normalize_chunk_preset_id
from backend.src.common.log import log

__all__ = ['chunk_file', 'chunk_markdown']


def _build_chunk_records(
    text_chunks: list[str], file_id: str, filename: str, source_text: str | None = None
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    search_from = 0

    for idx, chunk_content in enumerate(text_chunks):
        text = (chunk_content or '').strip()
        if not text:
            continue

        start_char_pos = None
        end_char_pos = None
        if source_text:
            found_at = source_text.find(text, search_from)
            if found_at >= 0:
                start_char_pos = found_at
                end_char_pos = found_at + len(text)
                search_from = end_char_pos

        records.append({
            'id': f'{file_id}_chunk_{idx}',
            'content': text,
            'file_id': file_id,
            'filename': filename,
            'chunk_index': idx,
            'source': filename,
            'chunk_id': f'{file_id}_chunk_{idx}',
            'start_char_pos': start_char_pos,
            'end_char_pos': end_char_pos,
            'start_token_pos': None,
            'end_token_pos': None,
            'extraction_result': None,
        })

    return records


def _dispatch_markdown_parser(
    preset_id: str, filename: str, markdown_content: str, parser_config: dict[str, Any]
) -> list[str]:
    parser_id = map_to_internal_parser_id(preset_id)

    if parser_id == 'naive':
        return general.chunk_markdown(markdown_content, parser_config)
    if parser_id == 'qa':
        return qa.chunk_markdown(filename, markdown_content, parser_config)
    if parser_id == 'book':
        return book.chunk_markdown(markdown_content, parser_config)
    if parser_id == 'laws':
        return laws.chunk_markdown(filename, markdown_content, parser_config)
    if parser_id == 'separator':
        return separator.chunk_markdown(markdown_content, parser_config)
    if parser_id == 'semantic':
        log.warning('semantic 分块依赖 embedding 注入，本期未接入，回退 general（preset={}）', preset_id)
        return general.chunk_markdown(markdown_content, parser_config)

    return general.chunk_markdown(markdown_content, parser_config)


def chunk_markdown(
    markdown_content: str, file_id: str, filename: str, processing_params: dict[str, Any]
) -> list[dict[str, Any]]:
    """按 processing_params（chunk_preset_id / chunk_parser_config）对 Markdown 分块。"""
    params = dict(processing_params or {})
    preset_id = normalize_chunk_preset_id(params.get('chunk_preset_id'))
    raw_parser_config = params.get('chunk_parser_config')
    parser_config: dict[str, Any] = raw_parser_config if isinstance(raw_parser_config, dict) else {}

    text_chunks = _dispatch_markdown_parser(preset_id, filename, markdown_content, parser_config)
    return _build_chunk_records(text_chunks, file_id, filename, markdown_content)


def chunk_file(
    file_content: str, file_id: str, filename: str, processing_params: dict[str, Any]
) -> list[dict[str, Any]]:
    # 当前链路中入库前均已转换为 markdown，因此与 chunk_markdown 保持同实现。
    return chunk_markdown(file_content, file_id, filename, processing_params)
