"""RAG 检索接口的权限与契约面（P1，无需 worker / 无需外部模型）。

本模块只断言**请求还没走到向量化就被判定**的部分：路由是否 canonical、参数校验面、
越权与不存在的形态差异。检索内容（sources/route/steps、引用闭环）需要真实摄取与
embedding，属 ``test_rag_pipeline_e2e.py``（``chain``）。

为什么能不进模型：``RetrievalService._asteps`` 的顺序是 ① scope 求交 → ② KB 归属加载
→ ③ embedding，前两步的失败在 ③ 之前抛出。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from backend.e2e.support.api import API, err

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from httpx import AsyncClient

    from backend.e2e.support.identity import Identity

pytestmark = pytest.mark.p1

SEARCH = f'{API}/rag/search'


def _body(kb_names: list[str], **overrides: Any) -> dict[str, Any]:
    return {'query_text': '安装步骤是什么', 'kb_names': kb_names, **overrides}


async def test_old_per_kb_search_path_is_gone(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """canonical-only：旧 ``/knowledge_bases/{kb}/search`` 不再存在（不写兼容端点）。

    该路径只匹配到 ``GET /knowledge_bases/{kb_name}``，所以是 405 而不是 404——无论哪种，
    关键是**没有**被服务成检索（没有 200）。
    """
    kb = await make_kb()
    resp = await client.post(
        f'{API}/knowledge_bases/{kb}/search', json={'query_text': 'x'}, headers=identities['owner'].headers
    )
    assert resp.status_code == 405, f'旧检索端点仍在: {resp.status_code} {resp.text[:200]!r}'


async def test_search_validates_kb_names_bounds(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """``kb_names`` 必填且 1-20：缺失、空数组、超 20 都是 422（校验面而非业务面）。"""
    headers = identities['owner'].headers
    err(await client.post(SEARCH, json={'query_text': 'x'}, headers=headers), 422)
    err(await client.post(SEARCH, json=_body([]), headers=headers), 422)
    err(await client.post(SEARCH, json=_body([f'e2e_kb_{i}' for i in range(21)]), headers=headers), 422)


async def test_search_validates_query_text(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """``query_text`` 非空（min_length=1）：空串 422。"""
    err(await client.post(SEARCH, json=_body(['e2e_any'], query_text=''), headers=identities['owner'].headers), 422)


async def test_search_absent_kb_is_404(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """库不存在 → 404（KB 归属加载阶段，早于 embedding）。"""
    err(await client.post(SEARCH, json=_body(['e2e_absent_kb']), headers=identities['owner'].headers), 404)


async def test_search_mixed_kb_names_is_403(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """跨库越权与单库不同口径：``kb_names`` 混入无权库 → 403（批量检索的诊断语义）。

    同时提示无权集合，且不返回任何结果——这是本套件里唯一「资源权限报 403 而非 404」
    的端点，刻意钉住以免被顺手「统一」成 404。
    """
    mine = await make_kb()
    theirs = await make_kb(as_persona='outsider')

    denied = err(await client.post(SEARCH, json=_body([mine, theirs]), headers=identities['owner'].headers), 403)
    assert theirs in str(denied['msg']), f'403 文案应指出无权库: {denied!r}'
    assert 'data' not in denied or denied['data'] is None, '越权请求不得带回结果'


async def test_search_single_unauthorized_kb_is_also_403(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """单库越权同样 403（口径按端点统一，不按库数分叉）。"""
    kb = await make_kb()
    err(await client.post(SEARCH, json=_body([kb]), headers=identities['outsider'].headers), 403)


async def test_search_visible_kb_is_not_blocked_by_scope(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """owner 对自己的库能过 scope 求交（不因鉴权被拦），失败点应在更后面的检索阶段。

    这里不断言 200：无 embedding 凭据/无内容时后面会失败；用「不是 403/404」表达
    「权限层已放行」，避免把环境问题伪装成权限问题。
    """
    kb = await make_kb()
    resp = await client.post(SEARCH, json=_body([kb]), headers=identities['owner'].headers)
    assert resp.status_code not in (401, 403, 404), f'权限层不应拦下自己的库: {resp.status_code} {resp.text[:200]!r}'


async def test_search_kb_created_by_other_tenant_is_invisible_not_interchangeable(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """跨部门/跨 owner 的库不可见：他人建的库对当前主体等价于不存在（403 与 404 各归其位）。"""
    theirs = await make_kb(as_persona='outsider')
    # outsider 自己可见（权限层放行，后面失败与权限无关）
    resp = await client.post(SEARCH, json=_body([theirs]), headers=identities['outsider'].headers)
    assert resp.status_code not in (401, 403, 404)
    # owner 无权 → 越权 403
    err(await client.post(SEARCH, json=_body([theirs]), headers=identities['owner'].headers), 403)
    # 不存在的库 → 404（与越权区分）
    err(await client.post(SEARCH, json=_body(['e2e_absent_kb']), headers=identities['owner'].headers), 404)


async def test_rag_images_url_is_404_for_unknown_image(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """视觉回源：未知 image_id 一律 404（不 403、不泄露是否存在）。

    真实视觉行的权限分支（KB >= read）需要视觉摄取产物，属 ``chain`` 覆盖范围；
    这里锁的是「未授权/不存在同形态」这个不变量在最外层也成立。
    """
    path = f'{API}/rag/images/e2e_absent_image/url'
    for persona in ('owner', 'outsider'):
        body = err(await client.get(path, headers=identities[persona].headers), 404)
        assert '视觉图像不存在' in str(body['msg']), body
