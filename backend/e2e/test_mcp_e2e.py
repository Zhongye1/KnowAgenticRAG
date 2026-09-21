"""MCP 工具面（P2）：JSON-RPC 传输面、多凭证鉴权、工具级权限与 KB ACL 求值口径。

为什么单独成模块：``/mcp`` 是唯一**不套 fba 统一信封**的入口（JSON-RPC 帧 + 自己的
``WWW-Authenticate``），也是唯一由 JWT ``scp`` claim 而非 RBAC 菜单决定工具可见性的
入口。这两条差异在本模块显式钉住，避免被顺手「统一」成平台其它端点的形态。

鉴权口径（``mcp/auth.py``）：JWT 直通要求会话键存活（logout/踢人即时生效）+ ``tenant``
claim 与服务端解析的域一致；``scp`` 缺省回退 ``RAGF_MCP_DEFAULT_SCOPES``（读面四点）。
API 面不产生 ``scp`` claim，故本模块用 ``identity.mint_token(sub, scp=[...])`` 补签。

**待修缺口**：工具体当前只做租户归属校验，不参与 KB ACL 求值——``get_document`` /
``read_document_chunks`` / ``list_knowledge_bases`` 会把同租户但无权访问的 KB（及其文档
元数据、片段）交出去。这些用 ``xfail(strict=True)`` 钉住：一旦修复会 XPASS 进而失败，
强制回头更新 spec §8，不允许静默变更。
"""

from __future__ import annotations

import json
import uuid

from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import TYPE_CHECKING, Any

import pytest

from backend.e2e.support import identity, seed
from backend.e2e.support.api import err, sse_events
from backend.src.app.mcp.api.router import MCP_HTTP_PATH
from backend.src.app.mcp.schemas import PERM_KB_LIST, PERM_KB_READ, PERM_KB_SEARCH
from backend.src.common.security.jwt import jwt_encode
from backend.src.utils.timezone import timezone

if TYPE_CHECKING:
    from httpx import AsyncClient, Response

    from backend.e2e.support.identity import Identity

pytestmark = pytest.mark.p2

MCP = MCP_HTTP_PATH  # 挂在应用根（非 /api/v1），与全局 JWT 中间件白名单前缀同源
CATALOG = f'{MCP}/tools'
Headers = dict[str, str]
# 会话级 KB 工厂：make_kb(as_persona=...) 可用其它主体建库（越权用例需要两个 owner）
MakeKb = Callable[..., Awaitable[str]]

_ALL_TOOLS = {
    'list_knowledge_bases',
    'search_knowledge',
    'answer_with_citations',
    'read_document_chunks',
    'get_document',
}


def _rpc(method: str, params: dict[str, Any] | None = None, *, req_id: Any = 1) -> dict[str, Any]:
    payload: dict[str, Any] = {'jsonrpc': '2.0', 'id': req_id, 'method': method}
    if params is not None:
        payload['params'] = params
    return payload


async def _as(user_id: int | str, scopes: list[str] | None = None) -> Headers:
    """补签 MCP 凭证；``scopes=None`` 留给服务端回退默认读面权限点。"""
    claims: dict[str, Any] = {} if scopes is None else {'scp': scopes}
    return {'Authorization': f'Bearer {await identity.mint_token(user_id, **claims)}'}


async def _call(client: AsyncClient, headers: Headers, tool: str, args: dict[str, Any]) -> dict[str, Any]:
    """tools/call 成功路径：返回 ``structuredContent``，并校验 text 与结构化结果同源。"""
    resp = await client.post(MCP, json=_rpc('tools/call', {'name': tool, 'arguments': args}), headers=headers)
    body = _body(resp)
    assert 'error' not in body, f'tools/call {tool} 失败: {body!r}'
    result = body['result']
    assert result['isError'] is False, f'tools/call {tool} 标记失败: {result!r}'
    assert json.loads(result['content'][0]['text']) == result['structuredContent'], 'text 与 structuredContent 不同源'
    return result['structuredContent']


