"""DashScope SDK 客户端单测（千问平台 token 通道，stub SDK 无网络）。

通过向 ``sys.modules['dashscope']`` 注入桩模块验证调用约定（MultiModalEmbedding /
TextReRank）、维度对齐、L2 归一与批拆分。
"""

from __future__ import annotations

import math
import sys

from types import ModuleType, SimpleNamespace

import pytest

from backend.src.app.model_provider.providers.dashscope_clients import (
    DASHSCOPE_BATCH_LIMIT,
    DashScopeEmbedding,
    DashScopeError,
    DashScopeTextReRank,
    _l2_normalize,
)


class _StubMultiModal:
    """记录调用参数、返回固定维度向量的桩。"""

    dim = 4
    calls: list[dict] = []

    @classmethod
    def call(
        cls, *, model: str, input: list, api_key: str | None = None, dimension: int | None = None, **kwargs
    ) -> SimpleNamespace:
        cls.calls.append({'model': model, 'input': input, 'dimension': dimension})
        embeddings = [{'index': i, 'embedding': [1.0 + i, 0.0, 0.0, 0.0]} for i, _ in enumerate(input)]
        return SimpleNamespace(status_code=200, output={'embeddings': embeddings})


@pytest.fixture()
def stub_dashscope(monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    module = ModuleType('dashscope')
    module.__dict__['MultiModalEmbedding'] = _StubMultiModal
    module.__dict__['TextReRank'] = _StubTextReRank
    monkeypatch.setitem(sys.modules, 'dashscope', module)
    _StubMultiModal.calls = []
    _StubTextReRank.calls = []
    return module


class _StubTextReRank:
    calls: list[dict] = []

    @classmethod
    def call(
        cls,
        *,
        model: str,
        query: str,
        documents: list,
        top_n: int | None = None,
        return_documents: bool | None = None,
        api_key: str | None = None,
        **kwargs,
    ) -> SimpleNamespace:
        cls.calls.append({'model': model, 'query': query, 'documents': documents, 'top_n': top_n})
        return SimpleNamespace(
            status_code=200,
            output={
                'results': [
                    {'index': len(documents) - 1 - i, 'relevance_score': 0.5 + i * 0.1} for i in range(len(documents))
                ]
            },
        )


def test_embedding_calling_convention_matches_platform_sdk(stub_dashscope: ModuleType) -> None:
    """调用形态对齐平台示例：MultiModalEmbedding.call(model, input=[{'text': ...}])。"""
    client = DashScopeEmbedding(model='qwen3.7-text-embedding-flash', api_key='sk-test', dimension=4)
    vectors = client._call_sync(['通用多模态表征模型示例'])
    assert len(vectors) == 1
    call = _StubMultiModal.calls[0]
    assert call['model'] == 'qwen3.7-text-embedding-flash'
    assert call['input'] == [{'text': '通用多模态表征模型示例'}]
    assert call['dimension'] == 4
    # L2 归一
    assert math.isclose(sum(x * x for x in vectors[0]), 1.0)


def test_embedding_batch_split_by_sdk_limit(stub_dashscope: ModuleType) -> None:
    client = DashScopeEmbedding(model='qwen3.7-text-embedding-flash', api_key='sk', dimension=4)
    texts = [f't{i}' for i in range(DASHSCOPE_BATCH_LIMIT + 3)]
    vectors = client._call_sync(texts)
    assert len(vectors) == DASHSCOPE_BATCH_LIMIT + 3
    assert len(_StubMultiModal.calls) == 2  # 10 + 3 两批


def test_embedding_abatch_encode_async(stub_dashscope: ModuleType) -> None:
    import asyncio

    client = DashScopeEmbedding(model='qwen3-vl-embedding', api_key='sk', dimension=4)
    vectors = asyncio.run(client.abatch_encode(['a', 'b', 'c']))
    assert len(vectors) == 3
    assert all(len(v) == 4 for v in vectors)


def test_embedding_dimension_mismatch_fails_closed(stub_dashscope: ModuleType) -> None:
    client = DashScopeEmbedding(model='m', api_key='sk', dimension=8)  # 桩固定回 4 维
    with pytest.raises(DashScopeError):
        client._call_sync(['x'])


def test_embedding_missing_api_key_fails_closed() -> None:
    client = DashScopeEmbedding(model='m', api_key='')
    with pytest.raises(DashScopeError):
        client._call_sync(['x'])


def test_rerank_sdk_call_and_ordering(stub_dashscope: ModuleType) -> None:
    """TextReRank.call 结果按 index 还原原序分数。"""
    reranker = DashScopeTextReRank(model='qwen3.7-text-rerank', api_key='sk')
    scores = reranker._call_sync('查询', ['文档A', '文档B', '文档C'])
    call = _StubTextReRank.calls[0]
    assert call['model'] == 'qwen3.7-text-rerank'
    assert call['top_n'] == 3
    # 桩 index 0 得分最高（0.7），按原序还原后首位最高
    assert scores[0] > scores[-1]
    assert math.isclose(scores[0], 0.7)


def test_rerank_acompute_score_batched(stub_dashscope: ModuleType) -> None:
    import asyncio

    reranker = DashScopeTextReRank(model='qwen3.7-text-rerank', api_key='sk', batch_size=2)
    scores = asyncio.run(reranker.acompute_score('q', ['d1', 'd2', 'd3']))
    assert len(scores) == 3
    assert len(_StubTextReRank.calls) == 2  # 2 + 1 两批


def test_l2_normalize_zero_vector() -> None:
    assert _l2_normalize([0.0, 0.0]) == [0.0, 0.0]
