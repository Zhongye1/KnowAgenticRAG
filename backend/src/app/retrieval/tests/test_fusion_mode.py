"""融合权重可配测试（D57）：``fusion_mode`` 两档、权重可覆盖、默认路径逐位一致。

覆盖三层：参数解析（白名单 + 权重 clamp + 三层覆盖）、hybrid 策略透传、
Milvus 门面按 mode 选 ranker（默认必须是 ``RRFRanker(k)``——改造前行为逐位一致）。

依赖注入替身，无 DB/Milvus/网络。
"""

from __future__ import annotations

import asyncio

from typing import Any

import pytest

from backend.src.app.retrieval.service.params import (
    FUSION_MODES,
    default_search_params,
    merge_search_params,
)
from backend.src.app.retrieval.service.strategies import hybrid as hybrid_mod
from backend.src.app.retrieval.service.strategies.hybrid import retrieve_hybrid
from backend.src.database import milvus_kb_ops


def _ctx(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        'kb_name': 'dev',
        'dim': 3,
        'recall_top_k': 5,
        'expr': None,
        'plugin_namespace': 'core',
    }
    base.update(overrides)
    return base


# ------------------------------------------------------------------ 参数解析
def test_fusion_modes_whitelist() -> None:
    assert {'rrf', 'weighted'} == FUSION_MODES


def test_fusion_default_is_rrf() -> None:
    """默认 rrf：不显式选择时行为与改造前一致。"""
    assert default_search_params()['fusion_mode'] == 'rrf'


def test_fusion_params_merge_from_request_and_kb_layers() -> None:
    merged = merge_search_params(
        kb_query_params={'fusion_mode': 'weighted', 'vector_weight': 0.6},
        request={'bm25_weight': 0.9},
    )
    assert merged['fusion_mode'] == 'weighted'
    assert merged['vector_weight'] == pytest.approx(0.6)
    assert merged['bm25_weight'] == pytest.approx(0.9)


def test_unknown_fusion_mode_ignored() -> None:
    merged = merge_search_params(request={'fusion_mode': 'rrf_k'})
    assert merged['fusion_mode'] == default_search_params()['fusion_mode']


def test_fusion_weights_clamped_to_unit_range() -> None:
    assert merge_search_params(request={'vector_weight': 1.5})['vector_weight'] == pytest.approx(1.0)
    assert merge_search_params(request={'vector_weight': -2})['vector_weight'] == pytest.approx(0.0)


# ------------------------------------------------------------------ 策略透传
def test_hybrid_strategy_forwards_fusion_params(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_search(**kwargs: Any) -> list[dict[str, Any]]:
        calls.append(kwargs)
        return [{'chunk_id': 'c1', 'score': 0.5}]

    monkeypatch.setattr(hybrid_mod, 'search_ragf_kb', fake_search)
    asyncio.run(
        retrieve_hybrid(
            _ctx(
                query_text='甲',
                query_embedding=[1.0, 0.0, 0.0],
                fusion_mode='weighted',
                vector_weight=0.6,
                bm25_weight=0.4,
            )
        )
    )
    assert calls[0]['fusion_mode'] == 'weighted'
    assert calls[0]['vector_weight'] == pytest.approx(0.6)
    assert calls[0]['bm25_weight'] == pytest.approx(0.4)


def test_hybrid_strategy_defaults_to_rrf_when_ctx_lacks_fusion(monkeypatch: pytest.MonkeyPatch) -> None:
    """存量调用方 ctx 不带融合字段时按 rrf 走（向后兼容）。"""
    calls: list[dict[str, Any]] = []

    def fake_search(**kwargs: Any) -> list[dict[str, Any]]:
        calls.append(kwargs)
        return []

    monkeypatch.setattr(hybrid_mod, 'search_ragf_kb', fake_search)
    asyncio.run(retrieve_hybrid(_ctx(query_text='甲', query_embedding=[1.0, 0.0, 0.0])))
    assert calls[0]['fusion_mode'] == 'rrf'


# ------------------------------------------------------------------ Milvus 门面
class _FakeMilvusClient:
    def __init__(self) -> None:
        self.hybrid_calls: list[dict[str, Any]] = []

    def hybrid_search(self, **kwargs: Any) -> list[list[dict[str, Any]]]:
        self.hybrid_calls.append(kwargs)
        return [[]]


def _patch_milvus(monkeypatch: pytest.MonkeyPatch, client: _FakeMilvusClient) -> None:
    monkeypatch.setattr(milvus_kb_ops, 'ensure_ragf_template_collection', lambda **kwargs: 'ragf_3')
    monkeypatch.setattr(milvus_kb_ops, '_client', lambda namespace: client)


def _hybrid_search(**overrides: Any) -> None:
    kwargs: dict[str, Any] = {
        'kb_name': 'dev',
        'dim': 3,
        'query_text': '甲',
        'query_embedding': [1.0, 0.0, 0.0],
        'search_mode': 'hybrid',
    }
    kwargs.update(overrides)
    milvus_kb_ops.search_ragf_kb(**kwargs)


def test_search_ragf_kb_default_ranker_is_rrf(monkeypatch: pytest.MonkeyPatch) -> None:
    """改造前行为逐位一致：默认 ranker 仍是 RRFRanker(k)。"""
    client = _FakeMilvusClient()
    _patch_milvus(monkeypatch, client)
    _hybrid_search()
    assert client.hybrid_calls[0]['ranker'].dict() == {'strategy': 'rrf', 'params': {'k': 60}}


def test_search_ragf_kb_uses_weighted_ranker_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _FakeMilvusClient()
    _patch_milvus(monkeypatch, client)
    _hybrid_search(fusion_mode='weighted', vector_weight=0.6, bm25_weight=0.4)
    payload = client.hybrid_calls[0]['ranker'].dict()
    assert payload['strategy'] == 'weighted'
    assert [round(float(weight), 4) for weight in payload['params']['weights']] == [0.6, 0.4]


def test_search_ragf_kb_rejects_unknown_fusion_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    """未知融合模式显式拒绝（不静默退回 rrf）。"""
    client = _FakeMilvusClient()
    _patch_milvus(monkeypatch, client)
    with pytest.raises(ValueError, match='fusion_mode'):
        _hybrid_search(fusion_mode='max')
