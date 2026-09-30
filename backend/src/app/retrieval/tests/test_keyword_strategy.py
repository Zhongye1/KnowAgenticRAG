"""keyword 检索模式测试（D58）：纯 BM25 词面召回、三模式互斥、编排层不编码查询向量。

覆盖四层：

1. 参数白名单：``SEARCH_MODES`` 收纳 keyword，request 与 KB ``query_params`` 两层均可选；
2. 策略：逐子查询 BM25 召回 + 跨查询 RRF 融合，且不受余弦阈值约束（BM25 是词面分）；
3. Milvus 门面：三模式互斥（未知模式仍拒），keyword 只打 ``content_sparse`` 字段；
4. 编排：keyword 跳过 ``aencode`` 但仍解析 dense 维度以定位 ``ragf_<dim>`` 集合。

依赖全部注入替身，无 DB/Milvus/网络。
"""

from __future__ import annotations

import asyncio

from typing import Any

import pytest

from backend.src.app.retrieval.service.params import SEARCH_MODES, default_search_params, merge_search_params
from backend.src.app.retrieval.service.retrieval_service import RetrievalService
from backend.src.app.retrieval.service.strategies import RETRIEVE_STRATEGIES
from backend.src.app.retrieval.service.strategies import keyword as keyword_mod
from backend.src.app.retrieval.service.strategies.keyword import retrieve_keyword
from backend.src.app.retrieval.tests.test_retrieval_service import (
    FakeChunkSource,
    FakeDocDao,
    FakeKb,
    FakeKbDao,
    FakeProvider,
)
from backend.src.common.exception import errors
from backend.src.database import milvus_kb_ops


def _hit(chunk_id: str, *, score: float = 0.9) -> dict[str, Any]:
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


# ------------------------------------------------------------------ 参数白名单
def test_search_modes_include_keyword() -> None:
    """D58：三模式互斥且都可跑，keyword 纳入白名单。"""
    assert {'vector', 'keyword', 'hybrid'} == SEARCH_MODES


def test_keyword_selectable_from_request_and_kb_layers() -> None:
    """request 与 KB query_params 两层都能选到 keyword（D17 三层覆盖）。"""
    assert merge_search_params(request={'search_mode': 'keyword'})['search_mode'] == 'keyword'
    assert merge_search_params(kb_query_params={'search_mode': 'keyword'})['search_mode'] == 'keyword'


def test_unknown_search_mode_still_ignored() -> None:
    """白名单外的模式仍被忽略（不引入新的静默接受面）。"""
    merged = merge_search_params(request={'search_mode': 'bm25'})
    assert merged['search_mode'] == default_search_params()['search_mode']


# ------------------------------------------------------------------ 策略层
def test_keyword_strategy_single_query_calls_bm25_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    """单查询：以 search_mode=keyword 召回，且不向门面传查询向量。"""
    calls: list[dict[str, Any]] = []

    def fake_search(**kwargs: Any) -> list[dict[str, Any]]:
        calls.append(kwargs)
        return [_hit('c1')]

    monkeypatch.setattr(keyword_mod, 'search_ragf_kb', fake_search)
    hits = asyncio.run(retrieve_keyword(_ctx(query_text='甲')))
    assert calls[0]['search_mode'] == 'keyword'
    assert 'query_embedding' not in calls[0]
    assert [hit['chunk_id'] for hit in hits] == ['c1']


def test_keyword_strategy_multi_query_fuses_without_embeddings(monkeypatch: pytest.MonkeyPatch) -> None:
    """多子查询逐路 BM25 → 跨查询 RRF（与 vector/hybrid 同一融合语义）。"""

    def fake_search(**kwargs: Any) -> list[dict[str, Any]]:
        return [_hit(f'{kwargs["query_text"]}-1'), _hit('shared')]

    monkeypatch.setattr(keyword_mod, 'search_ragf_kb', fake_search)
    hits = asyncio.run(retrieve_keyword(_ctx(query_texts=['甲', '乙'])))
    assert [hit['chunk_id'] for hit in hits] == ['shared', '甲-1', '乙-1']


def test_keyword_strategy_ignores_similarity_threshold(monkeypatch: pytest.MonkeyPatch) -> None:
    """BM25 分数不是余弦相似度，阈值不适用（同 hybrid 的理由）。"""

    def fake_search(**kwargs: Any) -> list[dict[str, Any]]:
        return [_hit('c1', score=0.01)]

    monkeypatch.setattr(keyword_mod, 'search_ragf_kb', fake_search)
    hits = asyncio.run(retrieve_keyword(_ctx(query_text='甲', similarity_threshold=0.99)))
    assert [hit['chunk_id'] for hit in hits] == ['c1']


