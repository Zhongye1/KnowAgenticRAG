"""RAG 模块路由权限码接线测试（agent-layer spec：RAG 路由挂 DependsRBAC）。

校验关键路由声明了正确的 ``RequestPermission`` 权限码，且顺序在 ``DependsRBAC``
之前（先设 ctx.permission 后校验，fba 约束）。
"""

from __future__ import annotations

from typing import Any

from backend.src.app.kb.utils.permissions import (
    RAG_KB_ACL,
    RAG_KB_CHAT,
    RAG_KB_CREATE,
    RAG_KB_INGEST,
    RAG_KB_LIST,
    RAG_KB_MANAGE,
    RAG_KB_READ,
    RAG_KB_SEARCH,
    RAG_KB_TRANSFER,
)
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import rbac_verify


def _route_perm_codes(route: Any) -> list[str]:
    """提取路由依赖链上声明的权限码（RequestPermission.value）。"""
    codes = []
    for dep in route.dependant.dependencies:
        call = getattr(dep, 'call', None)
        if isinstance(call, RequestPermission):
            codes.append(call.value)
    return codes


def _has_rbac_after_perm(route: Any, perm_code: str) -> bool:
    """RequestPermission 必须先于 rbac_verify 出现（fba 鉴权顺序约束）。"""
    names: list[str] = []
    for dep in route.dependant.dependencies:
        call = getattr(dep, 'call', None)
        if isinstance(call, RequestPermission):
            names.append(f'perm:{call.value}')
        elif call is rbac_verify:
            names.append('rbac')
    return names.index(f'perm:{perm_code}') < names.index('rbac') if f'perm:{perm_code}' in names else False


def _find_route(router: Any, path: str, method: str) -> Any:
    for route in router.routes:
        if getattr(route, 'path', None) == path and method in getattr(route, 'methods', set()):
            return route
    raise AssertionError(f'route not found: {method} {path}')


def test_search_route_requires_search_perm() -> None:
    from backend.src.app.retrieval.api.v1.rag_query import search_router

    route = _find_route(search_router, '/search', 'POST')
    assert RAG_KB_SEARCH in _route_perm_codes(route)
    assert _has_rbac_after_perm(route, RAG_KB_SEARCH)


def test_rag_image_route_requires_read_perm() -> None:
    from backend.src.app.retrieval.api.v1.rag_query import images_router

    route = _find_route(images_router, '/images/{image_id}/url', 'GET')
    assert RAG_KB_READ in _route_perm_codes(route)
    assert _has_rbac_after_perm(route, RAG_KB_READ)


def test_chat_routes_require_chat_perm() -> None:
    from backend.src.app.chat.api.v1.chat import router

    for path in ('/{kb_name}/chat', '/{kb_name}/chat/stream'):
        route = _find_route(router, path, 'POST')
        assert RAG_KB_CHAT in _route_perm_codes(route)
        assert _has_rbac_after_perm(route, RAG_KB_CHAT)


def test_kb_routes_require_list_or_manage_perm() -> None:
    from backend.src.app.kb.api.v1.knowledge_bases import router

    assert RAG_KB_LIST in _route_perm_codes(_find_route(router, '', 'GET'))
    assert RAG_KB_LIST in _route_perm_codes(_find_route(router, '/overview', 'GET'))
    assert RAG_KB_CREATE in _route_perm_codes(_find_route(router, '', 'POST'))  # D49 建库权拆分
    assert RAG_KB_TRANSFER in _route_perm_codes(
        _find_route(router, '/{kb_name}/transfer', 'POST')
    )  # §7.1 组织管理员兜底通道
    assert RAG_KB_MANAGE in _route_perm_codes(_find_route(router, '/{kb_name}', 'DELETE'))


def test_document_routes_require_read_ingest_manage_perm() -> None:
    from backend.src.app.kb.api.v1.documents import router

    assert RAG_KB_READ in _route_perm_codes(_find_route(router, '/{document_id}', 'GET'))
    assert RAG_KB_READ in _route_perm_codes(_find_route(router, '/{document_id}/download', 'GET'))
    assert RAG_KB_INGEST in _route_perm_codes(_find_route(router, '/{document_id}/file', 'PUT'))
    assert RAG_KB_MANAGE in _route_perm_codes(_find_route(router, '/{document_id}', 'DELETE'))


def test_ingest_routes_require_ingest_perm() -> None:
    from backend.src.app.ingest.api.v1.router import router

    assert RAG_KB_INGEST in _route_perm_codes(_find_route(router, '/{kb_name}/documents', 'POST'))
    assert RAG_KB_INGEST in _route_perm_codes(_find_route(router, '/{kb_name}/documents/{document_id}/ingest', 'POST'))
    assert RAG_KB_INGEST in _route_perm_codes(_find_route(router, '/{kb_name}/rebuild', 'POST'))


def test_acl_routes_require_manage_perm() -> None:
    from backend.src.app.kb.api.v1.acls import doc_acl_router, kb_acl_router

    assert RAG_KB_LIST in _route_perm_codes(_find_route(kb_acl_router, '/{kb_name}/acl', 'GET'))
    assert RAG_KB_ACL in _route_perm_codes(_find_route(kb_acl_router, '/{kb_name}/acl', 'PUT'))  # D49 授权权拆分
    assert RAG_KB_READ in _route_perm_codes(_find_route(doc_acl_router, '/{document_id}/acl', 'GET'))
    assert RAG_KB_MANAGE in _route_perm_codes(_find_route(doc_acl_router, '/{document_id}/acl', 'PUT'))


def test_mcp_permission_codes_share_single_source() -> None:
    """D30：MCP 权限点与 HTTP RBAC 权限码同源（kb/utils/permissions.py）。"""
    from backend.src.app.mcp.schemas import PERM_KB_CHAT, PERM_KB_LIST, PERM_KB_READ, PERM_KB_SEARCH

    assert PERM_KB_LIST == RAG_KB_LIST
    assert PERM_KB_SEARCH == RAG_KB_SEARCH
    assert PERM_KB_READ == RAG_KB_READ
    assert PERM_KB_CHAT == RAG_KB_CHAT
