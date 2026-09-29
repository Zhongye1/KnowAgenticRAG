"""OpenAPI schema 可生成性守卫。

**为什么需要这个测试**：接口函数里凡是「运行时才需要、看上去只用于注解」的导入，
一旦被放进 `if TYPE_CHECKING:`（ruff 的 `typing-only-first-party-import` 在模块带
`from __future__ import annotations` 时会这么建议并自动修），FastAPI 就无法按名字
解析该注解，生成 OpenAPI 时报 `PydanticUserError: ... is not fully defined`。

这类破坏**普通接口测试完全看不见**——app 能正常启动、请求也能跑通，只有
`GET /openapi` 与 `pnpm generate:api` 会炸。它在 2026-09-29 的 Phase 3 真实发生过
（`kb/api/v1/{preview,batch}.py` 的 `CurrentSessionTransaction` 被移进 TYPE_CHECKING，
导致前端代码生成链路整条断掉），因此在这里落一条最便宜的守卫。

约定：API 模块**不要写 `from __future__ import annotations`**，且 FastAPI 依赖别名
（`CurrentSession` / `CurrentSessionTransaction` / `CurrentNamespace` / `CurrentKbUser` …）
必须运行期导入。既有模块均如此，必要时用
`# ruff: ignore[typing-only-first-party-import]  # FastAPI 依赖别名需运行时解析` 显式豁免。
"""

from __future__ import annotations

from backend.main import app

# 每个业务域至少一个代表端点：确保该域的路由真的被挂上（漏挂也会在这里暴露）
_EXPECTED_PATHS = (
    '/api/v1/knowledge_bases',
    '/api/v1/documents',
    '/api/v1/documents/{document_id}/preview',
    '/api/v1/documents/{document_id}/preview/content',
    '/api/v1/documents/batch',
    '/api/v1/documents/batch/reindex',
    '/api/v1/knowledge_bases/{kb_name}/folders/tree',
)


def test_openapi_schema_is_generatable() -> None:
    """生成 OpenAPI 不得抛错（依赖别名解析失败会在这里炸）。"""
    spec = app.openapi()

    assert spec['openapi'].startswith('3.')
    assert spec['paths'], 'OpenAPI 未产出任何路径'


def test_expected_paths_are_registered() -> None:
    spec = app.openapi()

    missing = [path for path in _EXPECTED_PATHS if path not in spec['paths']]
    assert not missing, f'以下端点未注册到 OpenAPI: {missing}'


def test_batch_route_precedes_document_id_route() -> None:
    """`DELETE /documents/batch` 必须先于 `/{document_id}` 注册，否则 `batch` 被吃掉。

    OpenAPI 的 `paths` 按路由注册顺序生成，故用其**键顺序**断言注册先后；
    真实请求匹配行为需要完整依赖栈，属 e2e 范畴（此处只锁最易回退的那一点）。
    """
    spec = app.openapi()
    keys = list(spec['paths'])
    assert '/api/v1/documents/batch' in keys
    assert '/api/v1/documents/{document_id}' in keys

    batch_index = keys.index('/api/v1/documents/batch')
    doc_id_index = keys.index('/api/v1/documents/{document_id}')
    assert batch_index < doc_id_index, 'batch 路由注册在 /{document_id} 之后，会被当成 document_id 吃掉'
