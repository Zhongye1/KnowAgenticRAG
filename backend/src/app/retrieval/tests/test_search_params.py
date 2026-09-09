"""检索参数解析纯函数测试（ragf-design §5.7/D17：request > KB query_params > settings）。

无 DB/模型/Milvus 依赖；仅覆盖纯函数语义。
"""

from __future__ import annotations

from backend.src.app.kb.schema.knowledge_base import QUERY_PARAM_WHITELIST
from backend.src.app.retrieval.service.params import (
    RETRIEVAL_PARAM_KEYS,
    apply_similarity_threshold,
    build_document_expr,
    default_search_params,
    merge_search_params,
    resolve_recall_top_k,
)


def test_param_keys_parity_with_kb_whitelist() -> None:
    """检索键与 kb.query_params 白名单保持一致（单一事实源锁定，防漂移）。"""
    assert frozenset(QUERY_PARAM_WHITELIST) == RETRIEVAL_PARAM_KEYS


def test_defaults_have_all_factory_keys() -> None:
    defaults = default_search_params()
    assert set(defaults) == set(QUERY_PARAM_WHITELIST)
    assert defaults['search_mode'] in {'vector', 'hybrid'}


def test_merge_precedence_request_over_kb_over_settings() -> None:
    kb_params = {'search_mode': 'vector', 'recall_top_k': 30, 'use_reranker': False}
    request = {'recall_top_k': 40}
    merged = merge_search_params(kb_query_params=kb_params, request=request)
    assert merged['search_mode'] == 'vector'  # kb 层覆盖 settings
    assert merged['recall_top_k'] == 40  # request 层覆盖 kb 层
    assert merged['use_reranker'] is False
    assert merged['final_top_k'] >= 1  # 未覆盖项保留 settings 默认


def test_merge_ignores_unknown_keys_and_invalid_values() -> None:
    merged = merge_search_params(
        kb_query_params={'unknown_key': 1, 'similarity_threshold': 3.5, 'search_mode': 'ppr'},
        request={'similarity_threshold': 0.6, 'use_reranker': 'true', 'final_top_k': -5},
    )
    assert 'unknown_key' not in merged
    assert abs(float(merged['similarity_threshold']) - 0.6) < 1e-9
    assert merged['search_mode'] in {'vector', 'hybrid'}  # 非法值回落到 settings 默认
    assert merged['use_reranker'] is True  # 字符串 'true' 可解析
    assert merged['final_top_k'] >= 1  # 负数被钳制/忽略


def test_resolve_recall_top_k_with_reranker() -> None:
    assert resolve_recall_top_k(recall_top_k=20, final_top_k=5, use_reranker=True) == 20
    assert resolve_recall_top_k(recall_top_k=3, final_top_k=5, use_reranker=True) == 5


def test_resolve_recall_top_k_without_reranker() -> None:
    # 对齐 Yuxi：不精排时召回数 = final_top_k
    assert resolve_recall_top_k(recall_top_k=20, final_top_k=5, use_reranker=False) == 5


def test_similarity_threshold_filter_keeps_order() -> None:
    hits = [
        {'chunk_id': 'a', 'score': 0.9},
        {'chunk_id': 'b', 'score': 0.1},
        {'chunk_id': 'c', 'score': 0.2},
    ]
    filtered = apply_similarity_threshold(hits, 0.2)
    assert [hit['chunk_id'] for hit in filtered] == ['a', 'c']


def test_build_document_expr_single_and_multi() -> None:
    assert build_document_expr(['doc_a']) == 'document_id == "doc_a"'
    assert build_document_expr(['doc_b', 'doc_a']) == 'document_id in ["doc_a", "doc_b"]'
    assert build_document_expr([]) is None
    assert build_document_expr(None) is None


def test_build_document_expr_escapes_quotes() -> None:
    assert build_document_expr(['a"b']) == 'document_id == "a\\"b"'
