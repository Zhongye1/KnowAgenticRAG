"""model_provider 域单元测试（ragf-design §11/D11/D16/M6 验收：纯函数与协议形状，无网络）。

覆盖：legacy spec 兼容、provider 行构建 ModelInfo、key 回退、模型项/能力校验、
rerank 协议类 payload 形状与常量（32/512/30s）、embedding 客户端装配。
"""

from __future__ import annotations

import pytest

from backend.src.app.model_provider.cache import ModelInfo, build_model_info, resolve_provider_api_key
from backend.src.app.model_provider.model.provider import ModelProvider
from backend.src.app.model_provider.providers.embed import ensure_embeddings_url
from backend.src.app.model_provider.providers.rerank import (
    RERANK_BATCH_SIZE,
    RERANK_MAX_LENGTH,
    RERANK_TIMEOUT_SECONDS,
    OpenAIReranker,
    ensure_rerank_url,
    sigmoid,
)
from backend.src.app.model_provider.service.model_factory import get_reranker, select_embedding_model
from backend.src.app.model_provider.service.provider_service import (
    _normalize_model_item,
    _validate_capabilities,
    normalize_model_spec,
)
from backend.src.common.exception import errors
from backend.src.core.config import settings


def _provider(**overrides: object) -> ModelProvider:
    base: dict[str, object] = {
        'provider_id': 'modelscope',
        'display_name': 'ModelScope API',
        'provider_type': 'modelscope',
        'base_url': 'https://api-inference.modelscope.cn/v1',
        'api_key': '',
        'api_key_env': 'MODELSCOPE_ACCESS_TOKEN',
        'capabilities': ['embedding', 'rerank'],
        'enabled_models': [
            {'id': 'BAAI/bge-m3', 'type': 'embedding', 'dimension': 1024, 'batch_size': 200},
            {'id': 'BAAI/bge-reranker-v2-m3', 'type': 'rerank', 'extra': {'rerank_protocol': 'openai'}},
        ],
        'is_enabled': True,
        'is_builtin': True,
    }
    base.update(overrides)
    return ModelProvider(**base)


def test_normalize_model_spec_strips_whitespace() -> None:
    """归一只做去空白（裸 id 兼容别名已随 HF 通道删除）：spec 原样保留，未知 spec 由查找方报 NotFound。"""
    spec = 'dashscope:qwen3.7-text-embedding-flash'
    assert normalize_model_spec(f'  {spec}  ') == spec
    assert normalize_model_spec('modelscope:BAAI/bge-m3') == 'modelscope:BAAI/bge-m3'
    assert normalize_model_spec('deepseek/deepseek-chat') == 'deepseek/deepseek-chat'
    assert not normalize_model_spec('')
    assert not normalize_model_spec(None)
    assert not normalize_model_spec('   ')


def test_build_model_info_embedding_defaults() -> None:
    """ModelInfo：dimension/batch_size（D17 默认 200）/spec 装配正确。"""
    provider = _provider()
    info = build_model_info(provider, {'id': 'BAAI/bge-m3', 'type': 'embedding', 'dimension': 1024})
    assert info is not None
    assert info.spec == 'modelscope:BAAI/bge-m3'
    assert info.dimension == 1024
    assert info.batch_size == 200  # 未显式给 batch_size → 默认 200
    assert info.provider_type == 'modelscope'


def test_resolve_provider_api_key_fallback_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """api_key 为空 → 回退 api_key_env 环境变量（D11 modelscope 默认通道）。"""
    monkeypatch.setenv('MODELSCOPE_ACCESS_TOKEN', 'sk-fallback')
    provider = _provider()
    info = build_model_info(provider, {'id': 'BAAI/bge-m3', 'type': 'embedding'})
    assert info is not None and info.api_key == 'sk-fallback'


def test_resolve_provider_api_key_direct_wins(monkeypatch: pytest.MonkeyPatch) -> None:
    """直配 api_key 优先于 api_key_env 与 modelscope 默认 env。"""
    monkeypatch.setenv('MODELSCOPE_ACCESS_TOKEN', 'sk-env')
    provider = _provider(api_key='sk-direct')
    assert resolve_provider_api_key(provider) == 'sk-direct'


def test_resolve_provider_api_key_modelscope_env_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """无 api_key/api_key_env → modelscope provider 回退 settings（服务端 env 默认通道）。"""
    monkeypatch.setattr(settings, 'MODELSCOPE_ACCESS_TOKEN', 'sk-server-default')
    provider = _provider(api_key_env=None)
    assert resolve_provider_api_key(provider) == 'sk-server-default'


def test_resolve_provider_api_key_env_empty_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    """api_key_env 对应环境变量为空串 → 视同未配置，modelscope 回退服务端默认（空值不产生假凭据）。"""
    monkeypatch.setenv('MODELSCOPE_ACCESS_TOKEN', '')
    monkeypatch.setattr(settings, 'MODELSCOPE_ACCESS_TOKEN', 'sk-server-default')
    provider = _provider()
    assert resolve_provider_api_key(provider) == 'sk-server-default'


