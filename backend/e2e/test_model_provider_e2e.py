"""模型供应商接口（P2）：写面功能码、凭据不回显、校验与冲突面。

该域是 **system 级配置表（不做租户隔离，D14）**：一个 provider 行 = 一个供应商，
``enabled_models`` 是它下面已启用的模型。由此带来两条与其他域不同的口径，本模块专门锁：

1. 读面（列表/详情）只要求登录态——普通用户选模型时要能读到可用供应商；写面才是
   ``sys:model-provider:{add,edit,del}`` 功能码。于是同一个只读角色在 GET 上是 200/404，
   在 POST/PATCH/DELETE 上是 403（两层失败形态必须能区分）。
2. ``api_key`` 只进不出：创建/更新可以直配 key，但响应只回 ``api_key_set: bool``。
   key 原文一旦回显，等于把凭据写进前端缓存与日志。

**不测真实连通性**：``POST /test-connection`` 命中真实凭据会打外部网络（dashscope /
OpenAI 兼容端点），不确定且慢。本模块只用「查不到的 spec」验证它的 404 面，连通性结果
由域内单测验（``model_provider/tests``）。
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import pytest

from backend.e2e.support.api import API, err, ok_data

if TYPE_CHECKING:
    from httpx import AsyncClient

    from backend.e2e.support.identity import Identity

pytestmark = pytest.mark.p2

PROVIDERS = f'{API}/system/model-providers'
MakeProvider = Callable[..., Awaitable[str]]

_BASE_PAYLOAD: dict[str, Any] = {
    'display_name': 'E2E 供应商',
    'provider_type': 'openai',
    'base_url': 'http://127.0.0.1:9/v1',
    'capabilities': ['embedding', 'chat'],
    'enabled_models': [
        {'id': 'e2e-embed', 'type': 'embedding', 'dimension': 8, 'batch_size': 2},
        {'id': 'e2e-chat', 'type': 'chat'},
    ],
    'api_key_env': 'E2E_UNSET_KEY',
}


def _payload(**overrides: Any) -> dict[str, Any]:
    """默认载荷可被覆盖；``provider_id`` 每次现取（重复即 409，会让用例互相污染）。"""
    payload = {**_BASE_PAYLOAD, 'provider_id': f'e2e_{uuid4().hex[:8]}'}
    payload.update(overrides)
    return payload


async def _delete_quiet(client: AsyncClient, headers: dict[str, str], provider_id: str) -> None:
    resp = await client.delete(f'{PROVIDERS}/{provider_id}', headers=headers)
    if resp.status_code not in (200, 404):
        raise AssertionError(f'清理供应商 {provider_id} 失败：{resp.status_code} {resp.text[:200]!r}')


@pytest.fixture
async def make_provider(client: AsyncClient, identities: dict[str, Identity]) -> AsyncIterator[MakeProvider]:
    """建一行 e2e 供应商（owner 有 add 功能码），用例结束统一删除。"""
    created: list[str] = []

    async def _make(**overrides: Any) -> str:
        payload = _payload(**overrides)
        ok_data(await client.post(PROVIDERS, json=payload, headers=identities['owner'].headers))
        provider_id = str(payload['provider_id'])
        created.append(provider_id)
        return provider_id

    yield _make
    for provider_id in created:
        await _delete_quiet(client, identities['owner'].headers, provider_id)


# --------------------------------------------------------------------------- 1. 功能码门


async def test_read_faces_are_open_to_any_logged_in_user(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """读面只要求登录态：无 model-provider 菜单的角色也能列表，缺详情是 404 而非 403。"""
    headers = identities['readonly_role'].headers
    ok_data(await client.get(PROVIDERS, headers=headers))
    err(await client.get(f'{PROVIDERS}/e2e_absent_provider', headers=headers), 404)


async def test_read_faces_still_require_token(client: AsyncClient) -> None:
    err(await client.get(PROVIDERS), 401)


async def test_write_faces_require_functional_code(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """写面四个入口一条不漏：缺 ``sys:model-provider:*`` 一律 403（功能码而非资源权限）。"""
    headers = identities['readonly_role'].headers
    err(await client.post(PROVIDERS, json=_payload(), headers=headers), 403)
    err(await client.patch(f'{PROVIDERS}/e2e_absent_provider', json={'display_name': 'x'}, headers=headers), 403)
    err(await client.delete(f'{PROVIDERS}/e2e_absent_provider', headers=headers), 403)
    err(await client.post(f'{PROVIDERS}/test-connection', json={'spec': 'e2e_absent:model'}, headers=headers), 403)


# --------------------------------------------------------------------------- 2. 校验与冲突面


async def test_provider_id_pattern_is_enforced(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """``provider_id`` 必须匹配 ``^[a-z0-9][a-z0-9_-]{0,99}$``（大写/非法起始字符是 422）。"""
    headers = identities['owner'].headers
    err(await client.post(PROVIDERS, json=_payload(provider_id='E2E-Upper'), headers=headers), 422)
    err(await client.post(PROVIDERS, json=_payload(provider_id='_leading'), headers=headers), 422)


async def test_base_url_is_required(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """``base_url`` 空串是业务校验（400），不是 pydantic 校验（422）——两层面要能区分。"""
    resp = await client.post(PROVIDERS, json=_payload(base_url='  '), headers=identities['owner'].headers)
    body = err(resp, 400)
    assert 'base_url' in body['msg']


async def test_capabilities_reject_unknown_values(client: AsyncClient, identities: dict[str, Identity]) -> None:
    resp = await client.post(
        PROVIDERS, json=_payload(capabilities=['embedding', 'vision']), headers=identities['owner'].headers
    )
    body = err(resp, 400)
    assert 'vision' in body['msg']


async def test_enabled_model_must_fit_capabilities(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """模型类型不在 ``capabilities`` 内 → 400（含重复 id 的规范化校验）。"""
    headers = identities['owner'].headers
    outside = _payload(enabled_models=[{'id': 'e2e-rerank', 'type': 'rerank'}])
    err(await client.post(PROVIDERS, json=outside, headers=headers), 400)
    duplicated = _payload(
        enabled_models=[{'id': 'e2e-embed', 'type': 'embedding'}, {'id': 'e2e-embed', 'type': 'embedding'}]
    )
    err(await client.post(PROVIDERS, json=duplicated, headers=headers), 400)


async def test_duplicate_provider_id_is_conflict(
    client: AsyncClient, identities: dict[str, Identity], make_provider: MakeProvider
) -> None:
    provider_id = await make_provider()
    resp = await client.post(PROVIDERS, json=_payload(provider_id=provider_id), headers=identities['owner'].headers)
    err(resp, 409)


# --------------------------------------------------------------------------- 3. 凭据不回显与读写闭环


async def test_api_key_is_never_echoed(
    client: AsyncClient, identities: dict[str, Identity], make_provider: MakeProvider
) -> None:
    """key 只进不出：响应体只给 ``api_key_set``，原文不得出现在任何响应里。"""
    headers = identities['owner'].headers
    provider_id = await make_provider(api_key='sk-e2e-must-not-leak')

    detail = await client.get(f'{PROVIDERS}/{provider_id}', headers=headers)
    assert detail.json()['data']['api_key_set'] is True
    assert 'sk-e2e-must-not-leak' not in detail.text


async def test_api_key_set_reflects_env_fallback(
    client: AsyncClient, identities: dict[str, Identity], make_provider: MakeProvider
) -> None:
    """未配 key 且 ``api_key_env`` 未设 → ``api_key_set=false``（不假装有凭据）。"""
    provider_id = await make_provider(api_key=None)
    detail = ok_data(await client.get(f'{PROVIDERS}/{provider_id}', headers=identities['owner'].headers))
    assert detail['api_key_set'] is False
    assert detail['api_key_env'] == 'E2E_UNSET_KEY'


async def test_create_update_delete_roundtrip(
    client: AsyncClient, identities: dict[str, Identity], make_provider: MakeProvider
) -> None:
    """列表可见 → 详情可读 → PATCH 生效 → DELETE 后详情 404（不回显 key 贯穿全程）。"""
    headers = identities['owner'].headers
    provider_id = await make_provider()

    listed = ok_data(await client.get(PROVIDERS, headers=headers))
    assert provider_id in {item['provider_id'] for item in listed}

    patched = ok_data(
        await client.patch(
            f'{PROVIDERS}/{provider_id}',
            json={'display_name': 'E2E 改名', 'api_key': 'sk-e2e-patched'},
            headers=headers,
        )
    )
    assert patched['display_name'] == 'E2E 改名'
    assert patched['api_key_set'] is True
    assert 'sk-e2e-patched' not in str(patched)

    ok_data(await client.delete(f'{PROVIDERS}/{provider_id}', headers=headers))
    err(await client.get(f'{PROVIDERS}/{provider_id}', headers=headers), 404)


async def test_patch_and_delete_absent_are_404(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """有功能码但目标不存在 → 404（不是 403，也不是静默成功）。"""
    headers = identities['owner'].headers
    err(await client.patch(f'{PROVIDERS}/e2e_absent_provider', json={'display_name': 'x'}, headers=headers), 404)
    err(await client.delete(f'{PROVIDERS}/e2e_absent_provider', headers=headers), 404)


# --------------------------------------------------------------------------- 4. 连通性测试的查找面


async def test_test_connection_unknown_spec_is_404(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """未知 spec 在查表阶段就 404，**不会**去打外部网络（无凭据/无网络也不受影响）。"""
    headers = identities['owner'].headers
    err(
        await client.post(f'{PROVIDERS}/test-connection', json={'spec': 'e2e_absent_provider:model'}, headers=headers),
        404,
    )
    err(await client.post(f'{PROVIDERS}/test-connection', json={'spec': 'not-a-spec'}, headers=headers), 404)


async def test_test_connection_unknown_model_in_known_provider_is_404(
    client: AsyncClient, identities: dict[str, Identity], make_provider: MakeProvider
) -> None:
    """provider 存在但 ``enabled_models`` 里没有该 model_id → 同样 404，不下探网络。"""
    provider_id = await make_provider()
    resp = await client.post(
        f'{PROVIDERS}/test-connection',
        json={'spec': f'{provider_id}:e2e-missing-model'},
        headers=identities['owner'].headers,
    )
    err(resp, 404)
