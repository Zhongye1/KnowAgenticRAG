"""图谱域路由注册测试（D62）：端点挂载与鉴权依赖。

断言走 **OpenAPI schema** 而非 ``app.routes``：当前 FastAPI 的 ``include_router`` 是延迟
展开的（父 router 上只留 ``_IncludedRouter``，``path`` 为 None），遍历 ``app.routes`` 会把
所有业务端点误判成"没注册"。
"""

from __future__ import annotations

from typing import Any

import pytest

from backend.main import app
from backend.src.app.graph.api.v1.graph import router as graph_router

EXPECTED: set[tuple[str, str]] = {
    ('/api/v1/graph/{kb_name}/documents/build', 'post'),
    ('/api/v1/graph/{kb_name}/stats', 'get'),
    ('/api/v1/graph/{kb_name}/subgraph', 'get'),
    ('/api/v1/graph/{kb_name}', 'delete'),
}


@pytest.fixture(scope='module')
def openapi_paths() -> dict[str, Any]:
    return app.openapi()['paths']


def test_all_expected_endpoints_are_mounted(openapi_paths: dict[str, Any]) -> None:
    mounted = {(path, method) for path, ops in openapi_paths.items() for method in ops}
    missing = EXPECTED - mounted
    assert not missing, f'未挂载的端点: {sorted(missing)}'


def test_no_graph_endpoint_is_anonymous() -> None:
    """每个端点都要有认证/权限依赖——漏挂在本域是最容易犯的错。

    断言在最内层 router 上做：那一层已产出真实 ``APIRoute``（``dependencies`` 可读），
    而父层要到 OpenAPI 解析时才展开。
    """
    checked = 0
    for route in graph_router.routes:
        checked += 1
        assert getattr(route, 'dependencies', None), f'{route.path} 缺少认证/权限依赖'  # type: ignore[attr-defined]
    assert checked == len(EXPECTED)


def test_endpoints_declare_summaries(openapi_paths: dict[str, Any]) -> None:
    for path, ops in openapi_paths.items():
        if not path.startswith('/api/v1/graph'):
            continue
        for method, operation in ops.items():
            assert operation.get('summary'), f'{method.upper()} {path} 缺少 summary'