def test_resolve_provider_api_key_non_modelscope_without_key() -> None:
    """非 modelscope 且无任何凭据来源 → None（不误用默认通道）。"""
    provider = _provider(provider_type='openai', base_url='https://api.example.com', api_key_env=None)
    assert resolve_provider_api_key(provider) is None


def test_build_model_info_skips_invalid() -> None:
    provider = _provider()
    assert build_model_info(provider, {'id': '', 'type': 'embedding'}) is None
    assert build_model_info(provider, {'id': 'x', 'type': 'vision'}) is None


def test_validate_capabilities_and_model_item() -> None:
    with pytest.raises(errors.RequestError):
        _validate_capabilities(['embedding', 'vision'])
    assert _validate_capabilities(['embedding', 'rerank', 'rerank']) == ['embedding', 'rerank']

    row = _normalize_model_item(
        {'id': 'm1', 'type': 'embedding', 'dimension': '512', 'batch_size': '64', 'extra': {'x': 1}},
        {'embedding'},
        set(),
    )
    assert row['dimension'] == 512 and row['batch_size'] == 64 and row['extra'] == {'x': 1}
    with pytest.raises(errors.RequestError):
        _normalize_model_item({'id': 'm1', 'type': 'chat'}, {'embedding'}, set())
    seen: set[str] = {'dup'}
    with pytest.raises(errors.RequestError):
        _normalize_model_item({'id': 'dup', 'type': 'embedding'}, None, seen)


def test_rerank_constants_and_sigmoid() -> None:
    """D17：rerank 客户端常量 32/512/30s 硬编码；sigmoid 归一化边界。"""
    assert (RERANK_BATCH_SIZE, RERANK_MAX_LENGTH) == (32, 512)
    assert pytest.approx(30.0) == RERANK_TIMEOUT_SECONDS
    assert sigmoid(0.0) == pytest.approx(0.5)
    assert sigmoid(100.0) == pytest.approx(1.0)
    assert sigmoid(-100.0) == pytest.approx(0.0)


def test_rerank_protocol_payload_shapes() -> None:
    """D16：OpenAI 兼容 /rerank 与 DashScope payload 形状/URL 推断。"""
    openai = OpenAIReranker(
        model='BAAI/bge-reranker-v2-m3',
        base_url='https://api-inference.modelscope.cn/v1/rerank',
        api_key='sk',
    )
    assert openai.url == 'https://api-inference.modelscope.cn/v1/rerank'
    payload = openai._build_payload('查询', ['文档一', '文档二'])
    assert payload == {
        'model': 'BAAI/bge-reranker-v2-m3',
        'query': '查询',
        'documents': ['文档一', '文档二'],
        'max_chunks_per_doc': 512,
    }
    assert openai._extract_results({'results': [{'index': 0}]}) == [{'index': 0}]


def test_url_ensure_helpers() -> None:
    assert ensure_rerank_url('https://x/v1') == 'https://x/v1/rerank'
    assert ensure_rerank_url('https://x/v1/rerank') == 'https://x/v1/rerank'
    assert ensure_embeddings_url('https://x/v1') == 'https://x/v1/embeddings'
    assert ensure_embeddings_url('https://x/v1/embeddings') == 'https://x/v1/embeddings'


def test_select_embedding_model_rejects_non_embedding() -> None:
    info = ModelInfo(
        provider_id='modelscope',
        model_id='BAAI/bge-reranker-v2-m3',
        model_type='rerank',
        display_name='rerank',
        api_key='sk',
        base_url='https://x/v1',
        provider_type='modelscope',
    )
    with pytest.raises(errors.RequestError):
        select_embedding_model(info)


def test_get_reranker_protocol_dispatch(monkeypatch: pytest.MonkeyPatch) -> None:
    """extra.rerank_protocol 决定协议类：缺省 openai，dashscope-sdk 走千问 SDK 通道。"""
    provider = _provider()
    openai_info = build_model_info(provider, {'id': 'BAAI/bge-reranker-v2-m3', 'type': 'rerank'})
    assert openai_info is not None
    assert isinstance(get_reranker(openai_info), OpenAIReranker)

    sdk_provider = _provider(
        provider_id='dashscope',
        provider_type='dashscope',
        api_key_env='DASHSCOPE_API_KEY',
        base_url='',
        enabled_models=[{'id': 'qwen3.7-text-rerank', 'type': 'rerank', 'extra': {'rerank_protocol': 'dashscope-sdk'}}],
    )
    sdk_info = build_model_info(sdk_provider, sdk_provider.enabled_models[0])
    assert sdk_info is not None
    from backend.src.app.model_provider.providers.dashscope_clients import DashScopeTextReRank

    assert isinstance(get_reranker(sdk_info), DashScopeTextReRank)
