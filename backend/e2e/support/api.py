"""统一响应信封与 SSE 断言助手（fba 出口：``{code, msg, data, trace_id}``）。

套件内所有 JSON 断言都从这里走，避免每个用例各写一遍解包逻辑；
SSE 端点不套信封（``EventSourceResponse`` 直出），单独用事件行解析器。
"""

from __future__ import annotations

import json

from typing import TYPE_CHECKING, Any

from backend.src.core.config import settings

if TYPE_CHECKING:
    from httpx import Response

__all__ = ['API', 'ENVELOPE_OK', 'err', 'ok_data', 'sse_events', 'sse_json', 'sse_names']

# 路由前缀（``FASTAPI_API_V1_PATH``）：请求路径一律显式拼接，不走 httpx base_url 的相对合并
API = settings.FASTAPI_API_V1_PATH
ENVELOPE_OK = 200


def ok_data(resp: Response) -> Any:
    """断言成功信封并返回 ``data``。"""
    body = _envelope(resp)
    assert resp.status_code == ENVELOPE_OK, f'期望 HTTP 200，实际 {resp.status_code}: {body!r}'
    assert body['code'] == ENVELOPE_OK, f'信封 code 非 200: {body!r}'
    return body['data']


def err(resp: Response, code: int) -> dict[str, Any]:
    """断言错误信封：HTTP status 与信封 code 一致，且带 ``trace_id``。

    404 的「不泄露存在性」（D50）也靠本函数做同形态比较——调用方拿两个响应比较 msg。
    """
    body = _envelope(resp)
    assert resp.status_code == code, f'期望 HTTP {code}，实际 {resp.status_code}: {body!r}'
    assert body['code'] == code, f'信封 code({body["code"]}) 与 HTTP status({resp.status_code}) 不一致'
    assert body.get('trace_id'), f'错误信封缺 trace_id: {body!r}'
    return body


def _envelope(resp: Response) -> dict[str, Any]:
    try:
        body = resp.json()
    except ValueError as exc:
        raise AssertionError(f'响应不是 JSON（{resp.status_code}）: {resp.text[:400]!r}') from exc
    assert isinstance(body, dict), f'信封不是对象: {body!r}'
    for key in ('code', 'msg'):
        assert key in body, f'非统一信封，缺 {key}: {body!r}'
    return body


def sse_events(text: str) -> list[tuple[str, str]]:
    """把 SSE 报文解析为 ``[(event, data), ...]``（忽略注释行与心跳）。"""
    events: list[tuple[str, str]] = []
    event: str | None = None
    data: list[str] = []
    for raw in text.splitlines():
        line = raw.rstrip('\r')
        if not line:
            if event is not None:
                events.append((event, '\n'.join(data)))
            event, data = None, []
            continue
        if line.startswith(':'):
            continue
        if line.startswith('event:'):
            event = line[len('event:') :].strip()
        elif line.startswith('data:'):
            data.append(line[len('data:') :].lstrip())
    if event is not None:
        events.append((event, '\n'.join(data)))
    return events


def sse_names(text: str) -> list[str]:
    """SSE 事件名序列（用于断顺序）。"""
    return [name for name, _ in sse_events(text)]


def sse_json(text: str) -> list[tuple[str, dict[str, Any]]]:
    """SSE 事件名 + 已反序列化的 JSON 负载（非 JSON 负载直接失败并带出原文）。"""
    parsed: list[tuple[str, dict[str, Any]]] = []
    for name, payload in sse_events(text):
        if not payload:
            continue
        try:
            parsed.append((name, json.loads(payload)))
        except ValueError as exc:
            raise AssertionError(f'SSE 事件 {name!r} 的 data 不是合法 JSON: {payload[:300]!r}') from exc
    return parsed
