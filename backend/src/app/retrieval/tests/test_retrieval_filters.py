"""检索结构化过滤纯函数测试（M11/D26：表达式组合、active 收敛、参数归一）。"""

from __future__ import annotations

import pytest

from backend.src.app.retrieval.schema.search_result import RetrievalFilters
from backend.src.app.retrieval.service.filters import (
    coerce_filters,
    compose_retrieval_expr,
    filter_active_versions,
    normalize_file_type,
)


def test_compose_expr_document_and_version() -> None:
    expr = compose_retrieval_expr(doc_ids=['doc_b', 'doc_a'], version_id=2)
    assert expr == 'document_id in ["doc_a", "doc_b"] and version_id == 2'


def test_compose_expr_document_only_escapes() -> None:
    assert compose_retrieval_expr(doc_ids=['a"b'], version_id=None) == 'document_id == "a\\"b"'
    assert compose_retrieval_expr(doc_ids=None, version_id=3) == 'version_id == 3'
    assert compose_retrieval_expr(doc_ids=None, version_id=None) is None


def test_compose_expr_invalid_version() -> None:
    with pytest.raises(ValueError):
        compose_retrieval_expr(doc_ids=None, version_id=0)


def _hit(document_id: str, version_id: int, chunk_id: str | None = None) -> dict:
    return {
        'chunk_id': chunk_id or f'{document_id}:{version_id}:0',
        'document_id': document_id,
        'version_id': version_id,
    }


def test_filter_active_versions_drops_stale_by_default() -> None:
    hits = [_hit('a', 1), _hit('a', 2), _hit('b', 1)]
    kept = filter_active_versions(hits, {'a': 2, 'b': 1}, version_requested=False)
    assert [hit['version_id'] for hit in kept] == [2, 1]


def test_filter_active_versions_keeps_unknown_docs() -> None:
    hits = [_hit('a', 1), _hit('missing', 3)]
    kept = filter_active_versions(hits, {'a': 2}, version_requested=False)
    assert [hit['document_id'] for hit in kept] == ['missing']


def test_filter_active_versions_skipped_when_version_requested() -> None:
    hits = [_hit('a', 1), _hit('a', 2)]
    kept = filter_active_versions(hits, {'a': 2}, version_requested=True)
    assert len(kept) == 2


def test_coerce_filters_normalizes_and_validates() -> None:
    filters = coerce_filters({'tag': '升级', 'version_id': 2})
    assert filters is not None
    assert filters.tag == '升级'
    assert filters.version_id == 2
    assert coerce_filters(None) is None
    assert coerce_filters({}) is None  # 全空 = 无过滤
    assert coerce_filters(RetrievalFilters.model_validate({'keyword': 'a'})).keyword == 'a'  # type: ignore[union-attr]
    with pytest.raises((TypeError, ValueError)):
        coerce_filters('not-a-dict')
    with pytest.raises(ValueError):
        coerce_filters({'tag': 123})  # 类型非法


def test_normalize_file_type() -> None:
    assert normalize_file_type('.PDF') == 'pdf'
    assert normalize_file_type('Markdown') == 'markdown'
    assert normalize_file_type(None) is None
