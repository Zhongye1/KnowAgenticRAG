"""HF Inference 客户端测试（embed 特征抽取 + rerank text-classification 通道）。"""

from __future__ import annotations

import asyncio

import pytest

from backend.src.app.model_provider.cache import ModelInfo
from backend.src.app.model_provider.providers.embed import (
    HF_INFERENCE_BASE_URL,
    HuggingFaceEmbedding,
    normalize_hf_embeddings,
)
from backend.src.app.model_provider.providers.rerank import HuggingFaceReranker, hf_positive_score
from backend.src.app.model_provider.service.model_factory import get_reranker, select_embedding_model


def _info(provider_type: str = 'huggingface', extra: dict | None = None) -> ModelInfo:
    return ModelInfo(
        provider_id='huggingface',
        model_id='BAAI/bge-m3',
        model_type='embedding',
        display_name='BAAI/bge-m3',
        api_key='hf_token',
        base_url='',
        provider_type=provider_type,
        extra=extra or {},
        dimension=1024,
        batch_size=16,
    )


# ---------------------------------------------------------------- embed


def test_hf_embedding_url_and_payload() -> None:
    client = HuggingFaceEmbedding(model='BAAI/bge-m3', api_key='hf_token')
    assert client.url == f'{HF_INFERENCE_BASE_URL}/models/BAAI/bge-m3'
    assert client._payload(['a', 'b']) == {'inputs': ['a', 'b']}

    custom = HuggingFaceEmbedding(
        model='bge-m3', base_url='https://router.huggingface.co/hf-inference/', api_key='k', repo_id='BAAI/bge-m3'
    )
    assert custom.url == 'https://router.huggingface.co/hf-inference/models/BAAI/bge-m3'


def test_normalize_hf_embeddings_variants() -> None:
    vec = [1.0, 2.0, 3.0]
    assert normalize_hf_embeddings([vec, vec]) == [vec, vec]  # 批次
    assert normalize_hf_embeddings(vec) == [vec]  # 单条向量
    assert normalize_hf_embeddings({'embeddings': [vec]}) == [vec]  # dict 包装
    assert normalize_hf_embeddings([[[1.0, 2.0]]]) == [[1.0, 2.0]]  # 三层嵌套
    with pytest.raises(ValueError):
        normalize_hf_embeddings([])


def test_factory_builds_hf_clients_by_provider_type() -> None:
    embed = select_embedding_model(_info())
    assert isinstance(embed, HuggingFaceEmbedding)
    assert embed.url == f'{HF_INFERENCE_BASE_URL}/models/BAAI/bge-m3'
    assert embed.batch_size == 16

    rerank_info = ModelInfo(
        provider_id='huggingface',
        model_id='BAAI/bge-reranker-v2-m3',
        model_type='rerank',
        display_name='reranker',
        api_key='hf_token',
        base_url='',
        provider_type='huggingface',
    )
    reranker = get_reranker(rerank_info)
    assert isinstance(reranker, HuggingFaceReranker)
    assert reranker.url == f'{HF_INFERENCE_BASE_URL}/models/BAAI/bge-reranker-v2-m3'

    # 非 HF provider 仍走 OpenAI 兼容通道
    assert not isinstance(select_embedding_model(_info(provider_type='modelscope')), HuggingFaceEmbedding)


# ---------------------------------------------------------------- rerank


def test_hf_positive_score_variants() -> None:
    assert hf_positive_score({'label': 'LABEL_1', 'score': 0.9}) == pytest.approx(0.9)  # 正类标签
    binary = [{'label': 'LABEL_0', 'score': 0.2}, {'label': 'LABEL_1', 'score': 0.8}]
    assert hf_positive_score(binary) == pytest.approx(0.8)
    assert hf_positive_score({'label': 'LABEL_0', 'score': 0.7}) == pytest.approx(0.7)  # 单标签回归头
    assert hf_positive_score('bad') == pytest.approx(0.0)


def test_hf_reranker_payload_and_extract() -> None:
    reranker = HuggingFaceReranker(model='BAAI/bge-reranker-v2-m3', api_key='hf_token')
    payload = reranker._build_payload('查询', ['文档一', '文档二'])
    assert payload['inputs'][0] == {'text': '查询', 'text_pair': '文档一'}
    assert payload['inputs'][1]['text_pair'] == '文档二'

    raw = [
        [{'label': 'LABEL_0', 'score': 0.2}, {'label': 'LABEL_1', 'score': 0.9}],
        [{'label': 'LABEL_0', 'score': 0.4}, {'label': 'LABEL_1', 'score': 0.1}],
    ]
    results = reranker._extract_results(raw)
    assert [row['relevance_score'] for row in results] == pytest.approx([0.9, 0.1])


def test_hf_reranker_no_double_sigmoid() -> None:
    """HF 分数已是 0..1 概率：acompute_score 不再做二次 sigmoid。"""
    reranker = HuggingFaceReranker(model='BAAI/bge-reranker-v2-m3', api_key='hf_token')

    async def fake_batch(query: str, documents: list[str]) -> list[float]:  # ruff: ignore[unused-async]
        return [0.9, 0.1]

    reranker._batch_rerank = fake_batch  # type: ignore[method-assign]
    scores = asyncio.run(reranker.acompute_score('查询', ['a', 'b']))
    assert scores == pytest.approx([0.9, 0.1])  # 若二次 sigmoid，0.9 会被压成 ~0.71
