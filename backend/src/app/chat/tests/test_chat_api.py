"""chat SSE API 冒烟（agent-layer spec §6/M9 验收：事件行协议 + 语义错误走约定路径）。

离线做法：覆盖 JWT 依赖（不经用户库），把 ``chat_service.astream`` 换成罐头事件源，
验证 REST 端点把事件行原样流出（EventSourceResponse，不走统一响应包装）。
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

import pytest

from starlette.testclient import TestClient

from backend.main import app
from backend.src.app.chat.service.chat_service import chat_service
from backend.src.common.security.jwt import jwt_authentication_verify
from backend.src.database.db import get_db
from backend.src.middleware import request_state_middleware as rsm

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Callable


@pytest.fixture(scope='module')
def client() -> TestClient:
    """模块级共享实例：避免 redis/async 连接跨 TestClient 事件循环绑定。"""
    return TestClient(app)


@pytest.fixture(autouse=True)
def _noop_auth_db(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """端点到 handler 前就停：JWT 依赖空转 + db 交给既有测试会话覆盖（不触发查询）。"""
    monkeypatch.setitem(app.dependency_overrides, jwt_authentication_verify, lambda: None)
    # StateMiddleware 每请求查 redis（跨 TestClient 事件循环抖动源）：短路 IP 解析

    async def _noop_ip(request: Any) -> SimpleNamespace:  # ruff: ignore[unused-async]  # 替换 parse_ip_info（被 await 调用）
        return SimpleNamespace(ip='127.0.0.1', country='', region='', city='')

    monkeypatch.setattr(rsm, 'parse_ip_info', _noop_ip)
    # 保持 conftest 的 get_db 覆盖存在；此处仅确认不缺失
    assert get_db in app.dependency_overrides


def _canned_stream(*events: tuple[str, dict[str, Any]]) -> Callable[..., AsyncIterator[tuple[str, dict[str, Any]]]]:
    async def _astream(  # ruff: ignore[unused-async]  # async 生成器（yield 序列），RUF029 误报
        db: Any,
        *,
        kb_name: str,
        param: Any,
        plugin_namespace: str | None = None,
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        for event, data in events:
            yield (event, data)

    return _astream


def test_chat_sse_event_lines_protocol(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """meta/citation/delta/usage/done 事件行按约定顺序流出。"""
    events = [
        ('meta', {'kb_name': 'dev', 'mode': 'hybrid', 'model_spec': 'acme:qwen-max', 'hit_count': 1}),
        ('citation', {'citations': [{'n': 1, 'document_id': 'doc-a', 'version_id': 1, 'chunk_id': 'doc-a:1:0'}]}),
        ('delta', {'content': '版本差异在于 '}),
        ('usage', {'prompt_tokens': 1, 'completion_tokens': 2, 'total_tokens': 3}),
        ('done', {'reason': 'complete'}),
    ]
    monkeypatch.setattr(chat_service, 'astream', _canned_stream(*events))
    resp = client.post(
        '/api/v1/knowledge_bases/dev/chat',
        json={'query_text': '版本差异'},
        headers={'X-Plugin-Namespace': 'core'},
    )
    assert resp.status_code == 200
    assert 'text/event-stream' in resp.headers.get('content-type', '')
    body = resp.text
    for event in ('meta', 'citation', 'delta', 'usage', 'done'):
        assert f'event: {event}' in body
    assert '"hit_count": 1' in body
    assert '"reason": "complete"' in body


def test_chat_sse_empty_result_short_circuit(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """无命中：meta.hit=0 + done(reason=empty_result)，不出现 delta。"""
    events = [
        ('meta', {'kb_name': 'dev', 'mode': 'hybrid', 'model_spec': '', 'hit_count': 0}),
        ('done', {'reason': 'empty_result'}),
    ]
    monkeypatch.setattr(chat_service, 'astream', _canned_stream(*events))
    resp = client.post(
        '/api/v1/knowledge_bases/dev/chat',
        json={'query_text': '不存在的问题'},
        headers={'X-Plugin-Namespace': 'core'},
    )
    assert resp.status_code == 200
    assert 'event: meta' in resp.text
    assert 'event: done' in resp.text
    assert 'event: delta' not in resp.text


def test_chat_sse_error_event_passthrough(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """语义/上游错误以 error 事件表达（code + msg），不是 HTTP 错误体。"""
    events = [('error', {'code': 'MODEL_NOT_CONFIGURED', 'msg': 'chat 模型未配置', 'trace_id': 'trace-1'})]
    monkeypatch.setattr(chat_service, 'astream', _canned_stream(*events))
    resp = client.post(
        '/api/v1/knowledge_bases/dev/chat',
        json={'query_text': 'x'},
        headers={'X-Plugin-Namespace': 'core'},
    )
    assert resp.status_code == 200
    assert 'event: error' in resp.text
    assert 'MODEL_NOT_CONFIGURED' in resp.text
