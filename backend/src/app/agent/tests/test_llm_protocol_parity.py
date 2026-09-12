"""两条模型链路的一致性测试（agentic-rag spec 4.1 的漂移风险点）。

同一 provider 模型行会被 `/chat`（自研 httpx 客户端）与 `/agent`（LangChain
`ChatOpenAI` 子类）使用，两者必须发出**等价请求体**。这里不做「逐字节相同」的
脆弱断言，只钉住三条共用协议规则：thinking_level 翻译、token 上限字段名、
base_url 与 `/chat/completions` 的互推——任一侧单独改动都会红。
"""

from __future__ import annotations

from typing import Any

import pytest

from langchain_core.messages import HumanMessage

from backend.src.app.agent.service.model_adapter import build_agent_chat_model
from backend.src.app.model_provider.cache import ModelInfo
from backend.src.app.model_provider.providers.chat import (
    build_chat_payload,
    ensure_chat_completions_url,
)
from backend.src.common.llm_protocol import api_root_url, chat_completions_url

_FRAGMENT_KEYS = ('reasoning_effort', 'chat_template_kwargs')


def _info() -> ModelInfo:
    return ModelInfo(
        provider_id='acme',
        model_id='qwen-max',
        model_type='chat',
        display_name='qwen-max',
        api_key='sk-test',
        base_url='http://llm.local/v1',
        provider_type='openai',
    )


def _fragment(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: payload[key] for key in _FRAGMENT_KEYS if key in payload}


def _agent_payload(**kwargs: Any) -> dict[str, Any]:
    model = build_agent_chat_model(_info(), **kwargs)
    return model._get_request_payload([HumanMessage('hi')])


@pytest.mark.parametrize('level', [None, 'off', 'low', 'medium', 'high', 'bogus'])
def test_thinking_level_fragment_matches_between_paths(level: str | None) -> None:
    chat_fragment = _fragment(build_chat_payload(model='m', messages=[], thinking_level=level))
    agent_fragment = _fragment(
        build_agent_chat_model(_info())._get_request_payload([HumanMessage('hi')], thinking_level=level)
    )
    assert chat_fragment == agent_fragment
    # 未知取值必须被丢弃，不能落进请求体（严格服务端会 400）
    if level == 'bogus':
        assert chat_fragment == {}


def test_token_limit_field_name_matches_between_paths() -> None:
    chat_payload = build_chat_payload(model='m', messages=[], max_tokens=128)
    agent_payload = _agent_payload(max_tokens=128)
    assert chat_payload['max_tokens'] == 128
    assert 'max_completion_tokens' not in chat_payload
    assert agent_payload['max_tokens'] == 128
    assert 'max_completion_tokens' not in agent_payload


@pytest.mark.parametrize(
    'base',
    ['http://llm.local/v1', 'http://llm.local/v1/', 'http://llm.local/v1/chat/completions'],
)
def test_url_conversion_is_invertible(base: str) -> None:
    """chat 侧拼 URL、agent 侧剥后缀，互为逆运算（同一 base_url 输入必得同一端点）。"""
    url = ensure_chat_completions_url(base)
    assert url == f'{api_root_url(base)}/chat/completions'
    assert chat_completions_url(api_root_url(base)) == url


def test_stream_options_are_chat_side_only() -> None:
    """usage 由 chat 侧显式索取（stream_options）；agent 侧走 LangChain stream_usage。"""
    assert build_chat_payload(model='m', messages=[], stream=True)['stream_options'] == {'include_usage': True}
    assert 'stream_options' not in _agent_payload()