async def _call_error(client: AsyncClient, headers: Headers, tool: str, args: dict[str, Any]) -> dict[str, Any]:
    """tools/call 失败路径：工具失败**不走 HTTP 错误码**，而是 JSON-RPC ``error`` 帧。"""
    resp = await client.post(MCP, json=_rpc('tools/call', {'name': tool, 'arguments': args}), headers=headers)
    body = _body(resp)
    assert 'error' in body, f'期望工具级错误，实际 {body!r}'
    return body['error']


def _body(resp: Response) -> dict[str, Any]:
    assert resp.status_code == 200, f'JSON-RPC 帧恒为 HTTP 200，实际 {resp.status_code}: {resp.text[:300]!r}'
    body = resp.json()
    assert isinstance(body, dict) and body.get('jsonrpc') == '2.0', f'非 JSON-RPC 2.0 帧: {body!r}'
    return body


def _tool_names(tools: list[dict[str, Any]]) -> set[str]:
    return {item['name'] for item in tools}


# --------------------------------------------------------------------------- 1. 传输协议面


async def test_initialize_echoes_protocol_and_reports_server(
    client: AsyncClient, identities: dict[str, Identity]
) -> None:
    """``initialize`` 回显请求协议版本并给出服务端标识；capabilities 只声明 tools。"""
    resp = await client.post(
        MCP,
        json=_rpc('initialize', {'protocolVersion': '2025-06-18'}),
        headers=identities['owner'].headers,
    )
    result = _body(resp)['result']
    assert result['protocolVersion'] == '2025-06-18'
    assert result['serverInfo']['name'] == 'ragf'
    assert result['capabilities'] == {'tools': {'listChanged': False}}


async def test_ping_returns_empty_result(client: AsyncClient, identities: dict[str, Identity]) -> None:
    resp = await client.post(MCP, json=_rpc('ping'), headers=identities['owner'].headers)
    assert _body(resp)['result'] == {}


async def test_notification_gets_202_without_body(client: AsyncClient) -> None:
    """``id`` 缺省 = notification：202 空体，且**在鉴权之前**短路（JSON-RPC 语义）。"""
    resp = await client.post(MCP, json={'jsonrpc': '2.0', 'method': 'ping'})
    assert resp.status_code == 202, f'notification 应 202 空体: {resp.status_code} {resp.text[:200]!r}'
    assert resp.content == b''


async def test_wrong_jsonrpc_version_is_invalid_request(client: AsyncClient, identities: dict[str, Identity]) -> None:
    resp = await client.post(
        MCP, json={'jsonrpc': '1.0', 'id': 7, 'method': 'ping'}, headers=identities['owner'].headers
    )
    assert resp.status_code == 400
    assert resp.json()['error']['code'] == -32600
    assert resp.json()['id'] == 7


