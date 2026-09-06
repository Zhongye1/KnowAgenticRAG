"""MCP 传输端点（agent-layer spec §6：POST /mcp JSON-RPC + GET /mcp/tools 目录）。

协议面为 JSON-RPC 2.0 子集（initialize / ping / tools/list / tools/call）；响应按
``Accept`` 支持 ``application/json`` 与 ``text/event-stream``（streamable HTTP
单请求响应，无状态会话，M10 MVP）。多凭证鉴权在端点层归一（auth.py），失败按
JSON-RPC 错误 + ``WWW-Authenticate`` 返回；不套 fba 统一响应包装（§10 风险清单）。
调用审计（tools/call 落库）与基础限流（租户+sub）也收口在同一端点层。

MVP 边界：不支持批量请求与 GET 长连接会话协商（会话模式待 mcp SDK 落地后演进）。
"""

from __future__ import annotations

import json
import time

from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Request, Response
from fastapi.security.utils import get_authorization_scheme_param
from opentelemetry import metrics as otel_metrics
from opentelemetry import trace as otel_trace
from pyrate_limiter import Rate

from backend import __version__
from backend.src.app.kb.utils.namespace import resolve_namespace
from backend.src.app.mcp.auth import McpUserContext, authenticate_bearer, filter_tools
from backend.src.app.mcp.call_log import build_call_log_fields, record_call_log
from backend.src.app.mcp.service import TOOL_SPECS, ToolError, mcp_toolkit
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.db import (
    CurrentSession,  # ruff: ignore[typing-only-first-party-import]  # FastAPI 依赖别名需运行时解析
)
from backend.src.utils.limiter import RateLimiter
from backend.src.utils.request_parse import get_request_ip

if TYPE_CHECKING:
    from backend.src.app.mcp.schemas import UserContext

router = APIRouter()

