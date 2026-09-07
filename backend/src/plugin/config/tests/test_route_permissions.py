"""config 插件路由权限码接线测试。

回归锚点：批量更新端点曾误用点号分隔的 ``sys.config.edits``（seed 未注册，
非超管恒 403），必须与 seed 注册的 ``sys:config:*`` 冒号风格一致。
"""

from __future__ import annotations

from typing import Any

from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import rbac_verify


def _perm_codes(route: Any) -> list[str]:
    """提取路由依赖链上声明的权限码（RequestPermission.value）。"""
    return [
        dep.call.value
        for dep in route.dependant.dependencies
        if isinstance(getattr(dep, 'call', None), RequestPermission)
    ]


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


def test_bulk_update_requires_config_edit_perm() -> None:
    from backend.src.plugin.config.api.v1.sys.config import router

    route = _find_route(router, '', 'PUT')
    assert 'sys:config:edit' in _perm_codes(route)
    assert _perm_before_rbac(route, 'sys:config:edit')


def test_config_write_perms_share_registered_codes() -> None:
    """全部写操作权限码必须出现在插件 seed（sys_menu.perms）中。"""
    import re

    from backend.src.core.path_conf import PLUGIN_DIR

    seed = (PLUGIN_DIR / 'config' / 'sql' / 'postgresql' / 'init.sql').read_text(encoding='utf-8')
    seed_perms = set(re.findall(r"'(sys:config:[a-z]+)'", seed))

    from backend.src.plugin.config.api.v1.sys.config import router

    route_perms = {
        code
        for method, path in [('POST', ''), ('PUT', ''), ('PUT', '/{pk}'), ('DELETE', '')]
        for code in _perm_codes(_find_route(router, path, method))
    }
    assert route_perms <= seed_perms
