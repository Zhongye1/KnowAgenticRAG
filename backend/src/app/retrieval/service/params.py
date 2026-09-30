"""检索参数解析纯函数（ragf-design §5.7/D17：request > KB query_params > settings）。

纯函数、无 IO，单测直接覆盖；``similarity_threshold`` 的“余弦低于阈值丢弃”
语义只作用于 vector 模式（hybrid 为 RRF 秩分、keyword 为 BM25 词面分，均不适用）。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.src.core.config import settings

if TYPE_CHECKING:
    from collections.abc import Callable

__all__ = [
    'FUSION_MODES',
    'SEARCH_MODES',
    'apply_similarity_threshold',
    'build_document_expr',
    'default_search_params',
    'merge_search_params',
    'resolve_recall_top_k',
]

RETRIEVAL_PARAM_KEYS = frozenset({
    'search_mode',
    'recall_top_k',
    'final_top_k',
    'similarity_threshold',
    'use_reranker',
    'include_visual',
    'visual_top_k',
    'fusion_mode',
    'vector_weight',
    'bm25_weight',
})
SEARCH_MODES = frozenset({'vector', 'keyword', 'hybrid'})
FUSION_MODES = frozenset({'rrf', 'weighted'})


def default_search_params() -> dict[str, Any]:
    """settings 出厂默认（D17）。"""
    return {
        'search_mode': settings.RAGF_RETRIEVAL_SEARCH_MODE,
        'recall_top_k': int(settings.RAGF_RETRIEVAL_RECALL_TOP_K),
        'final_top_k': int(settings.RAGF_RETRIEVAL_FINAL_TOP_K),
        'similarity_threshold': float(settings.RAGF_RETRIEVAL_SIMILARITY_THRESHOLD),
        'use_reranker': bool(settings.RAGF_RETRIEVAL_USE_RERANKER),
        'include_visual': bool(settings.RAGF_RETRIEVAL_USE_VISUAL),
        'visual_top_k': int(settings.RAGF_RETRIEVAL_VISUAL_TOP_K),
        'fusion_mode': settings.RAGF_RETRIEVAL_FUSION_MODE,
        'vector_weight': float(settings.RAGF_RETRIEVAL_VECTOR_WEIGHT),
        'bm25_weight': float(settings.RAGF_RETRIEVAL_BM25_WEIGHT),
    }


def _coerce_choice(allowed: frozenset[str]) -> Callable[[Any], Any]:
    """白名单取值：不在集合内返回 None（放弃该层覆盖）。"""

    def coerce(value: Any) -> Any:
        return value if value in allowed else None

    return coerce


def _coerce_positive_int(value: Any) -> int | None:
    """正整数（下限 1）；不可转换返回 None。"""
    try:
        return max(int(value), 1)
    except (TypeError, ValueError):
        return None


def _coerce_bounded_float(value: Any, *, clamp: bool) -> float | None:
    """[0,1] 浮点；``clamp`` 为真时截断越界值，否则判为非法。"""
    try:
        coerced = float(value)
    except (TypeError, ValueError):
        return None
    if clamp:
        return min(max(coerced, 0.0), 1.0)
    return coerced if 0.0 <= coerced <= 1.0 else None


def _coerce_bool(value: Any) -> bool | None:
    """布尔（接受 bool / 'true'|'false' / 0|1）；其余返回 None。"""
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().lower() in {'true', 'false'}:
        return value.strip().lower() == 'true'
    if isinstance(value, int) and value in {0, 1}:
        return bool(value)
    return None


# 键 → 强转器（D17 单一事实源；新增检索参数只需在此登记）
_COERCERS: dict[str, Callable[[Any], Any]] = {
    'search_mode': _coerce_choice(SEARCH_MODES),
    'fusion_mode': _coerce_choice(FUSION_MODES),
    'recall_top_k': _coerce_positive_int,
    'final_top_k': _coerce_positive_int,
    'visual_top_k': _coerce_positive_int,
    'similarity_threshold': lambda value: _coerce_bounded_float(value, clamp=False),
    'vector_weight': lambda value: _coerce_bounded_float(value, clamp=True),
    'bm25_weight': lambda value: _coerce_bounded_float(value, clamp=True),
    'use_reranker': _coerce_bool,
    'include_visual': _coerce_bool,
}


def _coerce_param(key: str, value: Any) -> Any:
    """按键强转；非法值返回 None 表示「放弃该层覆盖」。"""
    coercer = _COERCERS.get(key)
    return coercer(value) if coercer else None


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
