"""OCR/解析引擎注册表（Yuxi knowledge/parser/registry.py 移植，ragf-design D8）。

注册表只登记 engine_id → processor class；``factory`` 负责按格式/参数路由与实例缓存。
未移植引擎不在注册表出现（选择时会得到明确的 unavailable 错误）。
"""

from __future__ import annotations

from typing import TypeVar

from backend.src.app.ingest.parser.base import BaseDocumentProcessor

T = TypeVar('T', bound=type[BaseDocumentProcessor])

PROCESSORS: dict[str, type[BaseDocumentProcessor]] = {}


def register[T: type[BaseDocumentProcessor]](processor_type: T) -> T:
    """注册处理器类（装饰器）。"""
    engine_id = getattr(processor_type, 'service_name', '')
    if not engine_id:
        raise ValueError('processor 必须声明 service_name')
    PROCESSORS[engine_id] = processor_type
    return processor_type


def get_processor_class(engine_id: str) -> type[BaseDocumentProcessor]:
    try:
        return PROCESSORS[engine_id]
    except KeyError as exc:
        raise KeyError(
            f'不支持的处理器类型: {engine_id}。已注册: {sorted(PROCESSORS)}'
            '（未移植引擎保留 Yuxi 侧，二期按 settings 接入）'
        ) from exc


def registered_engines() -> list[str]:
    return sorted(PROCESSORS)
