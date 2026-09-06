"""MCP 传输层守卫测试（agent-layer spec §10/D20/D33 + M10 验收）。

两个接缝分开验证：
- 全局 JWT 中间件白名单：``/mcp``（含 /tools）带 Bearer 时不被提前拦截
  （``extract_token`` 返回 None，鉴权交由 mcp 端点多凭证归一）；
- 端点守卫：无/坏凭证 → 401 JSON-RPC 帧 + ``WWW-Authenticate``（不被统一响应
  包装改写）；PAT / fba JWT 直通可打；``tools/list`` 与 ``GET /mcp/tools`` 按
  ``scp`` 动态过滤；``tools/call`` 权限缺失负向 → ``PERMISSION_DENIED``。
"""

from __future__ import annotations

import asyncio
import json

from types import SimpleNamespace
from typing import Any

import pytest

from jose import jwt as jose_jwt
from starlette.requests import Request

from backend.src.app.mcp.api import router as mcp_router
from backend.src.app.mcp.auth import authenticate_bearer
from backend.src.app.mcp.schemas import READ_SCOPES
from backend.src.core.config import settings
from backend.src.middleware.jwt_auth_middleware import JwtAuthMiddleware

READ_SCOPE_LIST = 'rag:kb:list'
FULL_SCOPES = sorted(READ_SCOPES)


@pytest.fixture(autouse=True)
def _mcp_guard_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """确定性环境：固定签发密钥与 PAT；关闭限流/调用日志（本批只测传输层守卫）。"""
    monkeypatch.setattr(settings, 'TOKEN_SECRET_KEY', 'test-mcp-secret-0123456789abcdef')
    monkeypatch.setattr(settings, 'RAGF_MCP_PAT', 'sk-ragf-test-pat')
    monkeypatch.setattr(settings, 'RAGF_MCP_RATE_LIMIT_ENABLED', False)
    monkeypatch.setattr(settings, 'RAGF_MCP_LOG_ENABLED', False)


def _scp_token(scp: str) -> str:
    """用 fba HS256 签发密钥本地签发 scp 受限 JWT（D31-A 同信任域直通）。"""
    return jose_jwt.encode(
        {'sub': 'u1', 'tenant': 'core', 'scp': scp},
        settings.TOKEN_SECRET_KEY,
        algorithm=settings.TOKEN_ALGORITHM,
    )


