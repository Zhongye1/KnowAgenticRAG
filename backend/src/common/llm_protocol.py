"""OpenAI 兼容 Chat Completions 的协议约定（chat 通道与 agent 适配层共用）。

同一个 provider 模型行会被两条链路使用：

- ``model_provider.providers.chat.OpenAICompatibleChatModel``（自研 httpx 客户端，/chat 与 MCP 用）；
- ``agent.service.model_adapter.AgentChatModel``（LangChain ``ChatOpenAI`` 子类，/agent 用）。

两者必须发出**等价请求体**，否则「同一模型在 /chat 与 /agent 表现不一致」这类问题
极难定位（agentic-rag spec 4.1 的漂移风险点）。本模块把三条共用的协议规则收在一处：
``thinking_level`` 翻译、token 上限字段名、base_url 与 ``/chat/completions`` 的拼接。

刻意保持纯函数 + 零依赖（common 层不 import 任何 app 模块）。
"""

from __future__ import annotations

from typing import Any

__all__ = [
    'CHAT_COMPLETIONS_SUFFIX',
    'THINKING_EFFORT_LEVELS',
    'api_root_url',
    'apply_thinking_level',
    'chat_completions_url',
    'normalize_max_tokens_field',
]

CHAT_COMPLETIONS_SUFFIX = '/chat/completions'

# chat 域语义 thinking_level：low/medium/high → reasoning_effort；off → Qwen 系开关
THINKING_EFFORT_LEVELS = frozenset({'low', 'medium', 'high'})

_THINKING_OFF_PAYLOAD: dict[str, Any] = {'chat_template_kwargs': {'enable_thinking': False}}


def apply_thinking_level(payload: dict[str, Any], thinking_level: str | None) -> dict[str, Any]:
    """把 ``thinking_level`` 就地翻译进请求体（未知取值忽略，不落进请求体）。

    ``low/medium/high`` → OpenAI 兼容的 ``reasoning_effort``；
    ``off`` → Qwen 系（vLLM/DashScope）的 ``chat_template_kwargs.enable_thinking=false``。
    """
    if thinking_level in THINKING_EFFORT_LEVELS:
        payload['reasoning_effort'] = thinking_level
    elif thinking_level == 'off':
        payload['chat_template_kwargs'] = dict(_THINKING_OFF_PAYLOAD['chat_template_kwargs'])
    return payload


def api_root_url(base_url: str) -> str:
    """剥离 ``/chat/completions`` 后缀（LangChain 需 API 根，自行拼接路径）。"""
    url = (base_url or '').strip().rstrip('/')
    if url.endswith(CHAT_COMPLETIONS_SUFFIX):
        return url[: -len(CHAT_COMPLETIONS_SUFFIX)]
    return url


def chat_completions_url(base_url: str) -> str:
    """推断 Chat Completions 端点：已是该路径则原样，否则拼接（空 base_url → ``/chat/completions``）。"""
    url = (base_url or '').rstrip('/')
    if url.endswith(CHAT_COMPLETIONS_SUFFIX):
        return url
    return f'{url}{CHAT_COMPLETIONS_SUFFIX}'


def normalize_max_tokens_field(payload: dict[str, Any]) -> dict[str, Any]:
    """LangChain 会写 ``max_completion_tokens``；本仓库两条链路统一发 ``max_tokens``。

    部分 OpenAI 兼容服务（vLLM/ollama/自建网关）未跟进新字段名。
    """
    if 'max_completion_tokens' in payload and 'max_tokens' not in payload:
        payload['max_tokens'] = payload.pop('max_completion_tokens')
    return payload
