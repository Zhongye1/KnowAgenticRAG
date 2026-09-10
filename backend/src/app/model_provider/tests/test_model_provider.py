"""model_provider 域单元测试（ragf-design §11/D11/D16/M6 验收：纯函数与协议形状，无网络）。

覆盖：spec 归一、provider 行构建 ModelInfo、key 回退（api_key / api_key_env / dashscope
settings 兜底）、模型项/能力校验、千问 SDK 重排通道分派、embedding 客户端装配。
"""

from __future__ import annotations

import pytest

from backend.src.app.model_provider.cache import ModelInfo, build_model_info, resolve_provider_api_key
from backend.src.app.model_provider.model.provider import ModelProvider
from backend.src.app.model_provider.providers.dashscope_clients import DashScopeTextReRank
from backend.src.app.model_provider.providers.embed import ensure_embeddings_url
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
        'provider_id': 'custom_openai',
        'display_name': '自定义 OpenAI 兼容',
        'provider_type': 'openai',
        'base_url': 'https://api.example.com/v1',
        'api_key': '',
        'api_key_env': 'CUSTOM_OPENAI_API_KEY',
        'capabilities': ['embedding', 'rerank', 'chat'],
        'enabled_models': [
            {'id': 'text-embedding-custom', 'type': 'embedding', 'dimension': 1024, 'batch_size': 200},
            {'id': 'qwen3.7-text-rerank', 'type': 'rerank', 'extra': {'rerank_protocol': 'dashscope-sdk'}},
        ],
        'is_enabled': True,
        'is_builtin': False,
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
    info = build_model_info(provider, {'id': 'text-embedding-custom', 'type': 'embedding', 'dimension': 1024})
    assert info is not None
    assert info.spec == 'custom_openai:text-embedding-custom'
    assert info.dimension == 1024
    assert info.batch_size == 200  # 未显式给 batch_size → 默认 200
    assert info.provider_type == 'openai'


def test_resolve_provider_api_key_fallback_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """api_key 为空 → 回退 api_key_env 环境变量。"""
    monkeypatch.setenv('CUSTOM_OPENAI_API_KEY', 'sk-fallback')
    provider = _provider()
    info = build_model_info(provider, {'id': 'text-embedding-custom', 'type': 'embedding'})
    assert info is not None and info.api_key == 'sk-fallback'


def test_resolve_provider_api_key_direct_wins(monkeypatch: pytest.MonkeyPatch) -> None:
    """直配 api_key 优先于 api_key_env。"""
    monkeypatch.setenv('CUSTOM_OPENAI_API_KEY', 'sk-env')
    provider = _provider(api_key='sk-direct')
    assert resolve_provider_api_key(provider) == 'sk-direct'


def test_resolve_provider_api_key_dashscope_settings_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """dashscope provider 无 api_key/api_key_env → 回退 settings.DASHSCOPE_API_KEY。"""
    monkeypatch.setattr(settings, 'DASHSCOPE_API_KEY', 'sk-dashscope')
    provider = _provider(
        provider_id='dashscope',
        provider_type='dashscope',
        api_key_env=None,
        base_url='',
    )
    assert resolve_provider_api_key(provider) == 'sk-dashscope'


def test_resolve_provider_api_key_without_key() -> None:
    """无任何凭据来源 → None（不误用默认通道）。"""
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


def test_url_ensure_helpers() -> None:
    assert ensure_embeddings_url('https://x/v1') == 'https://x/v1/embeddings'
    assert ensure_embeddings_url('https://x/v1/embeddings') == 'https://x/v1/embeddings'


def test_select_embedding_model_rejects_non_embedding() -> None:
    info = ModelInfo(
        provider_id='custom_openai',
        model_id='qwen3.7-text-rerank',
        model_type='rerank',
        display_name='rerank',
        api_key='sk',
        base_url='https://x/v1',
        provider_type='openai',
    )
    with pytest.raises(errors.RequestError):
        select_embedding_model(info)


def test_get_reranker_requires_dashscope_sdk_protocol() -> None:
    """重排仅支持千问 SDK 通道（dashscope-sdk）；openai 协议 rerank 已下线。"""
    sdk_provider = _provider(
        provider_id='dashscope',
        provider_type='dashscope',
        api_key_env='DASHSCOPE_API_KEY',
        base_url='',
        enabled_models=[{'id': 'qwen3.7-text-rerank', 'type': 'rerank', 'extra': {'rerank_protocol': 'dashscope-sdk'}}],
    )
    sdk_info = build_model_info(sdk_provider, sdk_provider.enabled_models[0])
    assert sdk_info is not None
    assert isinstance(get_reranker(sdk_info), DashScopeTextReRank)

    openai_info = build_model_info(_provider(), {'id': 'qwen3.7-text-rerank', 'type': 'rerank'})
    assert openai_info is not None
    with pytest.raises(errors.RequestError, match='dashscope-sdk'):
        get_reranker(openai_info)
