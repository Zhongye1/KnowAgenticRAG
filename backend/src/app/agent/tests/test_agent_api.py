"""agent SSE/REST API 冒烟（agentic-rag spec D35/D38：事件行协议 + 统一 JSON 包装）。

离线做法与 chat 域一致：覆盖 JWT 依赖（不经用户库）+ 覆盖 scope 依赖（不经 ACL），
把 ``agent_service`` 换成罐头事件源，验证端点把事件行/响应体原样送出。
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

import pytest

from starlette.testclient import TestClient

from backend.main import app
from backend.src.app.agent.service.agent_service import agent_service
from backend.src.app.kb.deps import get_retrieval_scope
from backend.src.app.kb.service.acl.scope import Scope
from backend.src.common.security.jwt import jwt_authentication_verify
from backend.src.common.security.rbac import rbac_verify
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
    """端点到 handler 前就停：JWT/RBAC 依赖空转 + scope 罐头 + db 交给既有测试会话覆盖。"""
    monkeypatch.setitem(app.dependency_overrides, jwt_authentication_verify, lambda: None)
    monkeypatch.setitem(app.dependency_overrides, rbac_verify, lambda: None)

    dummy_scope = Scope(namespace='core', user_id='test', groups=['test'], allowed_kbs=['dev'])

    async def _noop_scope() -> Scope:  # ruff: ignore[unused-async]  # 替换 get_retrieval_scope（FastAPI 会 await 依赖）
        return dummy_scope

    app.dependency_overrides[get_retrieval_scope] = _noop_scope

    async def _noop_ip(request: Any) -> SimpleNamespace:  # ruff: ignore[unused-async]  # 替换 parse_ip_info（被 await 调用）
        return SimpleNamespace(ip='127.0.0.1', country='', region='', city='')

    monkeypatch.setattr(rsm, 'parse_ip_info', _noop_ip)
    assert get_db in app.dependency_overrides


def _canned_stream(*events: tuple[str, dict[str, Any]]) -> Callable[..., AsyncIterator[tuple[str, dict[str, Any]]]]:
    async def _astream(  # ruff: ignore[unused-async]  # async 生成器（yield 序列），RUF029 误报
        db: Any,
        *,
        kb_name: str,
        param: Any,
        plugin_namespace: str | None = None,
        scope: Any = None,
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        for event, data in events:
            yield (event, data)

    return _astream


def test_agent_sse_event_lines_protocol(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """step/meta/citation/delta/usage/done 事件行按约定顺序流出。"""
    events = [
        ('step', {'name': 'plan', 'detail': 'need_retrieval=True, 2 路子查询'}),
        ('step', {'name': 'act', 'detail': '工具调用 1 次'}),
        ('meta', {'kb_name': 'dev', 'mode': 'hybrid', 'model_spec': 'acme:qwen-max', 'hit_count': 1}),
        (
            'citation',
            {'citations': [{'n': 1, 'document_id': 'doc-a', 'version_id': 1, 'chunk_id': 'doc-a:1:0'}], 'images': []},
        ),
        ('delta', {'content': '版本差异在于 '}),
        ('usage', {'prompt_tokens': 1, 'completion_tokens': 2, 'total_tokens': 3}),
        ('done', {'reason': 'complete', 'agent': {'rewrites': 1}}),
    ]
    monkeypatch.setattr(agent_service, 'astream', _canned_stream(*events))
    resp = client.post(
        '/api/v1/knowledge_bases/dev/agent/stream',
        json={'query_text': '版本差异', 'max_steps': 4},
        headers={'X-Plugin-Namespace': 'core'},
    )
    assert resp.status_code == 200
    assert 'text/event-stream' in resp.headers.get('content-type', '')
    body = resp.text
    for event in ('step', 'meta', 'citation', 'delta', 'usage', 'done'):
        assert f'event: {event}' in body
    assert body.index('event: step') < body.index('event: meta') < body.index('event: done')
    assert '"name": "plan"' in body
    assert '"rewrites": 1' in body


def test_agent_sse_error_event_passthrough(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """语义/上游错误以 error 事件表达（code + msg），不是 HTTP 错误体。"""
    events = [('error', {'code': 'MODEL_NOT_CONFIGURED', 'msg': 'agent 模型未配置', 'trace_id': 'trace-1'})]
    monkeypatch.setattr(agent_service, 'astream', _canned_stream(*events))
    resp = client.post(
        '/api/v1/knowledge_bases/dev/agent/stream',
        json={'query_text': 'x'},
        headers={'X-Plugin-Namespace': 'core'},
    )
    assert resp.status_code == 200
    assert 'event: error' in resp.text
    assert 'MODEL_NOT_CONFIGURED' in resp.text


def test_agent_sync_endpoint_returns_full_payload(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """非流式端点：统一 JSON 包装 + 自包含 AgentResponse（与流式 done 同源）。"""

    async def _acomplete(  # ruff: ignore[unused-async]  # 对齐 agent_service.acomplete 的 async 契约
        db: Any, *, kb_name: str, param: Any, plugin_namespace: str | None = None, scope: Any = None
    ) -> dict[str, Any]:
        return {
            'kb_name': kb_name,
            'kb_names': [kb_name],
            'mode': 'hybrid',
            'model_spec': 'acme:qwen-max',
            'hit_count': 1,
            'visual_count': 0,
            'answer': '版本差异在于 [1]',
            'reason': 'complete',
            'citations': [
                {
                    'n': 1,
                    'kb_name': kb_name,
                    'document_id': 'doc-a',
                    'version_id': 1,
                    'chunk_id': 'doc-a:1:0',
                    'content': '原文',
                }
            ],
            'images': [],
            'route': {'mode': 'hybrid', 'selected': ['text'], 'reason': 'explicit params', 'kb_names': [kb_name]},
            'steps': [{'name': 'act', 'detail': '工具调用 1 次'}],
            'agent': {
                'need_retrieval': True,
                'sub_queries': ['版本差异'],
                'plan_rationale': '需要查文档',
                'grade_score': 0.9,
                'rewrites': 0,
            },
            'usage': {'prompt_tokens': 1, 'completion_tokens': 2, 'total_tokens': 3},
        }

    monkeypatch.setattr(agent_service, 'acomplete', _acomplete)
    resp = client.post(
        '/api/v1/knowledge_bases/dev/agent',
        json={'query_text': '版本差异'},
        headers={'X-Plugin-Namespace': 'core'},
    )
    assert resp.status_code == 200
    assert 'text/event-stream' not in resp.headers.get('content-type', '')
    body = resp.json()
    assert body['code'] == 200
    assert body['data']['answer'] == '版本差异在于 [1]'
    assert body['data']['agent']['sub_queries'] == ['版本差异']
    assert body['data']['agent']['grade_score'] == pytest.approx(0.9)
    assert body['data']['citations'][0]['chunk_id'] == 'doc-a:1:0'
