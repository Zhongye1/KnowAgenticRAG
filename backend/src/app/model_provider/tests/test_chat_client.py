"""chat 客户端协议纯函数测试（M9：URL 推断、payload 形状、SSE 行解析）。"""

from __future__ import annotations

import pytest

from backend.src.app.model_provider.providers.chat import (
    build_chat_payload,
    ensure_chat_completions_url,
    iter_chat_events,
    parse_sse_data_line,
)


def test_ensure_chat_completions_url() -> None:
    assert ensure_chat_completions_url('https://api.example.com/v1') == 'https://api.example.com/v1/chat/completions'
    assert ensure_chat_completions_url('https://api.example.com/v1/') == 'https://api.example.com/v1/chat/completions'
    assert (
        ensure_chat_completions_url('https://api.example.com/v1/chat/completions')
        == 'https://api.example.com/v1/chat/completions'
    )
    assert ensure_chat_completions_url('') == '/chat/completions'


def test_build_chat_payload_stream_requests_usage() -> None:
    payload = build_chat_payload(
        model='qwen-max',
        messages=[{'role': 'user', 'content': 'hi'}],
        temperature=0.5,
        max_tokens=100,
    )
    assert payload['model'] == 'qwen-max'
    assert payload['stream'] is True
    assert payload['stream_options'] == {'include_usage': True}
    assert payload['temperature'] == pytest.approx(0.5)
    assert payload['max_tokens'] == 100


def test_build_chat_payload_non_stream_omits_usage_option() -> None:
    payload = build_chat_payload(model='m', messages=[], stream=False)
    assert payload['stream'] is False
    assert 'stream_options' not in payload
    assert 'temperature' not in payload
    assert 'max_tokens' not in payload


def test_parse_sse_data_line() -> None:
    kind, data = parse_sse_data_line('data: {"choices": [], "usage": {"total_tokens": 3}}') or (None, {})
    assert kind == 'data'
    assert data['usage']['total_tokens'] == 3
    assert parse_sse_data_line('data: [DONE]') == ('done', {})
    assert parse_sse_data_line(': keep-alive') is None
    assert parse_sse_data_line('event: delta') is None
    assert parse_sse_data_line('data: not-json') is None
    assert parse_sse_data_line('') is None


def test_iter_chat_events_content_finish_and_usage() -> None:
    lines = [
        'data: {"choices": [{"delta": {"content": "你"}, "finish_reason": null}]}',
        'data: {"choices": [{"delta": {"content": "好"}, "finish_reason": null}]}',
        'data: {"choices": [{"delta": {}, "finish_reason": "stop"}]}',
        'data: {"choices": [], "usage": {"prompt_tokens": 9, "completion_tokens": 2, "total_tokens": 11}}',
        'data: [DONE]',
    ]
    events = list(iter_chat_events(lines))
    assert ''.join(event.content for event in events) == '你好'
    assert [event.finish_reason for event in events if event.finish_reason] == ['stop']
    assert [event.usage for event in events if event.usage] == [
        {'prompt_tokens': 9, 'completion_tokens': 2, 'total_tokens': 11}
    ]


def test_iter_chat_events_stops_at_done_and_skips_empty() -> None:
    lines = [
        'data: {"choices": [{"delta": {"content": ""}, "finish_reason": null}]}',
        'data: {"choices": [{"delta": {"content": "x"}}]}',
        'data: [DONE]',
        'data: {"choices": [{"delta": {"content": "越界"}}]}',
    ]
    events = list(iter_chat_events(lines))
    assert ''.join(event.content for event in events) == 'x'
