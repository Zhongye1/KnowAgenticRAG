"""多子查询召回融合测试（D41）：RRF 融合语义 + 策略层逐路并行召回。

纯函数与策略替身两段覆盖：融合只做秩分合并/去重，不引入第二次精排；
单查询 ctx 走原路径（向后兼容）。
"""

from __future__ import annotations

import asyncio

from typing import Any

import pytest

from backend.src.app.retrieval.service.strategies import hybrid as hybrid_mod
from backend.src.app.retrieval.service.strategies import vector as vector_mod
from backend.src.app.retrieval.service.strategies.fusion import fuse_rrf, query_pairs
from backend.src.app.retrieval.service.strategies.hybrid import retrieve_hybrid
from backend.src.app.retrieval.service.strategies.vector import retrieve_vector


def _hit(chunk_id: str, score: float = 0.9) -> dict[str, Any]:
    return {'chunk_id': chunk_id, 'document_id': 'doc-a', 'content': 'x', 'score': score}


def _ctx(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        'kb_name': 'dev',
        'dim': 3,
        'recall_top_k': 5,
        'expr': None,
        'plugin_namespace': 'core',
        'similarity_threshold': 0.0,
    }
    base.update(overrides)
    return base


# ------------------------------------------------------------------ query_pairs
def test_query_pairs_falls_back_to_single_query_fields() -> None:
    """没有多查询字段时回退单查询（存量调用方与自定义策略零改动）。"""
    assert query_pairs({'query_text': '甲', 'query_embedding': [1.0, 2.0]}) == [('甲', [1.0, 2.0])]


def test_query_pairs_prefers_multi_query_fields_and_keeps_order() -> None:
    pairs = query_pairs({
        'query_text': '甲',
        'query_texts': ['甲', '  ', '乙'],
        'query_embeddings': [[1.0], [2.0], [3.0]],
    })
    assert pairs == [('甲', [1.0]), ('乙', [3.0])]


# ------------------------------------------------------------------ fuse_rrf
def test_fuse_rrf_ranks_by_reciprocal_rank_and_dedupes() -> None:
    a, b, c = _hit('c1'), _hit('c2'), _hit('c3')
    fused = fuse_rrf([[a, b], [c, b]], k=60)
    # c2 两路命中（1/62 × 2）高于单路命中的 c1/c3（1/61）
    assert [hit['chunk_id'] for hit in fused] == ['c2', 'c1', 'c3']
    assert fused[0]['rrf_score'] == pytest.approx(2 / 62)
    assert fused[1]['rrf_score'] == pytest.approx(1 / 61)


def test_fuse_rrf_copies_hits_and_single_list_passthrough() -> None:
    hit = _hit('c1')
    assert fuse_rrf([[hit]], k=60) == [hit]
    fused = fuse_rrf([[hit], []], k=60)
    assert fused[0]['chunk_id'] == 'c1'
    assert 'rrf_score' in fused[0]
    assert 'rrf_score' not in hit  # 原命中对象不被就地修改


def test_fuse_rrf_keeps_hits_without_chunk_id() -> None:
    fused = fuse_rrf([[{'content': 'x', 'score': 0.5}], []], k=60)
    assert len(fused) == 1
    assert fused[0]['content'] == 'x'


# ------------------------------------------------------------------ 策略层
def test_vector_strategy_recalls_each_sub_query_and_fuses(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def fake_search(**kwargs: Any) -> list[dict[str, Any]]:
        calls.append(kwargs['query_text'])
        return [_hit(f'{kwargs["query_text"]}-1')]

    monkeypatch.setattr(vector_mod, 'search_ragf_kb', fake_search)
    hits = asyncio.run(
        retrieve_vector(_ctx(query_texts=['甲', '乙'], query_embeddings=[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]))
    )
    assert calls == ['甲', '乙']
    assert [hit['chunk_id'] for hit in hits] == ['甲-1', '乙-1']


def test_vector_strategy_applies_threshold_to_fused_hits(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_search(**kwargs: Any) -> list[dict[str, Any]]:
        return [_hit(f'{kwargs["query_text"]}-1', score=0.2)]

    monkeypatch.setattr(vector_mod, 'search_ragf_kb', fake_search)
    hits = asyncio.run(
        retrieve_vector(
            _ctx(
                query_texts=['甲', '乙'],
                query_embeddings=[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
                similarity_threshold=0.9,
            )
        )
    )
    assert hits == []


def test_hybrid_strategy_single_query_keeps_original_path(monkeypatch: pytest.MonkeyPatch) -> None:
    """单查询不做融合：一次召回、原序返回（既有行为不变）。"""
    calls: list[str] = []

    def fake_search(**kwargs: Any) -> list[dict[str, Any]]:
        calls.append(kwargs['query_text'])
        return [_hit('c1'), _hit('c2')]

    monkeypatch.setattr(hybrid_mod, 'search_ragf_kb', fake_search)
    hits = asyncio.run(retrieve_hybrid(_ctx(query_text='甲', query_embedding=[1.0, 0.0, 0.0])))
    assert calls == ['甲']
    assert [hit['chunk_id'] for hit in hits] == ['c1', 'c2']
    assert 'rrf_score' not in hits[0]


def test_hybrid_strategy_multi_query_fuses(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_search(**kwargs: Any) -> list[dict[str, Any]]:
        return [_hit(f'{kwargs["query_text"]}-1'), _hit('shared')]

    monkeypatch.setattr(hybrid_mod, 'search_ragf_kb', fake_search)
    hits = asyncio.run(
        retrieve_hybrid(_ctx(query_texts=['甲', '乙'], query_embeddings=[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]))
    )
    assert [hit['chunk_id'] for hit in hits] == ['shared', '甲-1', '乙-1']
