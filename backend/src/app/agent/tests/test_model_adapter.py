"""model_adapter 单测：ModelInfo → LangChain ``ChatOpenAI`` 的两个协议差异。

不触网络：只构造模型并检查请求体（``_get_request_payload`` 是纯函数），
覆盖 URL 归一、``thinking_level`` 翻译、token 上限字段名与 fail-closed 校验。
"""

from __future__ import annotations

import pytest

from langchain_core.messages import HumanMessage

from backend.src.app.agent.service.model_adapter import build_agent_chat_model
from backend.src.app.model_provider.cache import ModelInfo
from backend.src.common.exception import errors


def _info(**overrides: object) -> ModelInfo:
    base: dict[str, object] = {
        'provider_id': 'acme',
        'model_id': 'qwen-max',
        'model_type': 'chat',
        'display_name': 'qwen-max',
        'api_key': 'sk-test',
        'base_url': 'http://llm.local/v1',
        'provider_type': 'openai',
    }
    base.update(overrides)
    return ModelInfo(**base)  # type: ignore[arg-type]


def _payload(info: ModelInfo, **kwargs: object) -> dict:
    model = build_agent_chat_model(info, **kwargs)  # type: ignore[arg-type]
    return model._get_request_payload([HumanMessage('hi')])


def test_chat_completions_suffix_is_stripped_for_langchain() -> None:
    """自研客户端接受 /chat/completions 后缀，LangChain 需要 API 根。"""
    model = build_agent_chat_model(_info(base_url='http://llm.local/v1/chat/completions'))
    assert model.openai_api_base == 'http://llm.local/v1'


def test_thinking_level_maps_to_reasoning_effort_and_not_leaked() -> None:
    model = build_agent_chat_model(_info())
    payload = model._get_request_payload([HumanMessage('hi')], thinking_level='high')
    assert payload['reasoning_effort'] == 'high'
    assert 'thinking_level' not in payload


def test_thinking_off_maps_to_qwen_enable_thinking_flag() -> None:
    model = build_agent_chat_model(_info())
    payload = model._get_request_payload([HumanMessage('hi')], thinking_level='off')
    assert payload['chat_template_kwargs'] == {'enable_thinking': False}
    assert 'thinking_level' not in payload


def test_token_limit_uses_max_tokens_for_compatible_servers() -> None:
    """父类会改名 max_completion_tokens；兼容服务沿用了 max_tokens 语义。"""
    payload = _payload(_info(), max_tokens=128)
    assert payload['max_tokens'] == 128
    assert 'max_completion_tokens' not in payload


def test_request_payload_keeps_model_and_messages() -> None:
    payload = _payload(_info())
    assert payload['model'] == 'qwen-max'
    assert payload['messages'][0]['content'] == 'hi'


def test_blank_api_key_falls_back_to_placeholder() -> None:
    model = build_agent_chat_model(_info(api_key=''))
    api_key = model.openai_api_key
    assert api_key is not None
    assert api_key.get_secret_value() == 'not-required'


def test_non_chat_model_is_rejected() -> None:
    with pytest.raises(errors.RequestError):
        build_agent_chat_model(_info(model_type='embedding'))


def test_missing_base_url_is_rejected() -> None:
    with pytest.raises(errors.RequestError):
        build_agent_chat_model(_info(base_url=''))
