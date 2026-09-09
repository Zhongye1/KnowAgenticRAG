"""模型供应商模块路由权限码接线测试。

校验写操作路由声明了正确的 ``RequestPermission`` 权限码，且顺序在 ``DependsRBAC``
之前（先设 ctx.permission 后校验，fba 约束）；读操作路由保持仅登录态（D14）。
"""

from __future__ import annotations

from typing import Any

from backend.src.app.model_provider.utils.permissions import (
    MODEL_PROVIDER_ADD,
    MODEL_PROVIDER_DEL,
    MODEL_PROVIDER_EDIT,
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


def _perm_before_rbac(route: Any, perm_code: str) -> bool:
    """RequestPermission 必须先于 rbac_verify 出现（fba 鉴权顺序约束）。"""
    names: list[str] = []
    for dep in route.dependant.dependencies:
        call = getattr(dep, 'call', None)
        if isinstance(call, RequestPermission):
            names.append(f'perm:{call.value}')
        elif call is rbac_verify:
            names.append('rbac')
    return f'perm:{perm_code}' in names and names.index(f'perm:{perm_code}') < names.index('rbac')


def _find_route(router: Any, path: str, method: str) -> Any:
    for route in router.routes:
        if getattr(route, 'path', None) == path and method in getattr(route, 'methods', set()):
            return route
    raise AssertionError(f'route not found: {method} {path}')


def test_write_routes_require_provider_perms() -> None:
    from backend.src.app.model_provider.api.v1.providers import router

    assert MODEL_PROVIDER_ADD in _route_perm_codes(_find_route(router, '', 'POST'))
    assert MODEL_PROVIDER_EDIT in _route_perm_codes(_find_route(router, '/{provider_id}', 'PATCH'))
    assert MODEL_PROVIDER_DEL in _route_perm_codes(_find_route(router, '/{provider_id}', 'DELETE'))
    assert MODEL_PROVIDER_EDIT in _route_perm_codes(_find_route(router, '/test-connection', 'POST'))


def test_write_route_perm_precedes_rbac() -> None:
    from backend.src.app.model_provider.api.v1.providers import router

    assert _perm_before_rbac(_find_route(router, '', 'POST'), MODEL_PROVIDER_ADD)
    assert _perm_before_rbac(_find_route(router, '/{provider_id}', 'PATCH'), MODEL_PROVIDER_EDIT)
    assert _perm_before_rbac(_find_route(router, '/{provider_id}', 'DELETE'), MODEL_PROVIDER_DEL)
    assert _perm_before_rbac(_find_route(router, '/test-connection', 'POST'), MODEL_PROVIDER_EDIT)


def test_read_routes_stay_jwt_only() -> None:
    """D14：读操作（列表/详情）不设功能权限码，仅登录态。"""
    from backend.src.app.model_provider.api.v1.providers import router

    assert _route_perm_codes(_find_route(router, '', 'GET')) == []
    assert _route_perm_codes(_find_route(router, '/{provider_id}', 'GET')) == []