def _bearer(token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {token}'}


class FakeRequest:
    """端点级请求替身：只暴露 mcp 端点用到的字段（headers/json/state）。"""

    def __init__(self, body: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> None:
        self.headers = {'accept': '', 'X-Plugin-Namespace': 'core', **(headers or {})}
        self._body = body
        self.state = SimpleNamespace()

    async def json(self) -> Any:
        return self._body


def _jsonrpc(method: str, params: dict[str, Any] | None = None, req_id: int = 1) -> dict[str, Any]:
    body: dict[str, Any] = {'jsonrpc': '2.0', 'id': req_id, 'method': method}
    if params is not None:
        body['params'] = params
    return body


def _post(body: dict[str, Any], headers: dict[str, str] | None = None) -> Any:
    async def _call() -> Any:
        return await mcp_router.mcp_jsonrpc_endpoint(FakeRequest(body=body, headers=headers), db=None)  # type: ignore[arg-type]

    return asyncio.run(_call())


def _body_of(response: Any) -> dict[str, Any]:
    return json.loads(response.body)


# ------------------------------------------------------------------ 中间件白名单
def _fake_request(path: str, authorization: str | None = None) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if authorization is not None:
        headers.append((b'authorization', authorization.encode()))
    scope: dict[str, Any] = {
        'type': 'http',
        'method': 'POST',
        'path': path,
        'headers': headers,
        'query_string': b'',
        'scheme': 'http',
        'server': ('test', 80),
        'client': ('127.0.0.1', 1),
    }
    return Request(scope)


def test_mcp_paths_bypass_global_jwt_middleware() -> None:
    """PAT/受限 JWT 打到 /mcp 时全局 JWT 中间件放行（白名单 = 端点自持鉴权）。"""
    base = mcp_router.MCP_HTTP_PATH
    for path in (base, f'{base}/tools'):
        assert JwtAuthMiddleware.extract_token(_fake_request(path, 'Bearer sk-ragf-test-pat')) is None


def test_non_mcp_path_still_extracts_token() -> None:
    token = _scp_token(READ_SCOPE_LIST)
    req = _fake_request('/api/v1/knowledge_bases/dev/search', f'Bearer {token}')
    assert JwtAuthMiddleware.extract_token(req) == token


def test_custom_mcp_path_uses_settings_prefix(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'RAGF_MCP_HTTP_PATH', '/ragf-mcp')
    req = _fake_request('/ragf-mcp', 'Bearer sk-ragf-test-pat')
    assert JwtAuthMiddleware.extract_token(req) is None
    # 默认 /mcp 不再是白名单前缀 → 恢复普通提取（交由端点鉴权判定）
    assert JwtAuthMiddleware.extract_token(_fake_request('/mcp', 'Bearer sk-ragf-test-pat')) == 'sk-ragf-test-pat'


# ------------------------------------------------------------------ 端点守卫
def test_unauthorized_401_jsonrpc_with_www_authenticate() -> None:
    resp = _post(_jsonrpc('initialize', {'protocolVersion': '2025-03-26'}))
    assert resp.status_code == 401
    assert resp.headers.get('WWW-Authenticate') == 'Bearer realm="ragf-mcp"'
    body = _body_of(resp)
    assert body['jsonrpc'] == '2.0'
    assert body['error']['data']['code'] == 'UNAUTHORIZED'


def test_invalid_bearer_401_not_unified_wrapper() -> None:
    """坏凭证走 JSON-RPC 错误帧（application/json + jsonrpc 字段），不被统一包装改写。"""
    resp = _post(_jsonrpc('ping'), headers=_bearer('not-a-valid-token'))
    assert resp.status_code == 401
    assert _body_of(resp)['error']['data']['code'] == 'UNAUTHORIZED'


def test_pat_ping_succeeds() -> None:
    """PAT（桥接进程 env 注入语义）可直打端点：ping 返回 id/result。"""
    resp = _post(_jsonrpc('ping', req_id=7), headers=_bearer('sk-ragf-test-pat'))
    assert resp.status_code == 200
    assert _body_of(resp) == {'jsonrpc': '2.0', 'id': 7, 'result': {}}


def test_fba_jwt_ping_succeeds() -> None:
    """自家 host 用户 JWT 直通（D31-A：同信任域，本地 HS256 校验）。"""
    token = _scp_token(','.join(FULL_SCOPES))
    resp = _post(_jsonrpc('ping'), headers=_bearer(token))
    assert resp.status_code == 200
    assert _body_of(resp)['result'] == {}


def test_tools_list_filtered_by_scp() -> None:
    """tools/list 按权限动态过滤：list 权限只见发现类工具（注入防线，D33）。"""
    token = _scp_token(READ_SCOPE_LIST)
    resp = _post(_jsonrpc('tools/list'), headers=_bearer(token))
    assert resp.status_code == 200
    names = [item['name'] for item in _body_of(resp)['result']['tools']]
    assert names == ['list_knowledge_bases']


def test_tools_list_full_scopes_shows_all() -> None:
    """全读面权限点（PAT 默认授权语义）可见全部 5 个只读工具。"""
    token = _scp_token(','.join(FULL_SCOPES))
    resp = _post(_jsonrpc('tools/list'), headers=_bearer(token))
    assert resp.status_code == 200
    names = [item['name'] for item in _body_of(resp)['result']['tools']]
    assert set(names) == {
        'list_knowledge_bases',
        'search_knowledge',
        'answer_with_citations',
        'read_document_chunks',
        'get_document',
    }


def test_tools_catalog_filtered_by_scp() -> None:
    """GET /mcp/tools 与 tools/list 同源过滤（catalog handler 直接校验）。"""
    token = _scp_token(READ_SCOPE_LIST)
    user = authenticate_bearer(token, 'core')
    assert user is not None

    async def _catalog() -> Any:
        return await mcp_router.mcp_tools_catalog(user=user)  # type: ignore[arg-type]

    items = asyncio.run(_catalog())
    assert [item['name'] for item in items] == ['list_knowledge_bases']


def test_tools_call_denied_without_scope() -> None:
    """工具可见性 ≠ 可调用：无 search 权限时 tools/call → PERMISSION_DENIED。"""
    token = _scp_token(READ_SCOPE_LIST)
    body = _jsonrpc(
        'tools/call',
        {'name': 'search_knowledge', 'arguments': {'kb_names': ['dev'], 'query_text': '版本差异'}},
    )
    resp = _post(body, headers=_bearer(token))
    assert resp.status_code == 200
    assert _body_of(resp)['error']['data']['code'] == 'PERMISSION_DENIED'
