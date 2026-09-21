"""接口造数助手：知识库 / 文档 / ACL / 摄取轮询。

全部通过 HTTP 走真实端点造数（不用 ORM 直插业务表），目的是让「造数」本身
也走一遍被测的鉴权与校验路径。
"""

from __future__ import annotations

import asyncio
import time

from typing import TYPE_CHECKING, Any

from backend.e2e.support.api import API, ok_data
from backend.src.app.ingest.service.ingest_service import IN_PROGRESS_STATUSES

if TYPE_CHECKING:
    from httpx import AsyncClient

__all__ = [
    'INGEST_TERMINAL',
    'INGEST_TIMEOUT',
    'assert_no_state_regression',
    'create_kb',
    'delete_kb',
    'delete_kb_quiet',
    'document_status',
    'grant_kb_acl',
    'is_in_progress',
    'revoke_kb_acl',
    'trigger_ingest',
    'upload_document',
    'wait_ingest',
]

INGEST_TERMINAL = frozenset({'ready', 'parsing_failed', 'indexing_failed', 'failed'})
INGEST_TIMEOUT = 120.0
POLL_INTERVAL = 1.0

Headers = dict[str, str]


async def create_kb(client: AsyncClient, headers: Headers, kb_name: str, **overrides: Any) -> dict[str, Any]:
    """建库（建库即 Owner）。"""
    payload: dict[str, Any] = {'kb_name': kb_name, 'display_name': kb_name, **overrides}
    return ok_data(await client.post(f'{API}/knowledge_bases', json=payload, headers=headers))


async def delete_kb(client: AsyncClient, headers: Headers, kb_name: str) -> dict[str, Any]:
    """级联删除知识库（仅 Owner）。"""
    return ok_data(await client.delete(f'{API}/knowledge_bases/{kb_name}', headers=headers))


async def delete_kb_quiet(client: AsyncClient, headers: Headers, kb_name: str) -> None:
    """teardown 专用：用例可能已自行删除该 KB，重复删除不该让清理阶段炸掉。"""
    resp = await client.delete(f'{API}/knowledge_bases/{kb_name}', headers=headers)
    if resp.status_code not in (200, 404):
        raise AssertionError(f'清理知识库 {kb_name} 失败：{resp.status_code} {resp.text[:200]!r}')


async def grant_kb_acl(
    client: AsyncClient, headers: Headers, kb_name: str, entries: list[dict[str, Any]]
) -> dict[str, Any]:
    """全量替换 KB 授权条目（仅 Owner）。"""
    return ok_data(await client.put(f'{API}/knowledge_bases/{kb_name}/acl', json={'entries': entries}, headers=headers))


async def revoke_kb_acl(client: AsyncClient, headers: Headers, kb_name: str) -> dict[str, Any]:
    """清空 KB 授权条目（owner 条目会被服务端保留/重建）。"""
    return await grant_kb_acl(client, headers, kb_name, [])


async def upload_document(
    client: AsyncClient,
    headers: Headers,
    kb_name: str,
    *,
    filename: str = 'e2e-guide.md',
    content: bytes = '# E2E 指南\n\n安装步骤：先装 PostgreSQL，再装 Redis。\n',
    content_type: str = 'text/markdown',
) -> dict[str, Any]:
    """两段式第一步：存储 + 登记（不派发摄取）。"""
    return ok_data(
        await client.post(
            f'{API}/knowledge_bases/{kb_name}/documents',
            files={'file': (filename, content, content_type)},
            data={'source_type': 'file'},
            headers=headers,
        )
    )


async def trigger_ingest(client: AsyncClient, headers: Headers, kb_name: str, document_id: str) -> dict[str, Any]:
    """两段式第二步：派发摄取。"""
    return ok_data(
        await client.post(f'{API}/knowledge_bases/{kb_name}/documents/{document_id}/ingest', headers=headers)
    )


async def document_status(client: AsyncClient, headers: Headers, kb_name: str, document_id: str) -> dict[str, Any]:
    """查询摄取状态。"""
    return ok_data(await client.get(f'{API}/knowledge_bases/{kb_name}/documents/{document_id}/status', headers=headers))


async def wait_ingest(
    client: AsyncClient,
    headers: Headers,
    kb_name: str,
    document_id: str,
    *,
    timeout: float = INGEST_TIMEOUT,
    interval: float = POLL_INTERVAL,
) -> dict[str, Any]:
    """轮询到终态。

    绝不用固定 ``sleep``：摄取是 Celery 异步任务，耗时取决于解析管线。
    超时或非 ``ready`` 终态都直接失败并带出最后状态（不静默跳过，否则链路用例会假绿）。
    """
    deadline = time.monotonic() + timeout
    last: dict[str, Any] | None = None
    seen: list[str] = []
    while time.monotonic() < deadline:
        last = await document_status(client, headers, kb_name, document_id)
        status = str(last.get('status'))
        if not seen or seen[-1] != status:
            seen.append(status)
        if status in INGEST_TERMINAL:
            break
        await asyncio.sleep(interval)
    else:
        raise AssertionError(f'摄取超时（{timeout}s）：{seen}，最后响应 {last!r}')

    assert last is not None
    assert last['status'] == 'ready', (
        f'摄取未成功：status={last["status"]} err={last.get("error_message")!r} 轨迹={seen}'
    )
    assert_no_state_regression(seen)
    return last


def assert_no_state_regression(seen: list[str]) -> None:
    """终态之后不得再出现处理中状态（状态机单向）。"""
    if 'ready' not in seen:
        return
    tail = seen[seen.index('ready') + 1 :]
    assert not {'pending', 'parsing', 'indexing'} & set(tail), f'状态从 ready 回退: {seen}'


def is_in_progress(status: str) -> bool:
    """复用服务端的处理中状态定义（避免测试自造一份集合）。"""
    return status in IN_PROGRESS_STATUSES
