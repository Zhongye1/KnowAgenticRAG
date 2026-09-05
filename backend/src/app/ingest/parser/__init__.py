"""ingest 域解析层（Yuxi knowledge/parser 移植，ragf-design D8/D13）。"""

from backend.src.app.ingest.parser import processors  # ruff: ignore[unused-import]  引擎注册表副作用：注册各处理器
from backend.src.app.ingest.parser.factory import DocumentProcessorFactory, parse_document

__all__ = ['DocumentProcessorFactory', 'parse_document']
