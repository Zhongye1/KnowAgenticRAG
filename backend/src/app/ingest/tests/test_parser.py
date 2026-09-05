"""解析层单元测试（Yuxi knowledge/parser 移植，ragf-design §11）。

覆盖：direct text（md/txt/csv）解码路由、不支持格式/未注册引擎的明确错误、注册表内容。
外部引擎（MinerU）不做网络依赖断言，仅验证实例化与注册。
"""

from __future__ import annotations

import asyncio

from typing import TYPE_CHECKING

import pytest

from backend.src.app.ingest.parser import DocumentProcessorFactory, parse_document
from backend.src.app.ingest.parser.base import ProcessorUnavailableError

if TYPE_CHECKING:
    from collections.abc import Awaitable
    from typing import Any


def _run(awaitable: Awaitable[Any]) -> object:
    return asyncio.run(awaitable)


def test_parse_markdown_passthrough() -> None:
    """md 直读：原文透传。"""
    text = '# 标题\n\n正文段落。\n'
    assert _run(parse_document(text.encode(), 'demo.md', {})) == text.strip()


def test_parse_txt_gb18030_fallback() -> None:
    """txt：UTF-8 失败时按 GB18030 解码。"""
    text = '中文内容行一\n行二'
    assert _run(parse_document(text.encode('gb18030'), 'demo.txt', {})) == text


def test_parse_csv_passthrough() -> None:
    """csv：原文透传（QA/结构化解析在分块层处理）。"""
    raw = 'a,b\n1,2\n'
    assert _run(parse_document(raw.encode(), 'demo.csv', {})) == raw.strip()


def test_parse_unsupported_format_raises() -> None:
    """docx 等未接入引擎格式：明确 unavailable 错误（D13 子集外拒绝）。"""
    with pytest.raises(ProcessorUnavailableError):
        _run(parse_document(b'x', 'demo.docx', {}))


def test_parse_unknown_engine_raises() -> None:
    """settings/params 指定未注册 OCR 引擎：明确错误。"""
    with pytest.raises(ProcessorUnavailableError):
        _run(DocumentProcessorFactory.parse_document(b'x', 'demo.pdf', {'ocr_engine': 'not-registered'}))


def test_registry_engines() -> None:
    """注册表含首发引擎（direct_text 常驻；mineru 为 OCR 默认）。"""
    engines = DocumentProcessorFactory.get_available_processors()
    assert 'direct_text' in engines
    assert 'mineru' in engines
