"""纯文本直读处理器（md/txt/csv，无外部依赖，ragf-design D13 首发子集）。"""

from __future__ import annotations

from typing import Any, ClassVar

from backend.src.app.ingest.parser.base import BaseDocumentProcessor, DocumentParseError
from backend.src.app.ingest.parser.registry import register


def _decode(data: bytes) -> str:
    """优先 UTF-8，其次 GB18030，最后带替换兜底。"""
    if not data:
        return ''
    for encoding in ('utf-8', 'gb18030'):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode('utf-8', errors='replace')


@register
class DirectTextProcessor(BaseDocumentProcessor):
    """Markdown/纯文本/CSV 直读（返回原文即 Markdown 兼容文本）。"""

    service_name: ClassVar[str] = 'direct_text'
    display_name: ClassVar[str] = '直接文本读取'
    supported_extensions: ClassVar[list[str]] = ['.md', '.txt', '.csv']

    async def parse_bytes(self, data: bytes, filename: str, params: dict[str, Any] | None = None) -> str:
        text = _decode(data).strip()
        if not text:
            raise DocumentParseError('文件内容为空', service_name=self.service_name, error_code='empty_content')
        return text

    async def check_health(self) -> dict[str, Any]:
        return {'status': 'healthy', 'message': '直接文本读取无需外部服务', 'details': {}}
