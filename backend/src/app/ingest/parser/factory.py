"""文档处理器工厂（Yuxi knowledge/parser/factory.py 移植，ragf-design D8/D13）。

路由规则（首发子集）：
- ``.md/.txt/.csv`` → 直读（不经 OCR）；
- ``.pdf/.png/.jpg/.jpeg`` → OCR 引擎（settings ``RAGF_OCR_ENGINE`` 或 params 覆盖）；
- 其余格式（docx/pptx 等）依赖后续批次引擎，返回 ProcessorUnavailableError。
解析失败抛 DocumentParseError/ProcessorUnavailableError，由摄取服务映射状态。
"""

from __future__ import annotations

import hashlib

from typing import Any

from backend.src.app.ingest.parser.base import BaseDocumentProcessor, DocumentParseError, ProcessorUnavailableError
from backend.src.app.ingest.parser.registry import PROCESSORS, get_processor_class
from backend.src.common.log import log
from backend.src.core.config import settings

DIRECT_TEXT_EXTENSIONS = frozenset({'.md', '.txt', '.csv'})
OCR_EXTENSIONS = frozenset({'.pdf', '.png', '.jpg', '.jpeg'})

_PROCESSOR_CACHE: dict[str, BaseDocumentProcessor] = {}


def _build_cache_key(engine_id: str, kwargs: dict[str, Any]) -> str:
    if not kwargs:
        return engine_id
    digest = hashlib.sha256(repr(sorted(kwargs.items())).encode()).hexdigest()[:16]
    return f'{engine_id}|{digest}'


class DocumentProcessorFactory:
    """文档处理器工厂（实例缓存，按 engine_id + 初始化参数）。"""

    @classmethod
    def get_processor(cls, engine_id: str, **kwargs: Any) -> BaseDocumentProcessor:
        if engine_id not in PROCESSORS:
            raise ProcessorUnavailableError(
                f'处理器未注册: {engine_id}（已注册: {sorted(PROCESSORS)}）',
                service_name='factory',
                error_code='unsupported_engine',
            )
        cache_key = _build_cache_key(engine_id, kwargs)
        if cache_key not in _PROCESSOR_CACHE:
            _PROCESSOR_CACHE.clear()  # 进程内单例缓存，避免长期持有多实例
            _PROCESSOR_CACHE[cache_key] = get_processor_class(engine_id)(**kwargs)
            log.debug('创建文档处理器: {}', engine_id)
        return _PROCESSOR_CACHE[cache_key]

    @classmethod
    async def parse_document(cls, data: bytes, filename: str, params: dict[str, Any] | None = None) -> str:
        """按扩展名路由解析，返回 Markdown 字符串。"""
        params = dict(params or {})
        ext = _extension_of(filename)
        if ext in DIRECT_TEXT_EXTENSIONS:
            engine_id = 'direct_text'
        elif ext in OCR_EXTENSIONS:
            engine_id = str(params.get('ocr_engine') or settings.RAGF_OCR_ENGINE or '').strip()
        else:
            raise ProcessorUnavailableError(
                f'暂不支持的文件格式: {ext or "(无扩展名)"}；首发支持 {sorted(DIRECT_TEXT_EXTENSIONS | OCR_EXTENSIONS)}'
                '（docx/pptx 等依赖 docling 引擎，后续批次接入）',
                service_name='factory',
                error_code='unsupported_file_type',
            )
        processor = cls.get_processor(engine_id)
        try:
            return await processor.parse_bytes(data, filename, params)
        except ProcessorUnavailableError:
            raise
        except DocumentParseError:
            raise
        except Exception as exc:
            raise DocumentParseError(
                f'{processor.service_name} 解析失败: {exc}',
                service_name=processor.service_name,
                error_code='parse_error',
            ) from exc

    @classmethod
    async def check_health(cls, engine_id: str, **kwargs: Any) -> dict[str, Any]:
        try:
            return await cls.get_processor(engine_id, **kwargs).check_health()
        except Exception as exc:
            return {'status': 'error', 'message': f'健康检查失败: {exc}', 'details': {}}

    @classmethod
    def get_available_processors(cls) -> list[str]:
        return sorted(PROCESSORS)


def _extension_of(filename: str) -> str:
    import os

    return os.path.splitext(filename or '')[1].lower()


async def parse_document(data: bytes, filename: str, params: dict[str, Any] | None = None) -> str:
    """模块级便捷入口。"""
    return await DocumentProcessorFactory.parse_document(data, filename, params)


__all__ = ['DocumentProcessorFactory', 'parse_document']