async def test_batch_request_is_rejected(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """MVP 只支持单个请求对象（批量与 GET 会话待 mcp SDK 落地）。"""
    resp = await client.post(MCP, json=[_rpc('ping')], headers=identities['owner'].headers)
    assert resp.status_code == 400
    assert resp.json()['error']['code'] == -32600


async def test_malformed_json_body_is_parse_error(client: AsyncClient, identities: dict[str, Identity]) -> None:
    resp = await client.post(
        MCP, content=b'{not-json', headers={**identities['owner'].headers, 'Content-Type': 'application/json'}
    )
    assert resp.status_code == 400
    assert resp.json()['error']['code'] == -32700


async def test_unknown_method_is_method_not_found(client: AsyncClient, identities: dict[str, Identity]) -> None:
    resp = await client.post(MCP, json=_rpc('tools/subscribe'), headers=identities['owner'].headers)
    assert _body(resp)['error']['code'] == -32601


async def test_get_session_endpoint_is_not_supported(client: AsyncClient) -> None:
    """GET /mcp 会话模式未实现：405 + 可读 JSON-RPC 错误（不是 404 静默）。"""
    resp = await client.get(MCP)
    assert resp.status_code == 405
    assert resp.json()['error']['data']['code'] == 'INTERNAL'


async def test_sse_accept_returns_single_message_event(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """``Accept: text/event-stream``：单请求单响应，包成一条 ``message`` 事件。"""
    headers = {**identities['owner'].headers, 'Accept': 'text/event-stream'}
    resp = await client.post(MCP, json=_rpc('ping'), headers=headers)
    assert resp.headers['content-type'].startswith('text/event-stream')
    events = sse_events(resp.text)
    assert [name for name, _ in events] == ['message']
    assert json.loads(events[0][1])['result'] == {}


# --------------------------------------------------------------------------- 2. 多凭证鉴权


async def test_missing_bearer_is_401_with_www_authenticate(client: AsyncClient) -> None:
    """401 必须带 ``WWW-Authenticate``（Bearer 规范），帧内给出 UNAUTHORIZED 稳定码。"""
    resp = await client.post(MCP, json=_rpc('ping'))
    assert resp.status_code == 401
    assert resp.headers.get('www-authenticate') == 'Bearer realm="ragf-mcp"'
    error = resp.json()['error']
    assert error['code'] == -32001
    assert error['data']['code'] == 'UNAUTHORIZED'


async def test_invalid_bearer_is_401(client: AsyncClient) -> None:
    resp = await client.post(MCP, json=_rpc('ping'), headers={'Authorization': 'Bearer not-a-token'})
    assert resp.status_code == 401
    assert resp.json()['error']['code'] == -32001


async def test_jwt_without_live_session_is_401(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """会话键不存在 = 已 logout/被踢：签名合法也必须拒绝（撤销即时生效，不复用 fba 会话）。"""
    token = jwt_encode({
        'session_uuid': str(uuid.uuid4()),
        'exp': timezone.to_utc(timezone.now() + timedelta(minutes=10)).timestamp(),
        'sub': str(identities['owner'].user_id),
    })
    resp = await client.post(MCP, json=_rpc('ping'), headers={'Authorization': f'Bearer {token}'})
    assert resp.status_code == 401, '无会话键的 JWT 被放行：MCP 凭证绕过了平台会话撤销'


async def test_tenant_claim_mismatch_is_401(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """``tenant`` claim 与服务端解析域不一致 → 拒绝（claim 不得覆盖服务端判定）。"""
    headers = {'Authorization': f'Bearer {await identity.mint_token(identities["owner"].user_id, tenant="other")}'}
    resp = await client.post(MCP, json=_rpc('ping'), headers=headers)
    assert resp.status_code == 401


async def test_catalog_endpoint_requires_auth(client: AsyncClient) -> None:
    """``GET /mcp/tools`` 是平台侧路由（套统一信封），未带凭证 401。"""
    err(await client.get(CATALOG), 401)


async def test_catalog_is_filtered_by_scope(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """工具目录按 ``scp`` 过滤：默认读面 5 个全可见，只有 list 权限时只剩 1 个。"""
    default_scopes = (await client.get(CATALOG, headers=await _as(identities['owner'].user_id))).json()['data']
    assert _tool_names(default_scopes) == _ALL_TOOLS

    only_list = (await client.get(CATALOG, headers=await _as(identities['owner'].user_id, [PERM_KB_LIST]))).json()
    assert _tool_names(only_list['data']) == {'list_knowledge_bases'}


async def test_tools_list_respects_jsonrpc_and_scope(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """JSON-RPC ``tools/list`` 与 GET 目录同源过滤，且回带 required_permissions 元数据。"""
    headers = await _as(identities['owner'].user_id, [PERM_KB_LIST, PERM_KB_SEARCH])
    resp = await client.post(MCP, json=_rpc('tools/list'), headers=headers)
    tools = _body(resp)['result']['tools']
    assert _tool_names(tools) == {'list_knowledge_bases', 'search_knowledge'}
    for item in tools:
        assert item['inputSchema']['type'] == 'object', f'{item["name"]} 缺 inputSchema'
        assert item['required_permissions'], f'{item["name"]} 未声明所需权限点（D33 元数据丢失）'


# --------------------------------------------------------------------------- 3. 工具级权限与错误码


async def test_unknown_tool_is_unknown_tool_code(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """未知工具走稳定工具码（不是 INTERNAL），宿主 Agent 可据此区分重试语义。"""
    error = await _call_error(client, await _as(identities['owner'].user_id), 'delete_everything', {'kb_name': 'x'})
    assert error['code'] == -32000
    assert error['data']['code'] == 'UNKNOWN_TOOL'


async def test_missing_scope_is_permission_denied(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """``scp`` 不足：tool handler 内 require_perms 拒绝（D33），不进入业务逻辑。"""
    error = await _call_error(
        client,
        await _as(identities['owner'].user_id, [PERM_KB_LIST]),
        'search_knowledge',
        {'kb_names': ['e2e_absent_kb'], 'query_text': 'x'},
    )
    assert error['data']['code'] == 'PERMISSION_DENIED', f'缺少权限点应 PERMISSION_DENIED: {error!r}'


async def test_invalid_arguments_is_invalid_request(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """参数校验失败归一为 INVALID_REQUEST（含 ``extra='forbid'`` 的多余字段）。"""
    headers = await _as(identities['owner'].user_id)
    missing = await _call_error(client, headers, 'search_knowledge', {'query_text': 'x'})
    assert missing['data']['code'] == 'INVALID_REQUEST'
    extra = await _call_error(
        client, headers, 'search_knowledge', {'kb_names': ['e2e_absent_kb'], 'query_text': 'x', 'bogus': 1}
    )
    assert extra['data']['code'] == 'INVALID_REQUEST'


async def test_absent_kb_is_kb_not_found(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """库不存在 → 稳定码 KB_NOT_FOUND（工具面不复用 404 语义，靠 data.code 表达）。"""
    error = await _call_error(
        client,
        await _as(identities['owner'].user_id, [PERM_KB_READ]),
        'get_document',
        {'kb_name': 'e2e_absent_kb', 'document_id': 'doc-absent'},
    )
    assert error['data']['code'] == 'KB_NOT_FOUND'


async def test_search_on_unauthorized_kb_is_permission_denied(
    client: AsyncClient, identities: dict[str, Identity], make_kb: MakeKb
) -> None:
    """单库越权：库存在但不在调用方 scope 内 → PERMISSION_DENIED（不是空结果）。"""
    kb = await make_kb()
    error = await _call_error(
        client,
        await _as(identities['mate'].user_id, [PERM_KB_SEARCH]),
        'search_knowledge',
        {'kb_names': [kb], 'query_text': 'x'},
    )
    assert error['data']['code'] == 'PERMISSION_DENIED'


async def test_absent_document_is_document_not_found(
    client: AsyncClient, identities: dict[str, Identity], make_kb: MakeKb
) -> None:
    kb = await make_kb()
    error = await _call_error(
        client,
        await _as(identities['owner'].user_id, [PERM_KB_READ]),
        'get_document',
        {'kb_name': kb, 'document_id': 'doc-does-not-exist'},
    )
    assert error['data']['code'] == 'DOCUMENT_NOT_FOUND'


async def test_get_document_returns_registered_document(
    client: AsyncClient, identities: dict[str, Identity], make_kb: MakeKb
) -> None:
    """正例：两段式第一步登记后即可溯源（不依赖 worker，摄取状态此时为 pending）。"""
    kb = await make_kb()
    uploaded = await seed.upload_document(client, identities['owner'].headers, kb)
    data = await _call(
        client,
        await _as(identities['owner'].user_id, [PERM_KB_READ]),
        'get_document',
        {'kb_name': kb, 'document_id': uploaded['document_id']},
    )
    assert data['document_id'] == uploaded['document_id']
    assert data['status'] == 'pending'
    assert data['active_version'] == 1, 'active_version 是 Phase 2 占位，见 spec §8'


async def test_read_document_chunks_returns_empty_window_before_ingest(
    client: AsyncClient, identities: dict[str, Identity], make_kb: MakeKb
) -> None:
    """未摄取时窗口为空但形状完整（客户端不必写两套渲染）；offset/limit 原样回带。"""
    kb = await make_kb()
    uploaded = await seed.upload_document(client, identities['owner'].headers, kb)
    data = await _call(
        client,
        await _as(identities['owner'].user_id, [PERM_KB_READ]),
        'read_document_chunks',
        {'kb_name': kb, 'document_id': uploaded['document_id'], 'offset': 0, 'limit': 5},
    )
    assert data['total_chunks'] == 0
    assert data['chunks'] == []
    assert (data['offset'], data['version_id']) == (0, 1)


# --------------------------------------------------------------------------- 4. KB ACL 缺口（strict xfail）


@pytest.mark.xfail(strict=True, reason='工具体不参与 ACL 求值：列出整租户 KB（含无权库）')
async def test_list_knowledge_bases_is_not_acl_filtered(
    client: AsyncClient, identities: dict[str, Identity], make_kb: MakeKb
) -> None:
    """D21 元数据写明「列出当前身份**可见** KB」，实现是 ``list_all(tenant)``。

    这是同租户内的元数据泄露（库名/展示名/文档数），对无权主体不可见是 ``/knowledge_bases``
    列表的既有口径（``resolve_visible_kbs``）。修复后本用例应转为正例。
    """
    kb = await make_kb()
    data = await _call(client, await _as(identities['mate'].user_id, [PERM_KB_LIST]), 'list_knowledge_bases', {})
    names = {item['kb_name'] for item in data['knowledge_bases']}
    assert kb not in names, f'无权主体看到了 KB 元数据: {names!r}'


@pytest.mark.xfail(strict=True, reason='工具体不参与 ACL 求值：get_document 只校验租户归属')
async def test_get_document_ignores_kb_acl(
    client: AsyncClient, identities: dict[str, Identity], make_kb: MakeKb
) -> None:
    """D33 要求「``kb_id``/``document_id`` 校验归属（防工具版 IDOR）」，实现只校验租户。

    后果：同租户任意用户凭读面 ``scp``（而且是**默认** scp）即可拉到无权 KB 的文档元数据；
    ``read_document_chunks`` 同源，可直接读到正文。这是本套件发现的最高优先级缺口。
    """
    kb = await make_kb()
    uploaded = await seed.upload_document(client, identities['owner'].headers, kb)
    error = await _call_error(
        client,
        await _as(identities['mate'].user_id, [PERM_KB_READ]),
        'get_document',
        {'kb_name': kb, 'document_id': uploaded['document_id']},
    )
    assert error['data']['code'] in {'KB_NOT_FOUND', 'PERMISSION_DENIED'}, '无权主体读到了文档元数据'


@pytest.mark.xfail(strict=True, reason='工具体不参与 ACL 求值：read_document_chunks 只校验租户归属')
async def test_read_document_chunks_ignores_kb_acl(
    client: AsyncClient, identities: dict[str, Identity], make_kb: MakeKb
) -> None:
    """同上，但落在正文（chunk content）上——泄露面比元数据更大。"""
    kb = await make_kb()
    uploaded = await seed.upload_document(client, identities['owner'].headers, kb)
    error = await _call_error(
        client,
        await _as(identities['mate'].user_id, [PERM_KB_READ]),
        'read_document_chunks',
        {'kb_name': kb, 'document_id': uploaded['document_id']},
    )
    assert error['data']['code'] in {'KB_NOT_FOUND', 'PERMISSION_DENIED'}, '无权主体读到了文档片段'


@pytest.mark.xfail(strict=True, reason='混合 kb_names 静默收窄而非拒绝（HTTP 面同场景是 403）')
async def test_mixed_kb_names_is_narrowed_not_denied(
    client: AsyncClient, identities: dict[str, Identity], make_kb: MakeKb
) -> None:
    """``search_knowledge`` 用集合求交，越权库被静默丢弃；``/rag/search`` 同场景报 403。

    调用方（LLM/宿主 Agent）以为自己检索了全部 ``kb_names``，实际只搜了有权子集，
    缺数据却无任何错误信号——D33 的参数级归属校验要求逐库拒绝。
    """
    readable = await make_kb()
    await seed.grant_kb_acl(
        client,
        identities['owner'].headers,
        readable,
        [
            {
                'principal_type': 'user',
                'principal_id': str(identities['reader'].user_id),
                'perm': 'read',
                'effect': 'allow',
            }
        ],
    )
    hidden = await make_kb()
    error = await _call_error(
        client,
        await _as(identities['reader'].user_id, [PERM_KB_SEARCH]),
        'search_knowledge',
        {'kb_names': [readable, hidden], 'query_text': 'x', 'use_reranker': False, 'top_k': 1},
    )
    assert error['data']['code'] == 'PERMISSION_DENIED', f'混合越权应拒绝而非收窄: {error!r}'
