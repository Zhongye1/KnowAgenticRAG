"""接口基建自检：鉴权、统一信封、校验错误面（P0）。

这一组不检验业务，只检验「测试夹具本身是对的」：身份工厂签发的 token 能过真实
JWT 中间件、成功与错误出口都符合统一信封。它绿了，其它用例的失败才可信。

登录接口不在本套件范围：``LOGIN_CAPTCHA_ENABLED`` 默认开启（验证码 + 限流），
且属 admin 域；token 一律由 ``support/identity.py`` 走真实 ``create_access_token`` 签发。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from backend.e2e.support.api import API, err, ok_data

if TYPE_CHECKING:
    from httpx import AsyncClient

    from backend.e2e.support.identity import Identity

pytestmark = pytest.mark.p0


async def test_missing_token_is_401(client: AsyncClient) -> None:
    """未带凭证：JWT 依赖拦截为 401（不是 403，也不是 500）。"""
    err(await client.get(f'{API}/knowledge_bases'), 401)


async def test_invalid_token_is_401(client: AsyncClient) -> None:
    """伪造凭证：同样 401。"""
    err(await client.get(f'{API}/knowledge_bases', headers={'Authorization': 'Bearer not-a-token'}), 401)


async def test_minted_identity_passes_real_auth(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """身份工厂签发的 token 过真实 JWT 中间件 + RBAC（能拿到 KB 列表即证明）。"""
    data = ok_data(await client.get(f'{API}/knowledge_bases', headers=identities['owner'].headers))
    assert 'items' in data, f'分页信封结构异常: {data!r}'


async def test_unknown_field_is_422(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """``extra='forbid'``：检索请求传多余字段必须 422（``RagSearchParam`` 继承 ``KBSearchParam``）。"""
    resp = await client.post(
        f'{API}/rag/search',
        json={'query_text': 'x', 'kb_names': ['dev'], 'bogus_field': 1},
        headers=identities['owner'].headers,
    )
    err(resp, 422)


async def test_missing_kb_is_404_envelope(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """错误出口统一为 ``{code, msg, data, trace_id}``，且 HTTP status 与 code 一致。"""
    body = err(await client.get(f'{API}/knowledge_bases/e2e_absent_kb', headers=identities['owner'].headers), 404)
    assert isinstance(body['msg'], str) and body['msg']
