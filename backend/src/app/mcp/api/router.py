"""MCP 传输端点（agent-layer spec §6：POST /mcp JSON-RPC + GET /mcp/tools 目录）。

协议面为 JSON-RPC 2.0 子集（initialize / ping / tools/list / tools/call）；响应按
``Accept`` 支持 ``application/json`` 与 ``text/event-stream``（streamable HTTP
单请求响应，无状态会话，M10 MVP）。多凭证鉴权在端点层归一（auth.py），失败按
JSON-RPC 错误 + ``WWW-Authenticate`` 返回；不套 fba 统一响应包装（§10 风险清单）。

MVP 边界：不支持批量请求与 GET 长连接会话协商（会话模式待 mcp SDK 落地后演进）。
"""

from __future__ import annotations

import json

from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Request, Response
from fastapi.security.utils import get_authorization_scheme_param

from backend import __version__
from backend.src.app.kb.utils.namespace import resolve_namespace
from backend.src.app.mcp.auth import McpUserContext, authenticate_bearer, filter_tools
from backend.src.app.mcp.service import TOOL_SPECS, ToolError, mcp_toolkit
from backend.src.common.exception import errors
from backend.src.common.log import log

if TYPE_CHECKING:
    from backend.src.app.mcp.schemas import UserContext
    from backend.src.database.db import CurrentSession

router = APIRouter()

DEFAULT_PROTOCOL_VERSION = '2025-03-26'
_SSE_HEADERS = {'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}


def _tool_public(specs: list[Any]) -> list[dict[str, Any]]:
    return [
        {
            'name': spec.name,
            'description': spec.description,
            'inputSchema': spec.input_schema,
            'requiredPermissions': sorted(spec.required),
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


@router.get('/mcp/tools', summary='MCP 工具静态目录（JSON Schema，按调用方权限过滤）')
async def mcp_tools_catalog(user: McpUserContext) -> list[dict[str, Any]]:
    """工具目录：tools/list 同源过滤，供管理页/CLI 展示。"""
    return filter_tools(user, _tool_public(TOOL_SPECS))


@router.post('/mcp', summary='MCP Streamable HTTP 端点（JSON-RPC 2.0）')
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

    # 多凭证归一（D31-D33）：JWT 直通 / PAT；失败 401 + WWW-Authenticate
    auth = _require_user(request, req_id=req_id, sse=sse)
    if isinstance(auth, Response):
        return auth
    raw_params = body.get('params')
    params = raw_params if isinstance(raw_params, dict) else {}
    return await _dispatch(db, method=str(body.get('method') or ''), params=params, user=auth, req_id=req_id, sse=sse)


def _require_user(request: Request, *, req_id: Any, sse: bool) -> UserContext | Response:
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
    user = authenticate_bearer(token, ns) if token else None
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
    arguments = params.get('arguments') if isinstance(params.get('arguments'), dict) else {}
    try:
        result = await mcp_toolkit.call(db, user=user, tool_name=tool_name, args=arguments)
    except ToolError as exc:
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
        return _respond(
            _rpc_error(req_id, code=-32603, message='Internal error', data={'code': 'INTERNAL', 'msg': str(exc)}),
            sse=sse,
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


@router.get('/mcp', summary='MCP GET 会话端点（MVP 未实现）')
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
