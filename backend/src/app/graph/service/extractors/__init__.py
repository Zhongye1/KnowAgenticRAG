"""图谱抽取器：抽象基类、结果归一、LLM 实现与工厂。"""

from backend.src.app.graph.service.extractors.base import GraphExtractor as GraphExtractor
from backend.src.app.graph.service.extractors.base import (
    normalize_extraction_result as normalize_extraction_result,
)
from backend.src.app.graph.service.extractors.llm import LLMGraphExtractor as LLMGraphExtractor

__all__ = ['GraphExtractor', 'LLMGraphExtractor', 'normalize_extraction_result']