DEFAULT_PROTOCOL_VERSION = '2025-03-26'
# MCP HTTP 端点基路径（D20：默认 /mcp，可配置；全局 JWT 中间件按此前缀白名单放行）
MCP_HTTP_PATH = str(settings.RAGF_MCP_HTTP_PATH or '/mcp').strip().rstrip('/') or '/mcp'
_SSE_HEADERS = {'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}

_TRACER = otel_trace.get_tracer('backend.ragf')
_METER = otel_metrics.get_meter('backend.ragf')
# agent-layer spec §5.4：MCP 调用数/失败率 + 耗时（按 工具×结果码 维度；不落 sub/kb 等 PII）
_MCP_CALLS = _METER.create_counter(
    'ragf.mcp.calls', unit='1', description='MCP tools/call 调用数（code=SUCCESS/稳定工具码/INTERNAL）'
)
_MCP_CALL_DURATION = _METER.create_histogram(
    'ragf.mcp.call_duration_seconds', unit='s', description='MCP tools/call 单次调用耗时'
)


def _tool_public(specs: list[Any]) -> list[dict[str, Any]]:
    return [
        {
            'name': spec.name,
            'description': spec.description,
            'inputSchema': spec.input_schema,
            'required_permissions': sorted(spec.required),
        }
        for spec in specs
    ]


def _rpc_result(req_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {'jsonrpc': '2.0', 'id': req_id, 'result': result}


def _rpc_error(req_id: Any, *, code: int, message: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
    error: dict[str, Any] = {'code': code, 'message': message}
    if data is not None:
        error['data'] = data
    return {'jsonrpc': '2.0', 'id': req_id, 'error': error}


def _respond(
    payload: dict[str, Any] | None,
    *,
    sse: bool,
    status_code: int = 200,
    headers: dict[str, str] | None = None,
) -> Response:
    if payload is None:
        return Response(status_code=202)
    text = json.dumps(payload, ensure_ascii=False)
    if sse:
        return Response(
            f'event: message\ndata: {text}\n\n',
            status_code=status_code,
            media_type='text/event-stream',
            headers={**_SSE_HEADERS, **(headers or {})},
        )
    return Response(text, status_code=status_code, media_type='application/json', headers=headers)


class _RateLimitedError(Exception):
    """限流触发标记：携带 Retry-After 秒数。"""

    def __init__(self, retry_after: int) -> None:
        super().__init__(retry_after)
        self.retry_after = retry_after


_mcp_limiter: RateLimiter | None = None


def _mcp_rate_callback(request: Request, response: Response, retry_after: int) -> None:
    """RateLimiter 回调：把限流转为私有标记，由端点层转 JSON-RPC 429。"""
    raise _RateLimitedError(retry_after)


def _mcp_rate_identifier(request: Request) -> str:
    """限流标识：优先租户+调用方，缺省回退 IP（未认证打点不计入用户桶）。"""
    user = getattr(request.state, 'mcp_user', None)
    if user is not None:
        return f'mcp:{user.tenant}:{user.sub}'
    return f'mcp:{get_request_ip(request)}'


def _get_mcp_limiter() -> RateLimiter | None:
    """构造（懒加载）/获取每进程限流器；开关关闭时直接放行。"""
    if not settings.RAGF_MCP_RATE_LIMIT_ENABLED:
        return None
    global _mcp_limiter
    if _mcp_limiter is None:
        _mcp_limiter = RateLimiter(
            Rate(max(1, int(settings.RAGF_MCP_RATE_LIMIT_PER_MINUTE)), 60_000),
            identifier=_mcp_rate_identifier,
            callback=_mcp_rate_callback,
        )
    return _mcp_limiter


async def _acquire_mcp_slot(request: Request, user: UserContext) -> int | None:
    """每请求限流（租户+sub）；超限返回 Retry-After 秒数，否则 None。"""
    limiter = _get_mcp_limiter()
    if limiter is None:
        return None
    request.state.mcp_user = user
    try:
        await limiter(request, Response())
    except _RateLimitedError as exc:
        return exc.retry_after
    return None


def _usage_total(result: dict[str, Any]) -> int | None:
    """从工具结果提取 token 用量（answer 类工具的 usage.total_tokens）。"""
    usage = result.get('usage')
    if isinstance(usage, dict) and isinstance(usage.get('total_tokens'), int):
        return usage['total_tokens']
    return None


async def _write_call_log(
    db: Any,
    *,
    user: UserContext,
    tool_name: str,
    args: dict[str, Any],
    code: str,
    msg: str | None = None,
    started: float,
    total_tokens: int | None = None,
) -> None:
    """tools/call 审计落库（M10；开关关闭或落库失败均不阻断响应）。"""
    if not settings.RAGF_MCP_LOG_ENABLED:
        return
    fields = build_call_log_fields(
        method='tools/call',
        tool_name=tool_name,
        user=user,
        args=args,
        code=code,
        msg=msg,
        cost_time=round((time.perf_counter() - started) * 1000.0, 3),
        total_tokens=total_tokens,
    )
    await record_call_log(db, **fields)


@router.get(f'{MCP_HTTP_PATH}/tools', summary='MCP 工具静态目录（JSON Schema，按调用方权限过滤）')
async def mcp_tools_catalog(user: McpUserContext) -> list[dict[str, Any]]:
    """工具目录：tools/list 同源过滤，供管理页/CLI 展示。"""
    return filter_tools(user, _tool_public(TOOL_SPECS))


@router.post(MCP_HTTP_PATH, summary='MCP Streamable HTTP 端点（JSON-RPC 2.0）')
async def mcp_jsonrpc_endpoint(request: Request, db: CurrentSession) -> Response:
    """JSON-RPC 分发：鉴权归一 → initialize/ping/tools/list/tools/call。"""
    sse = 'text/event-stream' in request.headers.get('accept', '')
    try:
        body = await request.json()
    except Exception:
        return _respond(_rpc_error(None, code=-32700, message='Parse error'), sse=sse, status_code=400)
    if not isinstance(body, dict):
        return _respond(_rpc_error(None, code=-32600, message='仅支持单个 JSON-RPC 请求对象'), sse=sse, status_code=400)
    req_id = body.get('id')
    if req_id is None:
        return _respond(None, sse=sse)  # notification
    if body.get('jsonrpc') != '2.0':
        return _respond(_rpc_error(req_id, code=-32600, message='Invalid Request'), sse=sse, status_code=400)

    # 多凭证归一（D31-D33）：JWT 直通（含会话存活校验）/ PAT；失败 401 + WWW-Authenticate
    auth = await _require_user(request, req_id=req_id, sse=sse)
    if isinstance(auth, Response):
        return auth
    retry_after = await _acquire_mcp_slot(request, auth)
    if retry_after is not None:
        return _respond(
            _rpc_error(
                req_id,
                code=-32000,
                message='Rate limit exceeded',
                data={'code': 'RATE_LIMITED', 'msg': '请求过于频繁，请稍后重试'},
            ),
            sse=sse,
            status_code=429,
            headers={'Retry-After': str(retry_after)},
        )
    raw_params = body.get('params')
    params = raw_params if isinstance(raw_params, dict) else {}
    return await _dispatch(db, method=str(body.get('method') or ''), params=params, user=auth, req_id=req_id, sse=sse)


async def _require_user(request: Request, *, req_id: Any, sse: bool) -> UserContext | Response:
    """Authorization → UserContext；失败返回 JSON-RPC 错误响应（401/403）。"""
    try:
        ns = resolve_namespace(request.headers.get('X-Plugin-Namespace'))
    except errors.ForbiddenError:
        return _respond(
            _rpc_error(
                req_id,
                code=-32000,
                message='Forbidden',
                data={'code': 'PERMISSION_DENIED', 'msg': 'namespace 越权'},
            ),
            sse=sse,
            status_code=403,
        )
    _scheme, token = get_authorization_scheme_param(request.headers.get('Authorization') or '')
    user = await authenticate_bearer(token, ns) if token else None
    if user is None:
        return _respond(
            _rpc_error(
                req_id,
                code=-32001,
                message='Unauthorized',
                data={'code': 'UNAUTHORIZED', 'msg': '无效或缺失 Bearer 凭证'},
            ),
            sse=sse,
            status_code=401,
            headers={'WWW-Authenticate': 'Bearer realm="ragf-mcp"'},
        )
    return user


async def _dispatch(
    db: CurrentSession,
    *,
    method: str,
    params: dict[str, Any],
    user: UserContext,
    req_id: Any,
    sse: bool,
) -> Response:
    """按方法分发 JSON-RPC 请求。"""
    if method == 'initialize':
        return _respond(
            _rpc_result(
                req_id,
                {
                    'protocolVersion': str(params.get('protocolVersion') or DEFAULT_PROTOCOL_VERSION),
                    'capabilities': {'tools': {'listChanged': False}},
                    'serverInfo': {'name': 'ragf', 'version': __version__},
                },
            ),
            sse=sse,
        )
    if method == 'ping':
        return _respond(_rpc_result(req_id, {}), sse=sse)
    if method == 'tools/list':
        return _respond(_rpc_result(req_id, {'tools': filter_tools(user, _tool_public(TOOL_SPECS))}), sse=sse)
    if method == 'tools/call':
        return await _call_tool(db, user=user, params=params, req_id=req_id, sse=sse)
    return _respond(_rpc_error(req_id, code=-32601, message=f'Method not found: {method}'), sse=sse)


async def _call_tool(
    db: CurrentSession,
    *,
    user: UserContext,
    params: dict[str, Any],
    req_id: Any,
    sse: bool,
) -> Response:
    """tools/call：调用 toolkit 并把结果/错误转为 JSON-RPC。"""
    tool_name = str(params.get('name') or '')
    raw_arguments = params.get('arguments')
    arguments: dict[str, Any] = raw_arguments if isinstance(raw_arguments, dict) else {}
    started = time.perf_counter()
    with _TRACER.start_as_current_span('ragf.mcp.tool_call') as span:
        span.set_attribute('ragf.mcp.tool', tool_name)
        try:
            result = await mcp_toolkit.call(db, user=user, tool_name=tool_name, args=arguments)
        except ToolError as exc:
            _record_mcp_call(tool_name, code=exc.code, started=started)
            await _write_call_log(
                db,
                user=user,
                tool_name=tool_name,
                args=arguments,
                code=exc.code,
                msg=exc.msg,
                started=started,
            )
            return _respond(
                _rpc_error(
                    req_id,
                    code=-32000,
                    message='Tool execution failed',
                    data={'code': exc.code, 'msg': exc.msg},
                ),
                sse=sse,
            )
        except Exception as exc:
            log.warning('mcp tools/call 未处理异常 tool={} err={}', tool_name, exc)
            _record_mcp_call(tool_name, code='INTERNAL', started=started)
            await _write_call_log(
                db,
                user=user,
                tool_name=tool_name,
                args=arguments,
                code='INTERNAL',
                msg=str(exc),
                started=started,
            )
            return _respond(
                _rpc_error(req_id, code=-32603, message='Internal error', data={'code': 'INTERNAL', 'msg': str(exc)}),
                sse=sse,
            )
        _record_mcp_call(tool_name, code='SUCCESS', started=started)
        await _write_call_log(
            db,
            user=user,
            tool_name=tool_name,
            args=arguments,
            code='SUCCESS',
            started=started,
            total_tokens=_usage_total(result),
        )
        return _respond(
            _rpc_result(
                req_id,
                {
                    'content': [{'type': 'text', 'text': json.dumps(result, ensure_ascii=False)}],
                    'structuredContent': result,
                    'isError': False,
                },
            ),
            sse=sse,
        )


def _record_mcp_call(tool_name: str, *, code: str, started: float) -> None:
    """tools/call 指标打点：调用数 + 耗时（按 工具×结果码；失败率可由 code 聚合）。"""
    _MCP_CALLS.add(1, {'tool': tool_name, 'code': code})
    _MCP_CALL_DURATION.record(time.perf_counter() - started, {'tool': tool_name, 'code': code})


@router.get(MCP_HTTP_PATH, summary='MCP GET 会话端点（MVP 未实现）')
async def mcp_get_not_supported(request: Request) -> Response:
    """Streamable HTTP 会话模式留待 mcp SDK 落地；返回可读的 JSON-RPC 错误。"""
    sse = 'text/event-stream' in request.headers.get('accept', '')
    return _respond(
        _rpc_error(
            None,
            code=-32000,
            message='GET session not supported',
            data={'code': 'INTERNAL', 'msg': 'M10 MVP 仅支持无状态 POST /mcp（streamable HTTP 会话待演进）'},
        ),
        sse=sse,
        status_code=405,
    )
