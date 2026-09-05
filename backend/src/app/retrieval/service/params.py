"""检索参数解析纯函数（ragf-design §5.7/D17：request > KB query_params > settings）。

纯函数、无 IO，单测直接覆盖；``similarity_threshold`` 的“余弦低于阈值丢弃”
语义只作用于 vector 模式（hybrid 为 RRF 秩分，不适用）。
"""

from __future__ import annotations

from typing import Any

from backend.src.core.config import settings

__all__ = [
    'apply_similarity_threshold',
    'build_document_expr',
    'default_search_params',
    'merge_search_params',
    'resolve_recall_top_k',
]

RETRIEVAL_PARAM_KEYS = frozenset({'search_mode', 'recall_top_k', 'final_top_k', 'similarity_threshold', 'use_reranker'})
SEARCH_MODES = frozenset({'vector', 'hybrid'})


def default_search_params() -> dict[str, Any]:
    """settings 出厂默认（D17）。"""
    return {
        'search_mode': settings.RAGF_RETRIEVAL_SEARCH_MODE,
        'recall_top_k': int(settings.RAGF_RETRIEVAL_RECALL_TOP_K),
        'final_top_k': int(settings.RAGF_RETRIEVAL_FINAL_TOP_K),
        'similarity_threshold': float(settings.RAGF_RETRIEVAL_SIMILARITY_THRESHOLD),
        'use_reranker': bool(settings.RAGF_RETRIEVAL_USE_RERANKER),
    }


def _coerce_param(key: str, value: Any) -> Any:
    """按键轻量强转；非法值返回 None 表示“放弃该层覆盖”。"""
    if key == 'search_mode':
        return value if value in SEARCH_MODES else None
    if key in {'recall_top_k', 'final_top_k'}:
        try:
            return max(int(value), 1)
        except (TypeError, ValueError):
            return None
    if key == 'similarity_threshold':
        try:
            coerced = float(value)
        except (TypeError, ValueError):
            return None
        return coerced if 0.0 <= coerced <= 1.0 else None
    if key == 'use_reranker':
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.strip().lower() in {'true', 'false'}:
            return value.strip().lower() == 'true'
        if isinstance(value, int) and value in {0, 1}:
            return bool(value)
        return None
    return None


def merge_search_params(
    *,
    kb_query_params: dict[str, Any] | None = None,
    request: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """合并三层默认值；request > KB query_params > settings；白名单键 + 非法值跳过。"""
    merged = default_search_params()
    for source in (dict(kb_query_params or {}), dict(request or {})):
        for key, value in source.items():
            if key not in RETRIEVAL_PARAM_KEYS or value is None:
                continue
            coerced = _coerce_param(key, value)
            if coerced is not None:
                merged[key] = coerced
    return merged


def resolve_recall_top_k(*, recall_top_k: Any, final_top_k: Any, use_reranker: bool) -> int:
    """召回数解析（对齐 Yuxi aquery）：开精排时 recall = max(recall, final)，
    否则 recall = final（只取最终条数即可）。"""
    recall = max(int(recall_top_k), 1)
    final = max(int(final_top_k), 1)
    if use_reranker:
        return max(recall, final)
    return final


def apply_similarity_threshold(hits: list[dict[str, Any]], threshold: Any) -> list[dict[str, Any]]:
    """vector 模式余弦阈值过滤（Yuxi：distance < threshold 丢弃；保持召回顺序）。"""
    threshold_value = float(threshold)
    return [hit for hit in hits if float(hit.get('score') or 0.0) >= threshold_value]


def build_document_expr(document_ids: list[str] | None) -> str | None:
    """文档 ID 集 → Milvus 过滤表达式；空列表返回 None（调用方短路为空结果）。"""
    ids = sorted({str(item) for item in document_ids or [] if item})
    if not ids:
        return None
    escaped = [item.replace('"', '\\"') for item in ids]
    if len(escaped) == 1:
        return f'document_id == "{escaped[0]}"'
    joined = '", "'.join(escaped)
    return f'document_id in ["{joined}"]'
