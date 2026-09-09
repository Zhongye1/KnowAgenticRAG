"""MCP 多凭证鉴权归一测试（D31-D33：PAT / fba JWT 直通 / scp 过滤 / 会话存活）。"""

from __future__ import annotations

import asyncio
import time

from uuid import uuid4

import pytest

from jose import jwt

from backend.src.app.mcp import auth as mcp_auth
from backend.src.app.mcp.auth import (
    authenticate_bearer,
    default_scopes,
    filter_tools,
    normalize_scopes,
    require_perms,
)
from backend.src.app.mcp.schemas import PERM_KB_LIST, PERM_KB_READ, PERM_KB_SEARCH, READ_SCOPES, UserContext
from backend.src.common.exception import errors
from backend.src.core.config import settings


def _jwt(sub: str, **claims: object) -> str:
    payload: dict[str, object] = {'sub': sub, 'exp': int(time.time()) + 3600, **claims}
    return jwt.encode(payload, settings.TOKEN_SECRET_KEY, algorithm=settings.TOKEN_ALGORITHM)


class _StubRedis:
    """会话键替身：仅实现 authenticate_bearer 用到的 get。"""

    def __init__(self) -> None:
        self.keys: dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self.keys.get(key)


@pytest.fixture()
def stub_redis(monkeypatch: pytest.MonkeyPatch) -> _StubRedis:
    stub = _StubRedis()
    monkeypatch.setattr(mcp_auth, 'redis_client', stub)
    return stub


def _session_token(stub: _StubRedis, sub: str, **claims: object) -> str:
    """签发带 session_uuid 的 JWT 并在 Redis 注册 access 会话键（fba 登录语义）。"""
    session_uuid = str(uuid4())
    stub.keys[f'{settings.TOKEN_REDIS_PREFIX}:{sub}:{session_uuid}'] = 'token'
    return _jwt(sub, session_uuid=session_uuid, **claims)


def _auth(token: str, tenant: str = 'core') -> object:
    return asyncio.run(authenticate_bearer(token, tenant))


def test_default_scopes_and_normalize() -> None:
    assert default_scopes() >= READ_SCOPES
    assert normalize_scopes('rag:kb:list, rag:kb:read') == frozenset({'rag:kb:list', 'rag:kb:read'})
    assert normalize_scopes(['rag:kb:search']) == frozenset({'rag:kb:search'})
    assert normalize_scopes(None) == frozenset()


def test_authenticate_pat(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'RAGF_MCP_PAT', 'sekret-pat')
    ctx = _auth('sekret-pat')
    assert isinstance(ctx, UserContext)
    assert ctx.sub == 'pat'
    assert ctx.tenant == 'core'
    assert ctx.scp >= READ_SCOPES


def test_authenticate_fba_jwt_default_scopes(stub_redis: _StubRedis) -> None:
    """会话存活的 fba JWT 直通；sub 为原始用户 ID（scope 构建/owner 匹配依赖）。"""
    ctx = _auth(_session_token(stub_redis, '7'))
    assert isinstance(ctx, UserContext)
    assert ctx.sub == '7'
    assert ctx.scp >= READ_SCOPES


def test_authenticate_fba_jwt_scp_claim_restricts(stub_redis: _StubRedis) -> None:
    token = _session_token(stub_redis, '7', scp=['rag:kb:search'])
    ctx = _auth(token)
    assert isinstance(ctx, UserContext)
    assert ctx.scp == frozenset({PERM_KB_SEARCH})


def test_jwt_without_session_claim_rejected(stub_redis: _StubRedis) -> None:
    """缺 session_uuid claim 的 JWT 不可用作 MCP 凭证。"""
    assert _auth(_jwt('7')) is None


def test_refresh_token_rejected_as_mcp_credential(stub_redis: _StubRedis) -> None:
    """token 混用防线：refresh token（会话键仅在 REFRESH 前缀下）不可打 MCP。"""
    session_uuid = str(uuid4())
    stub_redis.keys[f'{settings.TOKEN_REFRESH_REDIS_PREFIX}:7:{session_uuid}'] = 'refresh-token'
    refresh_token = _jwt('7', session_uuid=session_uuid)
    assert _auth(refresh_token) is None


def test_revoked_session_rejected(stub_redis: _StubRedis) -> None:
    """撤销即时生效：logout 删除 access 会话键后，同 JWT 立即失效。"""
    token = _session_token(stub_redis, '7')
    assert _auth(token) is not None
    stub_redis.keys.clear()
    assert _auth(token) is None


def test_redis_failure_fails_closed(stub_redis: _StubRedis, monkeypatch: pytest.MonkeyPatch) -> None:
    """Redis 异常 fail-closed（返回 None → 401），不放行未校验会话。"""

    async def _boom(key: str) -> str:  # ruff: ignore[unused-async]  # 模拟 async Redis 客户端抛错
        raise RuntimeError('redis down')

    monkeypatch.setattr(stub_redis, 'get', _boom)
    assert _auth(_session_token(stub_redis, '7')) is None


def test_tenant_claim_mismatch_rejected(stub_redis: _StubRedis) -> None:
    """tenant claim 与请求租户不一致 → 拒绝（防 claim 覆盖跨租户穿越）。"""
    token = _session_token(stub_redis, '7', tenant='acme')
    assert _auth(token, tenant='core') is None


def test_tenant_claim_consistent_accepted(stub_redis: _StubRedis) -> None:
    """tenant claim 与请求租户一致 → 正常通过。"""
    token = _session_token(stub_redis, '7', tenant='core')
    ctx = _auth(token, tenant='core')
    assert isinstance(ctx, UserContext)
    assert ctx.tenant == 'core'


def test_jwt_sub_matches_owner_id_contract(stub_redis: _StubRedis) -> None:
    """scope/owner 匹配契约：auth 产出的 sub 必须是原始用户 ID（与上传时
    documents.owner_id = str(request.user.id) 同源），且可解析出部门
    （_resolve_user_dept_id 依赖 int 可解析；带前缀会导致部门组展开静默失效）。
    """
    ctx = _auth(_session_token(stub_redis, '42'))
    assert isinstance(ctx, UserContext)
    assert ctx.sub == '42'
    int(ctx.sub)


def test_authenticate_invalid_token_returns_none() -> None:
    assert _auth('not-a-token') is None
    assert _auth('') is None


def test_require_perms() -> None:
    ctx = UserContext(sub='u', tenant='core', scp=frozenset({PERM_KB_SEARCH}))
    require_perms(ctx, frozenset({PERM_KB_SEARCH}))
    with pytest.raises(errors.ForbiddenError):
        require_perms(ctx, frozenset({PERM_KB_SEARCH, PERM_KB_LIST}))


def test_filter_tools_by_scp() -> None:
    tools = [
        {'name': 'list_knowledge_bases', 'required_permissions': [PERM_KB_LIST]},
        {'name': 'search_knowledge', 'required_permissions': [PERM_KB_SEARCH]},
        {'name': 'read_document_chunks', 'required_permissions': [PERM_KB_READ]},
    ]
    ctx = UserContext(sub='u', tenant='core', scp=frozenset({PERM_KB_SEARCH}))
    names = [item['name'] for item in filter_tools(ctx, tools)]
    assert names == ['search_knowledge']
