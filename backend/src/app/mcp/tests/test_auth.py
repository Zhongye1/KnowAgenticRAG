"""MCP 多凭证鉴权归一测试（D31-D33：PAT / fba JWT 直通 / scp 过滤）。"""

from __future__ import annotations

import time

import pytest

from jose import jwt

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


def test_default_scopes_and_normalize() -> None:
    assert default_scopes() >= READ_SCOPES
    assert normalize_scopes('rag:kb:list, rag:kb:read') == frozenset({'rag:kb:list', 'rag:kb:read'})
    assert normalize_scopes(['rag:kb:search']) == frozenset({'rag:kb:search'})
    assert normalize_scopes(None) == frozenset()


def test_authenticate_pat(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'RAGF_MCP_PAT', 'sekret-pat')
    ctx = authenticate_bearer('sekret-pat', 'core')
    assert ctx is not None
    assert ctx.sub == 'pat'
    assert ctx.tenant == 'core'
    assert ctx.scp >= READ_SCOPES


def test_authenticate_fba_jwt_default_scopes() -> None:
    ctx = authenticate_bearer(_jwt('7'), 'core')
    assert ctx is not None
    assert ctx.sub == 'user:7'
    assert ctx.scp >= READ_SCOPES


def test_authenticate_fba_jwt_scp_claim_restricts() -> None:
    token = _jwt('7', scp=['rag:kb:search'])
    ctx = authenticate_bearer(token, 'core')
    assert ctx is not None
    assert ctx.scp == frozenset({PERM_KB_SEARCH})


def test_authenticate_invalid_token_returns_none() -> None:
    assert authenticate_bearer('not-a-token', 'core') is None
    assert authenticate_bearer('', 'core') is None


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