def test_keyword_registered_alongside_existing_modes() -> None:
    assert set(RETRIEVE_STRATEGIES) == {'vector', 'hybrid', 'keyword'}


# ------------------------------------------------------------------ Milvus 门面
class _FakeMilvusClient:
    def __init__(self) -> None:
        self.search_calls: list[dict[str, Any]] = []

    def search(self, **kwargs: Any) -> list[list[dict[str, Any]]]:
        self.search_calls.append(kwargs)
        return [[]]


def _patch_milvus(monkeypatch: pytest.MonkeyPatch, client: _FakeMilvusClient) -> None:
    monkeypatch.setattr(milvus_kb_ops, 'ensure_ragf_template_collection', lambda **kwargs: 'ragf_3')
    monkeypatch.setattr(milvus_kb_ops, '_client', lambda namespace: client)


def test_search_ragf_kb_rejects_unknown_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    """未知模式仍显式拒绝（负向：守卫不能因为新增 keyword 而放宽）。"""
    client = _FakeMilvusClient()
    _patch_milvus(monkeypatch, client)
    with pytest.raises(ValueError, match='search_mode'):
        milvus_kb_ops.search_ragf_kb(kb_name='dev', dim=3, query_text='甲', search_mode='bm25')


def test_search_ragf_kb_keyword_uses_sparse_field_only(monkeypatch: pytest.MonkeyPatch) -> None:
    """keyword 只打稀疏字段，查询输入是原始文本而非向量。"""
    client = _FakeMilvusClient()
    _patch_milvus(monkeypatch, client)
    milvus_kb_ops.search_ragf_kb(kb_name='dev', dim=3, query_text='甲', search_mode='keyword')
    call = client.search_calls[0]
    assert call['anns_field'] == 'content_sparse'
    assert call['search_params']['metric_type'] == 'BM25'
    assert call['data'] == ['甲']


def test_search_ragf_kb_vector_still_requires_embedding(monkeypatch: pytest.MonkeyPatch) -> None:
    """既有守卫不回归：vector 模式缺向量仍报错。"""
    client = _FakeMilvusClient()
    _patch_milvus(monkeypatch, client)
    with pytest.raises(ValueError, match='query_embedding'):
        milvus_kb_ops.search_ragf_kb(kb_name='dev', dim=3, query_text='甲', search_mode='vector')


# ------------------------------------------------------------------ 编排层
class _NoDimensionEmbedding:
    """未声明维度的 embedding 替身（model 配置缺 dimension 的现场）。"""

    model = 'bge-m3'
    dimension = None

    async def aencode(self, texts: list[str] | str) -> list[list[float]]:
        raise AssertionError('keyword 模式不应触发编码')


def _service(provider: FakeProvider, ctxs: list[dict[str, Any]]) -> RetrievalService:
    async def strategy(ctx: dict[str, Any]) -> list[dict[str, Any]]:  # ruff: ignore[unused-async]
        ctxs.append(dict(ctx))
        return []

    return RetrievalService(
        chunk_source=FakeChunkSource({}),
        kb_dao=FakeKbDao([FakeKb('dev')]),
        doc_dao=FakeDocDao({}),
        provider=provider,
        strategies={'vector': strategy, 'hybrid': strategy, 'keyword': strategy},
    )


def test_keyword_mode_skips_embedding_encode_and_keeps_dim() -> None:
    """B2：keyword 不编码，但仍解析 dense 维度用于定位 ragf_<dim> 集合。"""
    provider = FakeProvider()
    ctxs: list[dict[str, Any]] = []
    service = _service(provider, ctxs)
    asyncio.run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='甲',
            param={'search_mode': 'keyword', 'use_reranker': False},
        )
    )
    assert provider.embedding.batches == []
    assert ctxs[0]['dim'] == 3


def test_hybrid_mode_still_encodes_query() -> None:
    """回归：非 keyword 模式仍走编码（B2 不得波及其他模式）。"""
    provider = FakeProvider()
    ctxs: list[dict[str, Any]] = []
    service = _service(provider, ctxs)
    asyncio.run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='甲',
            param={'use_reranker': False},
        )
    )
    assert provider.embedding.batches == [['甲']]


def test_keyword_mode_without_declared_dimension_fails_loudly() -> None:
    """维度未声明时显式失败（不静默编码、不猜集合）。"""
    provider = FakeProvider()
    provider.embedding = _NoDimensionEmbedding()  # type: ignore[assignment]
    ctxs: list[dict[str, Any]] = []
    service = _service(provider, ctxs)
    with pytest.raises(errors.RequestError, match='dimension'):
        asyncio.run(
            service.search(
                None,  # type: ignore[arg-type]
                kb_name='dev',
                query_text='甲',
                param={'search_mode': 'keyword', 'use_reranker': False},
            )
        )
