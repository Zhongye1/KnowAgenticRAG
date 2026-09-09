"""OpenAI 兼容 Chat Completions 流式客户端（ragf-design D18/M9）。

请求走 ``POST {base}/chat/completions``（base_url 以 /chat/completions 结尾则原样），
``stream=true`` + ``stream_options.include_usage``；SSE 行解析为纯函数便于单测。
协议对齐 OpenAI Chat Completions：``choices[0].delta / finish_reason / usage``。
"""

from __future__ import annotations

import json

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import httpx

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Iterable, Iterator

CHAT_TIMEOUT_SECONDS = 120.0
_SSE_DONE = '[DONE]'


def ensure_chat_completions_url(base_url: str) -> str:
    """Chat Completions 端点推断：base_url 以 /chat/completions 结尾则原样，否则拼接。"""
    url = (base_url or '').rstrip('/')
    if url.endswith('/chat/completions'):
        return url
    return f'{url}/chat/completions'


@dataclass(frozen=True)
class ChatStreamEvent:
    """一次流式响应中的可观测增量。"""

    content: str = ''
    reasoning_content: str = ''
    finish_reason: str | None = None
    usage: dict[str, Any] | None = None


_THINKING_EFFORT_LEVELS = frozenset({'low', 'medium', 'high'})


def build_chat_payload(
    *,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float | None = None,
    max_tokens: int | None = None,
    stream: bool = True,
    thinking_level: str | None = None,
) -> dict[str, Any]:
    """构造 Chat Completions 请求体（stream 开启时请求 usage）。

    thinking_level：low/medium/high 映射为 OpenAI 兼容的 ``reasoning_effort``；
    off 映射为 Qwen 系（vLLM/DashScope）的 ``chat_template_kwargs.enable_thinking``。
    服务端不认识的字段由调用方自行评估（严格服务端可能拒绝）。
    """
    payload: dict[str, Any] = {'model': model, 'messages': messages, 'stream': stream}
    if temperature is not None:
        payload['temperature'] = float(temperature)
    if max_tokens is not None and int(max_tokens) > 0:
        payload['max_tokens'] = int(max_tokens)
    if stream:
        payload['stream_options'] = {'include_usage': True}
    if thinking_level in _THINKING_EFFORT_LEVELS:
        payload['reasoning_effort'] = thinking_level
    elif thinking_level == 'off':
        payload['chat_template_kwargs'] = {'enable_thinking': False}
    return payload


def parse_sse_data_line(line: str) -> tuple[str, dict[str, Any]] | None:
    """解析单行 SSE；非 data 行或非法 JSON 返回 None。返回 (kind, data)。"""
    stripped = line.strip()
    if not stripped or stripped.startswith(':') or not stripped.startswith('data:'):
        return None
    data = stripped[len('data:') :].strip()
    if data == _SSE_DONE:
        return ('done', {})
    try:
        obj = json.loads(data)
    except json.JSONDecodeError:
        return None
    return ('data', obj)


def iter_chat_events(lines: Iterable[str]) -> Iterator[ChatStreamEvent]:
    """把 SSE 行流转为 ChatStreamEvent 序列（纯函数，供单测与协议一致）。"""
    for line in lines:
        parsed = parse_sse_data_line(line)
        if parsed is None:
            continue
        kind, obj = parsed
        if kind == 'done':
            break
        for choice in obj.get('choices') or []:
            delta = choice.get('delta') or {}
            event = ChatStreamEvent(
                content=str(delta.get('content') or ''),
                reasoning_content=str(delta.get('reasoning_content') or ''),
                finish_reason=choice.get('finish_reason'),
            )
            if event.content or event.reasoning_content or event.finish_reason:
                yield event
        usage = obj.get('usage')
        if isinstance(usage, dict):
            yield ChatStreamEvent(usage=dict(usage))


class OpenAICompatibleChatModel:
    """OpenAI 兼容 Chat Completions 客户端（异步，支持流式与非流式）。"""

    def __init__(
        self,
        *,
        model: str,
        base_url: str,
        api_key: str,
        headers: dict[str, str] | None = None,
        timeout: float = CHAT_TIMEOUT_SECONDS,
    ) -> None:
        self.model = model
        self.url = ensure_chat_completions_url(base_url)
        self.headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json', **(headers or {})}
        self.timeout = httpx.Timeout(timeout)

    async def achat_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        thinking_level: str | None = None,
    ) -> AsyncIterator[ChatStreamEvent]:
        """流式对话：逐帧产出内容/usage/finish_reason 事件。"""
        payload = build_chat_payload(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            thinking_level=thinking_level,
        )
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream('POST', self.url, json=payload, headers=self.headers) as response:
                if response.status_code >= 400:
                    body = (await response.aread()).decode('utf-8', 'replace')[:500]
                    raise ValueError(f'Chat 请求失败 model={self.model} status={response.status_code}: {body}')
                async for line in response.aiter_lines():
                    for item in iter_chat_events([line]):
                        yield item

    async def achat(
        self,
        messages: list[dict[str, Any]],
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        thinking_level: str | None = None,
    ) -> tuple[str, dict[str, Any]]:
        """非流式对话（连通性测试/单发调用）：返回 (content, usage)。"""
        payload = build_chat_payload(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False,
            thinking_level=thinking_level,
        )
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(self.url, json=payload, headers=self.headers)
            response.raise_for_status()
            result = response.json()
        choices = result.get('choices') or []
        content = str((choices[0].get('message') or {}).get('content') or '') if choices else ''
        usage = result.get('usage') if isinstance(result.get('usage'), dict) else {}
        return content, dict(usage)

    async def test_connection(self) -> tuple[bool, str]:
        """连通性测试：最小请求验证通道可用。"""
        try:
            await self.achat([{'role': 'user', 'content': 'ping'}], max_tokens=1)
        except Exception as exc:
            return False, f'{exc}（检查 base_url 是否以 /v1 结尾且模型可用）'
        return True, '连接正常'
