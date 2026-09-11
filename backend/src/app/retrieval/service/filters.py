"""结构化检索过滤纯函数（agent-layer spec §5.3/D26/M11）。

职责只覆盖“表达式组合与结果收敛”的纯逻辑：文档级过滤经 kb 登记解析为
``document_id`` 集（SQL 在 ``crud_document``，含租户作用域），``version_id``
精确过滤与默认 active_version 收敛在此组合/执行；无 DB/网络依赖，单测直覆盖。
"""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from backend.src.app.retrieval.schema.search_result import RetrievalFilters
from backend.src.app.retrieval.service.params import build_document_expr

__all__ = [
    'MAX_DOC_FILTER_MATCH',
    'coerce_document_ids',
    'coerce_filters',
    'compose_retrieval_expr',
    'filter_active_versions',
    'normalize_file_type',
]

# 文档级过滤命中上限（对齐既有 file_name 过滤语义，防一次性拉全库）
MAX_DOC_FILTER_MATCH = 500


def coerce_document_ids(value: Any) -> list[str] | None:
    """document_ids 直推清洗：非列表返回 None（无过滤）；空列表 = 空命中短路。

    条目去空去重、保留原序；超 MAX_DOC_FILTER_MATCH 报错（防表达式越界）。
    """
    if value is None:
        return None
    if not isinstance(value, list):
        raise TypeError('document_ids 必须是字符串列表')
    ids: list[str] = []
    for item in value:
        text = str(item or '').strip()
        if text and text not in ids:
            ids.append(text)
    if len(ids) > MAX_DOC_FILTER_MATCH:
        raise ValueError(f'document_ids 数量超限: {len(ids)} > {MAX_DOC_FILTER_MATCH}')
    return ids


def normalize_file_type(value: str | None) -> str | None:
    """文件扩展名归一：去前导点 + 小写；空值返回 None。"""
    if value is None:
        return None
    text = value.strip().lstrip('.').lower()
    return text or None


def coerce_filters(raw: Any) -> RetrievalFilters | None:
    """dict/对象 → RetrievalFilters；None 或全空返回 None（无过滤）。"""
    if raw is None:
        return None
    if isinstance(raw, RetrievalFilters):
        return raw if (raw.has_doc_constraints or raw.version_requested) else None
    if not isinstance(raw, dict):
        raise TypeError('filters 必须是对象')
    try:
        filters = RetrievalFilters.model_validate(raw)
    except ValidationError as exc:
        raise ValueError(f'filters 参数非法: {exc.errors()[0]}') from exc
    return filters if (filters.has_doc_constraints or filters.version_requested) else None


def compose_retrieval_expr(*, doc_ids: list[str] | None, version_id: int | None) -> str | None:
    """Milvus 过滤表达式：document_id 集 AND 精确 version_id（kb_name 由 milvus 层注入）。

    ``doc_ids=[]`` 语义为“命中为空”——调用方需短路，不进入本函数（None 的调用
    方同样短路）；空集返回 None（不过滤）。
    """
    parts = [part for part in (build_document_expr(doc_ids), _version_expr(version_id)) if part]
    if not parts:
        return None
    return ' and '.join(parts)


def _version_expr(version_id: int | None) -> str | None:
    if version_id is None:
        return None
    value = int(version_id)
    if value < 1:
        raise ValueError('version_id 必须 >= 1')
    return f'version_id == {value}'


def filter_active_versions(
    hits: list[dict[str, Any]],
    active_versions: dict[str, int],
    *,
    version_requested: bool,
) -> list[dict[str, Any]]:
    """默认收敛到 active_version chunk（agent-layer spec §5.3/M11）。

    显式 ``version_id`` 过滤时不收敛（跨版本对比由调用方显式过滤完成）；文档未在
    active 映射内（来源补全缺行）时保留命中，不因补全缺失误伤召回。
    """
    if version_requested or not active_versions:
        return hits
    kept: list[dict[str, Any]] = []
    for hit in hits:
        document_id = str(hit.get('document_id') or '')
        active = active_versions.get(document_id)
        if active is None or int(hit.get('version_id') or 1) == int(active):
            kept.append(hit)
    return kept
