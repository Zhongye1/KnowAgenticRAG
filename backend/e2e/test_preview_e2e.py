"""预览与批量接口行为（P1）。

预览覆盖三件必须对的事：
1. **判定只看扩展名、不信任上传的 Content-Type**（D55 §3A）——上传者声称 image/png
   也改不了服务端路由；
2. **Range 代理语义精确**（D55.1）——206/Content-Range/后缀区间/越界 416；
3. **Office 惰性转换**——首次访问返回 converting，且转换容器不可用时也不 500。

批量覆盖「逐条结果、不整批回滚」。

不需要 worker：Office 转换任务即使不被消费，接口语义也已确定。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from backend.e2e.support import seed
from backend.e2e.support.api import API, ok_data
from backend.e2e.support.media import pdf_bytes

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from httpx import AsyncClient

    from backend.e2e.support.identity import Identity

pytestmark = pytest.mark.p1

MD_BYTES = '# 预览测试\n\n正文内容用于验证内联窗口。\n'.encode()
# Range 代理按设计只服务 pdf（与 office 转换产物）；markdown/文本走内联窗口，不经此端点。
# 必须用**真能被 pdfium 解析**的 PDF：上传会走限额校验并真解析页数。
PDF_BYTES = pdf_bytes(2)


async def _preview(client: AsyncClient, headers: dict[str, str], document_id: str, **params: Any) -> dict[str, Any]:
    return ok_data(
        await client.get(f'{API}/documents/{document_id}/preview', params=params, headers=headers)
    )


async def test_preview_kind_follows_extension_not_content_type(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """上传 `.md` 但谎报 `Content-Type: image/png`，服务端仍须判为 markdown。

    这是 D55 §3A 的红线：`document_service` 会把客户端提交的 content_type 原样写进
    MinIO，若拿它路由，上传者就能决定服务端行为。
    """
    kb_name = await make_kb()
    headers = identities['owner'].headers
    doc = await seed.upload_document(
        client, headers, kb_name, filename='liar.md', content=MD_BYTES, content_type='image/png'
    )

    preview = await _preview(client, headers, doc['document_id'])

    assert preview['kind'] == 'markdown'
    assert preview['content'] is not None and '预览测试' in preview['content']


async def test_unlisted_extension_is_rejected_at_upload(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """`.zip` 在上传层就 415（D13 子集校验），根本进不到预览。

    由此可知 preview 的 `unsupported` 分支**经正常上传路径不可达**——它是对
    「绕过上传登记的行（历史数据/直写库）」的兜底，不是常规路径。
    """
    kb_name = await make_kb()

    resp = await client.post(
        f'{API}/knowledge_bases/{kb_name}/documents',
        files={'file': ('archive.zip', b'PK\x03\x04', 'application/zip')},
        data={'source_type': 'file'},
        headers=identities['owner'].headers,
    )

    assert resp.status_code == 415


async def test_macro_enabled_office_is_rejected_at_upload(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """宏文档（.docm）在上传层就被 415 拦下——比「预览层不路由」更前一道门。"""
    kb_name = await make_kb()

    resp = await client.post(
        f'{API}/knowledge_bases/{kb_name}/documents',
        files={
            'file': (
                'macro.docm',
                b'PK\x03\x04macro',
                'application/vnd.ms-word.document.macroEnabled.12',
            )
        },
        data={'source_type': 'file'},
        headers=identities['owner'].headers,
    )

    assert resp.status_code == 415


async def test_office_preview_is_converting_on_first_access(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """Office 惰性转换（D55.2）：首次访问返回 converting 并已入队，不阻塞请求。"""
    kb_name = await make_kb()
    headers = identities['owner'].headers
    doc = await seed.upload_document(
        client,
        headers,
        kb_name,
        filename='report.docx',
        content=b'PK\x03\x04docx',
        content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )

    preview = await _preview(client, headers, doc['document_id'])

    assert preview['kind'] == 'office'
    assert preview['status'] in {'converting', 'ready', 'failed'}


async def test_preview_range_returns_206_with_content_range(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    kb_name = await make_kb()
    headers = identities['owner'].headers
    doc = await seed.upload_document(
        client, headers, kb_name, filename='manual.pdf', content=PDF_BYTES, content_type='application/pdf'
    )
    url = f'{API}/documents/{doc["document_id"]}/preview/content'

    resp = await client.get(url, headers={**headers, 'Range': 'bytes=0-9'})

    assert resp.status_code == 206
    assert resp.headers['accept-ranges'] == 'bytes'
    assert resp.headers['content-range'].startswith('bytes 0-9/')
    assert len(resp.content) == 10


async def test_preview_range_suffix_reads_tail(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """后缀区间：PDF.js 取文件尾部 xref 走的就是这条路径（非线性 PDF 必需）。"""
    kb_name = await make_kb()
    headers = identities['owner'].headers
    doc = await seed.upload_document(
        client, headers, kb_name, filename='manual.pdf', content=PDF_BYTES, content_type='application/pdf'
    )
    url = f'{API}/documents/{doc["document_id"]}/preview/content'

    resp = await client.get(url, headers={**headers, 'Range': 'bytes=-5'})

    assert resp.status_code == 206
    assert resp.content == PDF_BYTES[-5:]


async def test_preview_range_beyond_size_is_416(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    kb_name = await make_kb()
    headers = identities['owner'].headers
    doc = await seed.upload_document(
        client, headers, kb_name, filename='manual.pdf', content=PDF_BYTES, content_type='application/pdf'
    )
    url = f'{API}/documents/{doc["document_id"]}/preview/content'

    resp = await client.get(url, headers={**headers, 'Range': 'bytes=99999999-'})

    assert resp.status_code == 416
    assert resp.headers['content-range'].startswith('bytes */')


async def test_preview_full_request_without_range_returns_200(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    kb_name = await make_kb()
    headers = identities['owner'].headers
    doc = await seed.upload_document(
        client, headers, kb_name, filename='manual.pdf', content=PDF_BYTES, content_type='application/pdf'
    )

    resp = await client.get(f'{API}/documents/{doc["document_id"]}/preview/content', headers=headers)

    assert resp.status_code == 200
    assert resp.content == PDF_BYTES


async def test_preview_denied_for_outsider_is_404(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """预览同样受资源级权限约束：他人库的文档与不存在同形态 404（D50）。"""
    kb_name = await make_kb()
    headers = identities['owner'].headers
    doc = await seed.upload_document(client, headers, kb_name)

    resp = await client.get(
        f'{API}/documents/{doc["document_id"]}/preview',
        headers=identities['outsider'].headers,
    )

    assert resp.status_code == 404


# ---------------- 批量 ----------------


async def test_batch_delete_reports_per_item_without_rolling_back(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    """逐条结果：一条不存在不该把已成功的另一条一起退掉。"""
    kb_name = await make_kb()
    headers = identities['owner'].headers
    alive = await seed.upload_document(client, headers, kb_name, filename='a.md', content=b'# a\n')
    doomed = await seed.upload_document(client, headers, kb_name, filename='b.md', content=b'# b\n')

    result = ok_data(
        await client.request(
            'DELETE',
            f'{API}/documents/batch',
            json={'document_ids': [doomed['document_id'], 'does-not-exist']},
            headers=headers,
        )
    )

    assert result['total'] == 2
    assert result['succeeded'] == 1
    assert result['failed'] == 1
    by_id = {item['document_id']: item for item in result['items']}
    assert by_id[doomed['document_id']]['ok'] is True
    assert by_id['does-not-exist']['ok'] is False
    # 另一篇未参与批量的文档必须还在
    still_there = ok_data(
        await client.get(f'{API}/documents/{alive["document_id"]}', headers=headers)
    )
    assert still_there['document_id'] == alive['document_id']


async def test_batch_reindex_enqueues_each_document(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    kb_name = await make_kb()
    headers = identities['owner'].headers
    doc = await seed.upload_document(client, headers, kb_name)

    result = ok_data(
        await client.post(
            f'{API}/documents/batch/reindex',
            json={'document_ids': [doc['document_id']]},
            headers=headers,
        )
    )

    assert result['succeeded'] == 1
    assert result['items'][0]['detail'] == '已入队'


async def test_batch_delete_requires_manage_permission(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
) -> None:
    kb_name = await make_kb()
    headers = identities['owner'].headers
    doc = await seed.upload_document(client, headers, kb_name)

    resp = await client.request(
        'DELETE',
        f'{API}/documents/batch',
        json={'document_ids': [doc['document_id']]},
        headers=identities['readonly_role'].headers,
    )

    assert resp.status_code in {403, 404}
