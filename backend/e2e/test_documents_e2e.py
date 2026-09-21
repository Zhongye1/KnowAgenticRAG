"""文档接口行为（P1）：两段式上传的关口、登记一致性、可见性、文档级 ACL 写入约束。

不需要 worker：只覆盖「存储 + 登记」与只读面。摄取链路（状态机、去重、版本）在
``test_rag_pipeline_e2e.py``（``chain``）。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from backend.e2e.support import seed
from backend.e2e.support.api import API, err, ok_data
from backend.src.core.config import settings

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from httpx import AsyncClient, Response

    from backend.e2e.support.identity import Identity

pytestmark = pytest.mark.p1

MD_NAME = 'e2e-guide.md'
MD_TEXT = '# E2E 指南\n\n安装步骤：先装 PostgreSQL，再装 Redis。\n'
MD_BYTES = MD_TEXT.encode('utf-8')
MD_TYPE = 'text/markdown'
_LIST_PARAMS = {'page': 1, 'size': 50}


def _files(**overrides: Any) -> dict[str, tuple[str, bytes, str]]:
    return {
        'file': (
            str(overrides.get('name') or MD_NAME),
            overrides.get('content') or MD_BYTES,
            str(overrides.get('content_type') or MD_TYPE),
        )
    }


async def _upload(client: AsyncClient, headers: dict[str, str], kb: str, **overrides: Any) -> Response:
    """上传（两段式第一步）：存储 + 登记 + 关口，不派发摄取。"""
    return await client.post(
        f'{API}/knowledge_bases/{kb}/documents',
        files=_files(**overrides),
        data={'source_type': 'file'},
        headers=headers,
    )


async def _list_documents(client: AsyncClient, headers: dict[str, str], kb: str) -> list[dict[str, Any]]:
    page = ok_data(await client.get(f'{API}/documents', params={**_LIST_PARAMS, 'kb_name': kb}, headers=headers))
    return list(page['items'])


async def test_upload_registers_pending_document(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """上传 = 存储 + 登记，不派发摄取：登记行可查、状态 pending、指纹与对象键落库。"""
    kb = await make_kb()
    headers = identities['owner'].headers
    data = ok_data(await _upload(client, headers, kb))
    document_id = data['document_id']

    assert data['kb_name'] == kb
    assert data['name'] == MD_NAME
    assert data['status'] == 'pending'
    assert data['source_uri'], f'对象键未落库: {data!r}'
    assert isinstance(data['sha256'], str) and len(data['sha256']) == 64

    detail = ok_data(await client.get(f'{API}/documents/{document_id}', headers=headers))
    assert detail['document_id'] == document_id
    assert detail['status'] == 'pending'
    assert detail['sha256'] == data['sha256']
    assert detail['chunk_count'] == 0
    assert detail['active_version'] >= 1

    assert document_id in [item['document_id'] for item in await _list_documents(client, headers, kb)]


async def test_upload_rejects_unsupported_extension(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """D13 格式子集：子集外扩展名 415（关口在存储前，不留半截登记）。"""
    kb = await make_kb()
    headers = identities['owner'].headers
    err(await _upload(client, headers, kb, name='e2e-payload.exe', content=b'MZ\x00\x00'), 415)
    assert await _list_documents(client, headers, kb) == [], '被拒绝的上传不应留下登记行'


async def test_upload_rejects_empty_file(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """空文件 400（``RequestError`` 业务码，不是 422 校验面）。"""
    kb = await make_kb()
    err(await _upload(client, identities['owner'].headers, kb, content=b''), 400)


async def test_upload_rejects_oversize_file(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """限额关口：超限 422 + 结构化 detail（code/reason/suggestion，前端据此提示）。

    阈值来自 settings，用例压到 8 字节（不依赖 200MB 默认值，也不受本地开关影响）。
    """
    kb = await make_kb()
    monkeypatch.setattr(settings, 'RAGF_INGEST_LIMITS_ENABLED', True)
    monkeypatch.setattr(settings, 'RAGF_INGEST_MAX_FILE_BYTES', 8)
    body = err(await _upload(client, identities['owner'].headers, kb, content=b'0123456789'), 422)
    assert body['msg']['code'] == 'file_too_large', body


async def test_replace_document_file_updates_fingerprint(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """替换文件（需 ingest 功能码 + contribute 资源级）：指纹/名称刷新，状态回 pending。"""
    kb = await make_kb()
    headers = identities['owner'].headers
    doc = ok_data(await _upload(client, headers, kb))
    replaced = ok_data(
        await client.put(
            f'{API}/documents/{doc["document_id"]}/file',
            files={'file': ('e2e-guide-v2.md', MD_BYTES + '\n\n## 附录\n'.encode(), MD_TYPE)},
            headers=headers,
        )
    )
    assert replaced['document_id'] == doc['document_id']
    assert replaced['name'] == 'e2e-guide-v2.md'
    assert replaced['sha256'] != doc['sha256']
    assert replaced['status'] == 'pending'


async def test_documents_list_is_scoped_to_visible_kbs(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """``GET /documents`` 按可见 KB 求交（功能码只有 ``rag:kb:list``，范围由服务端收窄）。"""
    kb = await make_kb()
    doc = ok_data(await seed.upload_document(client, identities['owner'].headers, kb))
    outsider = await _list_documents(client, identities['outsider'].headers, kb)
    owner = await _list_documents(client, identities['owner'].headers, kb)
    assert outsider == []
    assert doc['document_id'] in [item['document_id'] for item in owner]


async def test_document_detail_hides_denied_and_absent_identically(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """D50：文档级无权与文档不存在必须同形态（否则接口成了文档 ID 探测器）。"""
    kb = await make_kb()
    doc = ok_data(await seed.upload_document(client, identities['owner'].headers, kb))
    headers = identities['outsider'].headers
    denied = err(await client.get(f'{API}/documents/{doc["document_id"]}', headers=headers), 404)
    absent = err(await client.get(f'{API}/documents/e2e_absent_doc', headers=headers), 404)
    assert denied['msg'] == absent['msg']


async def test_chunks_requires_read_perm(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """分块浏览：功能码 ``rag:kb:read`` + 资源级 read；未摄取时是空分页而非 404。"""
    kb = await make_kb()
    doc = ok_data(await seed.upload_document(client, identities['owner'].headers, kb))
    await seed.grant_kb_acl(
        client,
        identities['owner'].headers,
        kb,
        [
            {
                'principal_type': 'user',
                'principal_id': str(identities['reader'].user_id),
                'perm': 'read',
                'effect': 'allow',
            }
        ],
    )
    path = f'{API}/documents/{doc["document_id"]}/chunks'

    page = ok_data(await client.get(path, params={'page': 1, 'size': 20}, headers=identities['reader'].headers))
    assert page['items'] == []
    assert page['total'] == 0
    assert {'page', 'size', 'total', 'total_pages'} <= set(page)
    err(await client.get(path, params={'page': 1, 'size': 20}, headers=identities['outsider'].headers), 404)


async def test_patch_and_delete_document_require_manage(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """文档写操作要资源级 manage：contribute 同形态 404；manage 改名/删除均生效。"""
    kb = await make_kb()
    owner = identities['owner'].headers
    doc = ok_data(await seed.upload_document(client, owner, kb))
    document_id = doc['document_id']
    await seed.grant_kb_acl(
        client,
        owner,
        kb,
        [
            {
                'principal_type': 'user',
                'principal_id': str(identities['contributor'].user_id),
                'perm': 'contribute',
                'effect': 'allow',
            },
            {
                'principal_type': 'user',
                'principal_id': str(identities['manager'].user_id),
                'perm': 'manage',
                'effect': 'allow',
            },
        ],
    )

    patch_body = {'name': 'x.md'}
    err(
        await client.patch(
            f'{API}/documents/{document_id}', json=patch_body, headers=identities['contributor'].headers
        ),
        404,
    )
    renamed = ok_data(
        await client.patch(
            f'{API}/documents/{document_id}',
            json={'name': 'e2e-renamed.md'},
            headers=identities['manager'].headers,
        )
    )
    assert renamed['name'] == 'e2e-renamed.md'

    counts = ok_data(await client.delete(f'{API}/documents/{document_id}', headers=identities['manager'].headers))
    assert counts['documents'] == 1
    err(await client.get(f'{API}/documents/{document_id}', headers=owner), 404)
    err(await client.delete(f'{API}/documents/{document_id}', headers=identities['manager'].headers), 404)


async def test_document_acl_write_rejects_unsupported_combinations(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """文档级 ACL 可表达性约束（Milvus 镜像）：只接受 user|dept + allow + perm=read + 无过期。

    四种越界组合各一条：role 主体、perm 非 read、deny、expires_at。
    """
    kb = await make_kb()
    owner = identities['owner'].headers
    doc = ok_data(await seed.upload_document(client, owner, kb))
    path = f'{API}/documents/{doc["document_id"]}/acl'
    outsider_id = str(identities['outsider'].user_id)
    cases = [
        {'principal_type': 'role', 'principal_id': str(identities['reader'].role_id), 'perm': 'read'},
        {'principal_type': 'user', 'principal_id': outsider_id, 'perm': 'manage'},
        {'principal_type': 'user', 'principal_id': outsider_id, 'perm': 'read', 'effect': 'deny'},
        {
            'principal_type': 'user',
            'principal_id': outsider_id,
            'perm': 'read',
            'expires_at': '2030-01-01T00:00:00+08:00',
        },
    ]
    for entry in cases:
        err(await client.put(path, json={'entries': [entry]}, headers=owner), 422)

    detail = ok_data(
        await client.put(
            path,
            json={
                'visibility': 'restricted',
                'entries': [{'principal_type': 'user', 'principal_id': outsider_id, 'perm': 'read', 'effect': 'allow'}],
            },
            headers=owner,
        )
    )
    assert detail['visibility'] == 'restricted'
    assert [entry['principal_id'] for entry in detail['entries']] == [outsider_id]


async def test_document_acl_write_requires_kb_manage(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """改文档 ACL 要 KB 级 manage（contribute 不够）：同形态 404。"""
    kb = await make_kb()
    owner = identities['owner'].headers
    doc = ok_data(await seed.upload_document(client, owner, kb))
    await seed.grant_kb_acl(
        client,
        owner,
        kb,
        [
            {
                'principal_type': 'user',
                'principal_id': str(identities['contributor'].user_id),
                'perm': 'contribute',
                'effect': 'allow',
            }
        ],
    )
    resp = await client.put(
        f'{API}/documents/{doc["document_id"]}/acl',
        json={'visibility': 'private'},
        headers=identities['contributor'].headers,
    )
    err(resp, 404)
