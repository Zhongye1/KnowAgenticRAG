"""知识库元数据与自检接口行为（P1）：示例问题、知识导图、统计对账、整库导出。

不需要 worker：
- 示例问题/导图/对账都是同步路径；
- 导出只断言「发起即 pending 且可查到」，不依赖转换完成（那需要 worker）。
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


# ---------------- 示例问题 ----------------


async def test_sample_questions_round_trip_with_cleaning(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """写入时清洗：去空、去重、截断超长；读回即清洗后的结果。"""
    kb_name = await make_kb()
    headers = identities['owner'].headers

    saved = ok_data(
        await client.put(
            f'{API}/knowledge_bases/{kb_name}/sample-questions',
            json={'questions': ['  怎么安装？  ', '', '怎么安装？', 'x' * 500, '怎么部署？']},
            headers=headers,
        )
    )

    assert saved[0] == '怎么安装？'
    assert len(saved) == 3, f'应去空去重后剩 3 条，实际 {saved!r}'
    assert len(saved[1]) == 200, '超长条目应被截断到 200 字'

    reread = ok_data(await client.get(f'{API}/knowledge_bases/{kb_name}/sample-questions', headers=headers))
    assert reread == saved


async def test_sample_questions_write_requires_manage_permission(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    kb_name = await make_kb()

    resp = await client.put(
        f'{API}/knowledge_bases/{kb_name}/sample-questions',
        json={'questions': ['不该写进去']},
        headers=identities['readonly_role'].headers,
    )

    assert resp.status_code in {403, 404}


# ---------------- 知识导图 ----------------


async def test_mindmap_returns_forest_with_one_root_per_document(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """未摄取文档的 `structure` 为空 → 该文档只有根节点，整体退化为平铺文档列表。"""
    kb_name = await make_kb()
    headers = identities['owner'].headers
    await seed.upload_document(client, headers, kb_name, filename='a.md', content=b'# a\n')
    await seed.upload_document(client, headers, kb_name, filename='b.md', content=b'# b\n')

    data = ok_data(await client.get(f'{API}/knowledge_bases/{kb_name}/mindmap', headers=headers))

    assert data['documents'] == 2
    assert data['with_structure'] == 0
    names = sorted(node['title'] for node in data['nodes'])
    assert names == ['a.md', 'b.md']
    assert all(node['children'] == [] for node in data['nodes'])


async def test_mindmap_on_empty_kb_is_valid_not_error(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    kb_name = await make_kb()

    data = ok_data(
        await client.get(f'{API}/knowledge_bases/{kb_name}/mindmap', headers=identities['owner'].headers)
    )

    assert data['documents'] == 0
    assert data['nodes'] == []


# ---------------- 统计对账 ----------------


async def test_stats_repair_reports_structure_and_is_idempotent(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """对账是同步路径；首次与再次调用都应稳定（无漂移时 chunk_count_fixed 为 0）。"""
    kb_name = await make_kb()
    headers = identities['owner'].headers
    await seed.upload_document(client, headers, kb_name)

    first = ok_data(await client.post(f'{API}/knowledge_bases/{kb_name}/stats/repair', headers=headers))
    second = ok_data(await client.post(f'{API}/knowledge_bases/{kb_name}/stats/repair', headers=headers))

    for report in (first, second):
        assert report['kb_name'] == kb_name
        assert report['chunk_count_fixed'] == 0, '未摄取文档不参与对账，不该有修复'
        assert isinstance(report['vector_drift'], list)


async def test_stats_repair_requires_manage_permission(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    kb_name = await make_kb()

    resp = await client.post(
        f'{API}/knowledge_bases/{kb_name}/stats/repair',
        headers=identities['readonly_role'].headers,
    )

    assert resp.status_code in {403, 404}


# ---------------- 整库导出 ----------------


async def test_export_create_returns_pending_and_is_queryable(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """发起 → 拿到 export_id → 可查到状态。

    不断言终态：打包由 Celery worker 完成，本套件不需要 worker（链路用例在 chain 组）。
    """
    kb_name = await make_kb()
    headers = identities['owner'].headers
    await seed.upload_document(client, headers, kb_name)

    created = ok_data(await client.post(f'{API}/knowledge_bases/{kb_name}/export', headers=headers))
    assert created['status'] == 'pending'

    status: dict[str, Any] = ok_data(
        await client.get(f'{API}/knowledge_bases/{kb_name}/exports/{created["export_id"]}', headers=headers)
    )
    assert status['export_id'] == created['export_id']
    assert status['status'] in {'pending', 'running', 'success', 'failed'}
    # 未成功前不得下发下载地址（否则前端会拿到一个空 url 去下载）
    if status['status'] != 'success':
        assert status['url'] is None


async def test_export_history_lists_created_task(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    kb_name = await make_kb()
    headers = identities['owner'].headers
    created = ok_data(await client.post(f'{API}/knowledge_bases/{kb_name}/export', headers=headers))

    history = ok_data(await client.get(f'{API}/knowledge_bases/{kb_name}/exports', headers=headers))

    assert created['export_id'] in {item['export_id'] for item in history}


async def test_export_of_other_kb_task_is_404(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """导出任务必须按 kb 归属校验：拿 A 库的 export_id 去 B 库查应 404。"""
    kb_a = await make_kb()
    kb_b = await make_kb()
    headers = identities['owner'].headers
    created = ok_data(await client.post(f'{API}/knowledge_bases/{kb_a}/export', headers=headers))

    resp = await client.get(
        f'{API}/knowledge_bases/{kb_b}/exports/{created["export_id"]}', headers=headers
    )

    err(resp, 404)


async def test_export_denied_for_outsider(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    kb_name = await make_kb()

    resp = await client.post(
        f'{API}/knowledge_bases/{kb_name}/export',
        headers=identities['outsider'].headers,
    )

    assert resp.status_code == 404
