"""文件夹树接口行为（P1）：树组装、同级重名、移动环检测、删除上浮、跨库隔离。

不需要 worker：只覆盖结构管理与权限矩阵，不涉及摄取链路。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from backend.e2e.support import seed
from backend.e2e.support.api import API, err, ok_data

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from httpx import AsyncClient

    from backend.e2e.support.identity import Identity

pytestmark = pytest.mark.p1


async def _create_folder(
    client: AsyncClient,
    headers: dict[str, str],
    kb_name: str,
    name: str,
    *,
    parent_id: str | None = None,
) -> dict[str, Any]:
    return ok_data(
        await client.post(
            f'{API}/knowledge_bases/{kb_name}/folders',
            json={'name': name, 'parent_id': parent_id},
            headers=headers,
        )
    )


async def _tree(client: AsyncClient, headers: dict[str, str], kb_name: str) -> list[dict[str, Any]]:
    return ok_data(await client.get(f'{API}/knowledge_bases/{kb_name}/folders/tree', headers=headers))


async def test_folder_tree_nests_and_counts_documents(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    kb_name = await make_kb()
    headers = identities['owner'].headers
    parent = await _create_folder(client, headers, kb_name, '父目录')
    await _create_folder(client, headers, kb_name, '子目录', parent_id=parent['folder_id'])
    doc = await seed.upload_document(client, headers, kb_name)
    await client.post(
        f'{API}/documents/{doc["document_id"]}/move',
        json={'folder_id': parent['folder_id']},
        headers=headers,
    )

    tree = await _tree(client, headers, kb_name)

    parent_node = next(node for node in tree if node['name'] == '父目录')
    assert parent_node['document_count'] == 1, '父目录应统计到刚移入的 1 篇文档'
    assert [child['name'] for child in parent_node['children']] == ['子目录']


async def test_folder_same_level_name_conflict_is_409(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    kb_name = await make_kb()
    headers = identities['owner'].headers
    await _create_folder(client, headers, kb_name, '重名')

    resp = await client.post(
        f'{API}/knowledge_bases/{kb_name}/folders',
        json={'name': '重名'},
        headers=headers,
    )

    err(resp, 409)


async def test_folder_move_into_own_descendant_is_rejected(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """环检测：A → B → C，把 A 移到 C 下必须被拒（否则树会自我吞噬）。"""
    kb_name = await make_kb()
    headers = identities['owner'].headers
    a = await _create_folder(client, headers, kb_name, '环-A')
    b = await _create_folder(client, headers, kb_name, '环-B', parent_id=a['folder_id'])
    c = await _create_folder(client, headers, kb_name, '环-C', parent_id=b['folder_id'])

    resp = await client.post(
        f'{API}/knowledge_bases/{kb_name}/folders/{a["folder_id"]}/move',
        json={'parent_id': c['folder_id']},
        headers=headers,
    )

    assert resp.status_code >= 400, '把祖先移到自身子孙下必须失败'


async def test_folder_delete_promotes_children_to_parent_not_root(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """删除文件夹时其子项**上浮到父级**（不是掉到根，也不是被级联删除）。"""
    kb_name = await make_kb()
    headers = identities['owner'].headers
    root = await _create_folder(client, headers, kb_name, 'R')
    mid = await _create_folder(client, headers, kb_name, 'A', parent_id=root['folder_id'])
    await _create_folder(client, headers, kb_name, 'B', parent_id=mid['folder_id'])

    report = ok_data(
        await client.delete(f'{API}/knowledge_bases/{kb_name}/folders/{mid["folder_id"]}', headers=headers)
    )
    assert report['promoted_folders'] == 1

    root_node = next(node for node in await _tree(client, headers, kb_name) if node['name'] == 'R')
    assert [child['name'] for child in root_node['children']] == ['B'], 'B 应在 R 下而不是根级'


async def test_folder_of_other_kb_is_invisible(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """跨库隔离：拿他库的 folder_id 当父级应 404（不泄露该 id 是否存在）。"""
    kb_a = await make_kb()
    kb_b = await make_kb()
    headers = identities['owner'].headers
    other = await _create_folder(client, headers, kb_b, '他库目录')

    resp = await client.post(
        f'{API}/knowledge_bases/{kb_a}/folders',
        json={'name': '越界', 'parent_id': other['folder_id']},
        headers=headers,
    )

    assert resp.status_code == 404


async def test_folder_write_requires_manage_permission(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """只读角色无 `rag:kb:manage`：建目录必须被拦（前端隐藏按钮不算数，后端才是边界）。"""
    kb_name = await make_kb()
    resp = await client.post(
        f'{API}/knowledge_bases/{kb_name}/folders',
        json={'name': '不该建成'},
        headers=identities['readonly_role'].headers,
    )

    assert resp.status_code in {403, 404}


async def test_folder_tree_read_denied_for_outsider(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """他人私有库：树接口与库不存在同形态 404（D50 不泄露存在性）。"""
    kb_name = await make_kb()

    resp = await client.get(
        f'{API}/knowledge_bases/{kb_name}/folders/tree',
        headers=identities['outsider'].headers,
    )

    assert resp.status_code == 404
