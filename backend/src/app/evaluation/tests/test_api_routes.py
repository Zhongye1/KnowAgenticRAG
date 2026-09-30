"""评估域路由注册测试（D61）。

挡的是「接口写好了但没挂到总路由」——这类缺陷在单测里全绿、只有真实请求才 404。

断言走 **OpenAPI schema** 而非 ``app.routes``：当前 FastAPI 的 ``include_router`` 是
延迟展开的（父 router 上只留 ``_IncludedRouter`` 标记，``path`` 为 None），直接遍历
``app.routes`` 会把所有业务端点都误判成"没注册"。``app.openapi()`` 会强制解析整棵
路由树，是唯一可靠的入口。
"""

from __future__ import annotations

from typing import Any

import pytest

from backend.main import app
from backend.src.app.evaluation.api.v1.datasets import router as datasets_router
from backend.src.app.evaluation.api.v1.runs import router as runs_router

EXPECTED: set[tuple[str, str]] = {
    ('/api/v1/evaluation/datasets', 'post'),
    ('/api/v1/evaluation/datasets', 'get'),
    ('/api/v1/evaluation/datasets/generate', 'post'),
    ('/api/v1/evaluation/datasets/{dataset_id}', 'get'),
    ('/api/v1/evaluation/datasets/{dataset_id}', 'delete'),
    ('/api/v1/evaluation/datasets/{dataset_id}/items', 'get'),
    ('/api/v1/evaluation/runs', 'post'),
    ('/api/v1/evaluation/runs', 'get'),
    ('/api/v1/evaluation/runs/{run_id}', 'get'),
    ('/api/v1/evaluation/runs/{run_id}', 'delete'),
    ('/api/v1/evaluation/runs/{run_id}/items', 'get'),
}


@pytest.fixture(scope='module')
def openapi_paths() -> dict[str, Any]:
    return app.openapi()['paths']


def test_all_expected_endpoints_are_mounted(openapi_paths: dict[str, Any]) -> None:
    mounted = {(path, method) for path, ops in openapi_paths.items() for method in ops}
    missing = EXPECTED - mounted
    assert not missing, f'未挂载的端点: {sorted(missing)}'


def test_evaluation_endpoints_carry_auth_dependencies() -> None:
    """每个端点都要有认证/权限依赖——漏挂在本域是最容易犯的错。

    断言在最内层 router 上做：那一层的 ``@router.post(...)`` 已产出真实 ``APIRoute``
    （``dependencies`` 可读），而父层 ``include_router`` 要到 OpenAPI 解析时才展开。
    本项目全仓端点不在 OpenAPI 里声明 401/403，所以从 schema 侧查认证是查不到的。
    """
    checked = 0
    for router in (datasets_router, runs_router):
        for route in router.routes:
            checked += 1
            dependencies = getattr(route, 'dependencies', None) or []
            assert dependencies, f'{route.path} 缺少认证/权限依赖'  # type: ignore[attr-defined]
    assert checked == len(EXPECTED)


def test_endpoints_declare_summaries(openapi_paths: dict[str, Any]) -> None:
    """summary 是前端与文档面的可读性来源，不能留空。"""
    for path, ops in openapi_paths.items():
        if not path.startswith('/api/v1/evaluation'):
            continue
        for method, operation in ops.items():
            assert operation.get('summary'), f'{method.upper()} {path} 缺少 summary'
