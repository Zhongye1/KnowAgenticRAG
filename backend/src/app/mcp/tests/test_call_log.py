"""MCP 调用审计测试（M10/D33：tools/call 成功/失败落库、参数摘要脱敏、best-effort）。"""

from __future__ import annotations

import asyncio
import json

from typing import TYPE_CHECKING, Any

from backend.src.app.mcp.api import router as mcp_router
from backend.src.app.mcp.call_log import QUERY_TEXT_MAX, build_call_log_fields, record_call_log
from backend.src.app.mcp.schemas import READ_SCOPES, UserContext
from backend.src.app.mcp.service import ToolError
from backend.src.core.config import settings

if TYPE_CHECKING:
    import pytest


def _ctx() -> UserContext:
    return UserContext(sub='user:7', tenant='core', scp=READ_SCOPES)


class StubToolkit:
    def __init__(self, *, exc: Exception | None = None) -> None:
        self.exc = exc

    async def call(
        self, db: Any, *, user: UserContext, tool_name: str, args: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        if self.exc is not None:
            raise self.exc
        return {'kb_name': 'dev', 'usage': {'prompt_tokens': 5, 'completion_tokens': 3, 'total_tokens': 8}}


class NoopLogger:
    def warning(self, *args: Any, **kwargs: Any) -> None:
        pass


def _call_tool(
    monkeypatch: pytest.MonkeyPatch,
    params: dict[str, Any],
    *,
    exc: Exception | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    captured: dict[str, Any] = {}

    async def fake_record(db: Any, **fields: Any) -> None:  # ruff: ignore[unused-async]
        captured.update(fields)

    async def run() -> Any:
        monkeypatch.setattr(mcp_router, 'record_call_log', fake_record)
        monkeypatch.setattr(mcp_router, 'mcp_toolkit', StubToolkit(exc=exc))
        return await mcp_router._call_tool(
            None,  # type: ignore[arg-type]
            user=_ctx(),
            params=params,
            req_id=1,
            sse=False,
        )

    resp = asyncio.run(run())
    return json.loads(resp.body), captured


def test_success_log_fields_truncate_and_redact(monkeypatch: pytest.MonkeyPatch) -> None:
    payload, captured = _call_tool(
        monkeypatch,
        {
            'name': 'answer_with_citations',
            'arguments': {
                'kb_name': 'dev',
                'query_text': 'x' * 2600,
                'history': [{'role': 'user', 'content': 'secret-history'}],
            },
        },
    )
    assert payload['result']['isError'] is False
    assert captured['code'] == 'SUCCESS'
    assert captured['status'] == 1
    assert captured['method'] == 'tools/call'
    assert captured['tool_name'] == 'answer_with_citations'
    assert captured['user_sub'] == 'user:7'
    assert captured['tenant'] == 'core'
    assert captured['kb_name'] == 'dev'
    assert captured['document_id'] is None
    assert len(captured['query_text']) == QUERY_TEXT_MAX
    assert captured['total_tokens'] == 8
    assert captured['cost_time'] >= 0.0
    assert 'secret-history' not in json.dumps(captured, ensure_ascii=False)


def test_tool_error_logged_with_stable_code(monkeypatch: pytest.MonkeyPatch) -> None:
    exc = ToolError(code='KB_NOT_FOUND', msg='知识库不存在: dev')
    payload, captured = _call_tool(
        monkeypatch, {'name': 'search_knowledge', 'arguments': {'kb_name': 'dev', 'query_text': 'q'}}, exc=exc
    )
    assert payload['error']['data']['code'] == 'KB_NOT_FOUND'
    assert captured['code'] == 'KB_NOT_FOUND'
    assert captured['status'] == 0
    assert captured['msg'] == '知识库不存在: dev'


def test_internal_error_logged(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mcp_router, 'log', NoopLogger())
    payload, captured = _call_tool(monkeypatch, {'name': 'search_knowledge', 'arguments': {}}, exc=RuntimeError('boom'))
    assert payload['error']['data']['code'] == 'INTERNAL'
    assert captured['code'] == 'INTERNAL'
    assert captured['status'] == 0
    assert 'boom' in captured['msg']


def test_log_disabled_skips_write(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'RAGF_MCP_LOG_ENABLED', False)
    called = False

    async def fail_if_called(db: Any, **fields: Any) -> None:  # ruff: ignore[unused-async]
        nonlocal called
        called = True

    async def run() -> Any:
        monkeypatch.setattr(mcp_router, 'record_call_log', fail_if_called)
        monkeypatch.setattr(mcp_router, 'mcp_toolkit', StubToolkit())
        return await mcp_router._call_tool(
            None,  # type: ignore[arg-type]
            user=_ctx(),
            params={'name': 'search_knowledge', 'arguments': {}},
            req_id=1,
            sse=False,
        )

    asyncio.run(run())
    assert called is False


def test_build_call_log_fields_excludes_structured_args() -> None:
    fields = build_call_log_fields(
        method='tools/call',
        tool_name='search_knowledge',
        user=_ctx(),
        args={
            'kb_name': 'dev',
            'query_text': '如何升级',
            'file_name': 'guide.md',
            'history': [{'role': 'user', 'content': 'x'}],
        },
        code='SUCCESS',
    )
    assert fields['kb_name'] == 'dev'
    assert fields['document_id'] is None
    assert fields['query_text'] == '如何升级'
    assert fields['status'] == 1
    assert fields['total_tokens'] is None


class BrokenSession:
    def add(self, obj: Any) -> None:
        raise RuntimeError('db down')

    async def rollback(self) -> None:
        pass


class CommittingSession:
    def __init__(self) -> None:
        self.committed = False
        self.added: Any = None

    def add(self, obj: Any) -> None:
        self.added = obj

    async def commit(self) -> None:
        self.committed = True


def test_record_call_log_best_effort_on_db_error() -> None:
    fields = build_call_log_fields(
        method='tools/call', tool_name='search_knowledge', user=_ctx(), args={'kb_name': 'dev'}, code='SUCCESS'
    )
    asyncio.run(record_call_log(BrokenSession(), **fields))  # type: ignore[arg-type]  # 落库失败不抛异常


def test_record_call_log_commits_on_success() -> None:
    fields = build_call_log_fields(
        method='tools/call', tool_name='search_knowledge', user=_ctx(), args={'kb_name': 'dev'}, code='SUCCESS'
    )
    session = CommittingSession()
    asyncio.run(record_call_log(session, **fields))  # type: ignore[arg-type]
    assert session.committed is True
    assert session.added is not None
