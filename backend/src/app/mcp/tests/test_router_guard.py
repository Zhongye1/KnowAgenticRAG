"""MCP 端点限流测试（M10：超限返回 RATE_LIMITED/429 + Retry-After；开关关闭放行）。"""

from __future__ import annotations

import asyncio
import json

from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

from backend.src.app.mcp.api import router as mcp_router
from backend.src.app.mcp.schemas import READ_SCOPES, UserContext
from backend.src.core.config import settings

if TYPE_CHECKING:
    import pytest


def _ctx() -> UserContext:
    return UserContext(sub='user:7', tenant='core', scp=READ_SCOPES)


class FakeRequest:
    def __init__(self, body: bytes = b'{}') -> None:
        self.headers: dict[str, str] = {'accept': '', 'Authorization': '', 'X-Plugin-Namespace': 'core'}
        self._body = body
        self.state = SimpleNamespace()

    async def json(self) -> Any:
        return json.loads(self._body)


class BurstLimiter:
    def __init__(self, budget: int, retry_after: int = 5) -> None:
        self.budget = budget
        self.hits = 0
        self.retry_after = retry_after

    async def __call__(self, request: Any, response: Any) -> None:
        self.hits += 1
        if self.hits > self.budget:
            raise mcp_router._RateLimitedError(self.retry_after)


def test_acquire_slot_allows_until_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = BurstLimiter(budget=2)
    monkeypatch.setattr(mcp_router, '_get_mcp_limiter', lambda: fake)
    request = FakeRequest()
    user = _ctx()
    assert asyncio.run(mcp_router._acquire_mcp_slot(request, user)) is None  # type: ignore[arg-type]
    assert asyncio.run(mcp_router._acquire_mcp_slot(request, user)) is None  # type: ignore[arg-type]
    assert asyncio.run(mcp_router._acquire_mcp_slot(request, user)) == 5  # type: ignore[arg-type]
    assert request.state.mcp_user is user
    assert fake.hits == 3


def test_endpoint_returns_jsonrpc_429_when_rate_limited(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mcp_router, '_get_mcp_limiter', lambda: BurstLimiter(budget=0, retry_after=7))
    monkeypatch.setattr(mcp_router, '_require_user', lambda request, *, req_id, sse: _ctx())
    request = FakeRequest(body=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'ping'}).encode())
    resp = asyncio.run(mcp_router.mcp_jsonrpc_endpoint(request, db=None))  # type: ignore[arg-type]
    payload = json.loads(bytes(resp.body))
    assert resp.status_code == 429
    assert resp.headers['Retry-After'] == '7'
    assert payload['error']['data']['code'] == 'RATE_LIMITED'
    assert payload['id'] == 1


def test_rate_limit_disabled_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'RAGF_MCP_RATE_LIMIT_ENABLED', False)
    monkeypatch.setattr(mcp_router, '_mcp_limiter', None)
    request = FakeRequest()
    assert asyncio.run(mcp_router._acquire_mcp_slot(request, _ctx())) is None  # type: ignore[arg-type]
