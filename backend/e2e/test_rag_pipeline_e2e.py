"""RAG 主链路端到端（P1 + chain）：上传 → 摄取 → 检索 → 问答 → 引用回查。

需要 Celery Worker（``task worker``）与可用模型供应商（embedding/rerank）。LLM 用
``support/fake_llm`` 替身——它只替换外部模型边界；「引用正文是否真的进了提示词」由替身
录下的 messages 断言（这才是本项目的契约，模型回什么不是）。

用例里的**独有词**（``ZQ-4711``）用于让召回可判定：它只出现在被测文档里。
"""

from __future__ import annotations

import json

from typing import TYPE_CHECKING, Any

import pytest

from backend.e2e.support import seed
from backend.e2e.support.api import API, err, ok_data, sse_events
from backend.e2e.support.fake_llm import install_fake_chat

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from httpx import AsyncClient

    from backend.e2e.support.identity import Identity

pytestmark = [pytest.mark.p1, pytest.mark.chain]

TOKEN = 'ZQ-4711'
DOC_TEXT = f'# 部署手册\n\n内部代号 {TOKEN}：安装顺序为先装 PostgreSQL，再装 Redis。\n'
FAKE_MODEL_SPEC = 'e2e:fake-chat'


async def _ingested_doc(client: AsyncClient, headers: dict[str, str], kb: str) -> tuple[str, dict[str, Any]]:
    """两段式跑通：上传 → 触发 → 轮询 ready。返回 (document_id, upload_data)。"""
    upload = await seed.upload_document(client, headers, kb, filename='e2e-deploy.md', content=DOC_TEXT.encode('utf-8'))
    document_id = str(upload['document_id'])
    queued = await seed.trigger_ingest(client, headers, kb, document_id)
    assert queued['queued'] is True
    assert queued['document_id'] == document_id
    status = await seed.wait_ingest(client, headers, kb, document_id)
    assert status['chunk_count'] >= 1, f'摄取成功但无分块: {status!r}'
    return document_id, upload


async def test_upload_ingest_search_citation_closure(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
    require_worker: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """主链路闭环：登记 → ready → 检索命中 → 引用与分块事实源逐字一致 → 进了提示词。"""
    kb = await make_kb()
    headers = identities['owner'].headers
    document_id, _upload = await _ingested_doc(client, headers, kb)

    detail = ok_data(await client.get(f'{API}/documents/{document_id}', headers=headers))
    assert detail['status'] == 'ready'
    assert detail['chunk_count'] >= 1

    # ---- 检索：文本来源命中，route/steps 可解释
    search = ok_data(
        await client.post(
            f'{API}/rag/search',
            json={'query_text': f'{TOKEN} 安装顺序', 'kb_names': [kb]},
            headers=headers,
        )
    )
    assert search['mode'] in {'vector', 'hybrid'}
    assert 'text' in search['route']['selected']
    assert search['route']['kb_names'] == [kb]
    assert [step['name'] for step in search['steps']][:3] == ['recall', 'rerank', 'hydrate']
    sources = search['sources']['text']
    assert sources, f'未召回任何文本来源: {search!r}'
    hit = next(item for item in sources if item['document_id'] == document_id)
    assert hit['kb_name'] == kb
    assert hit['chunk_id'] == f'{document_id}:{hit["version_id"]}:{hit["chunk_index"]}'

    # ---- 引用回查：分块接口取回同一段正文（D24 稳定到版本）
    chunks = ok_data(
        await client.get(
            f'{API}/documents/{document_id}/chunks',
            params={'page': 1, 'size': 200, 'version': hit['version_id']},
            headers=headers,
        )
    )
    stored = next(item for item in chunks['items'] if item['chunk_id'] == hit['chunk_id'])
    assert stored['content'] == hit['content'], '检索返回的正文必须能在 PG 事实源逐字取回'

    # ---- 问答：引用编号连续、正文与分块一致、且确实进了模型提示词
    model = install_fake_chat(monkeypatch)
    answer = ok_data(
        await client.post(
            f'{API}/knowledge_bases/{kb}/chat',
            json={'query_text': f'{TOKEN} 的安装顺序', 'model': FAKE_MODEL_SPEC},
            headers=headers,
        )
    )
    assert answer['kb_name'] == kb
    assert answer['reason'] == 'complete'
    assert answer['hit_count'] >= 1
    assert answer['model_spec'] == FAKE_MODEL_SPEC
    assert [item['n'] for item in answer['citations']] == list(range(1, len(answer['citations']) + 1))
    cited = next(item for item in answer['citations'] if item['chunk_id'] == hit['chunk_id'])
    assert cited['document_id'] == document_id
    assert cited['content'] == hit['content']

    prompt = model.prompt_text
    assert '【片段1】' in prompt, '引用上下文未进入提示词'
    assert cited['content'] in prompt, '引用正文未进入提示词（引用闭环断了）'


async def test_stream_deltas_equal_sync_answer(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
    require_worker: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """同源断言：SSE ``delta`` 拼接 == ``done.answer`` == 非流式 ``/chat`` 的 ``answer``。"""
    kb = await make_kb()
    headers = identities['owner'].headers
    await _ingested_doc(client, headers, kb)
    install_fake_chat(monkeypatch)
    payload = {'query_text': f'{TOKEN} 安装顺序', 'model': FAKE_MODEL_SPEC}

    sync = ok_data(await client.post(f'{API}/knowledge_bases/{kb}/chat', json=payload, headers=headers))

    resp = await client.post(f'{API}/knowledge_bases/{kb}/chat/stream', json=payload, headers=headers)
    assert resp.status_code == 200
    assert resp.headers['content-type'].startswith('text/event-stream')
    events = sse_events(resp.text)
    deltas = [json.loads(data)['content'] for name, data in events if name == 'delta']
    done = json.loads(next(data for name, data in events if name == 'done'))
    assert ''.join(deltas) == done['answer'] == sync['answer']


async def test_rebuild_reports_counts_and_keeps_ready(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
    require_worker: None,
) -> None:
    """``rebuild`` 受理口径：``dispatched + skipped == total``，重摄取后仍 ready 且有分块。

    ``active_version`` 是 Phase 2 占位（当前实现不递增），这里只锁「不丢内容」，
    不锁版本号——见 spec §8。
    """
    kb = await make_kb()
    headers = identities['owner'].headers
    document_id, _upload = await _ingested_doc(client, headers, kb)
    before = ok_data(await client.get(f'{API}/documents/{document_id}', headers=headers))

    rebuilt = ok_data(await client.post(f'{API}/knowledge_bases/{kb}/rebuild', headers=headers))
    assert rebuilt['total'] == 1
    assert rebuilt['dispatched'] + rebuilt['skipped'] == rebuilt['total']
    assert rebuilt['dispatched'] == 1

    status = await seed.wait_ingest(client, headers, kb, document_id)
    assert status['status'] == 'ready'
    after = ok_data(await client.get(f'{API}/documents/{document_id}', headers=headers))
    assert after['chunk_count'] >= 1
    assert after['sha256'] == before['sha256']


async def test_duplicate_content_is_409_after_successful_ingest(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
    require_worker: None,
) -> None:
    """去重：同内容（同 sha256）二次上传 409——指纹在**摄取成功后**登记（D9）。"""
    kb = await make_kb()
    headers = identities['owner'].headers
    document_id, _upload = await _ingested_doc(client, headers, kb)

    second = await client.post(
        f'{API}/knowledge_bases/{kb}/documents',
        files={'file': ('e2e-deploy-copy.md', DOC_TEXT.encode('utf-8'), 'text/markdown')},
        data={'source_type': 'file'},
        headers=headers,
    )
    body = err(second, 409)
    assert '已存在' in str(body['msg']), body

    other = await seed.upload_document(client, headers, kb, filename='e2e-other.md', content='# 另一份\n'.encode())
    assert other['document_id'] != document_id


async def test_document_acl_narrows_recall_inside_shared_kb(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
    require_worker: None,
) -> None:
    """KB 授权 ≠ 文档可见（D47 只收窄）：跨部门读者进得来，召回里只有被授权的文档。

    两层都在**召回内**下推，失败形态不同：KB 层过不了是 403，文档层过不了是
    **静默过滤**（200 + 无命中）——所以断言必须落在命中集合上，只看状态码会漏。
    文档 ACL 变更按主键 upsert 标量字段传播，不改向量也不重摄取，因此授权前后
    命中的是同一条 ``chunk_id``。
    """
    kb = await make_kb()
    owner = identities['owner'].headers
    reader = identities['reader']  # dept 9102，与上传者部门(9101)不同：排除部门隐式可见
    document_id, _upload = await _ingested_doc(client, owner, kb)

    # KB 层：显式授予 read（证明这一层通了，后面看到空结果不是「进不来」）
    await seed.grant_kb_acl(
        client,
        owner,
        kb,
        [
            {
                'principal_type': 'user',
                'principal_id': str(reader.user_id),
                'perm': 'read',
                'effect': 'allow',
            }
        ],
    )
    assert ok_data(await client.get(f'{API}/knowledge_bases/{kb}', headers=reader.headers))['kb_name'] == kb

    query = {'query_text': f'{TOKEN} 安装顺序', 'kb_names': [kb]}
    denied = ok_data(await client.post(f'{API}/rag/search', json=query, headers=reader.headers))
    assert denied['sources']['text'] == [], f'文档级 ACL 未在召回内过滤: {denied!r}'

    # 文档层：显式授予 read（entries 全量替换 → 镜像 groups 只剩该主体）
    detail = await seed.grant_doc_acl(
        client,
        owner,
        document_id,
        entries=[
            {
                'principal_type': 'user',
                'principal_id': str(reader.user_id),
                'perm': 'read',
                'effect': 'allow',
            }
        ],
    )
    assert [entry['principal_id'] for entry in detail['entries']] == [str(reader.user_id)]

    allowed = ok_data(await client.post(f'{API}/rag/search', json=query, headers=reader.headers))
    hit = next(item for item in allowed['sources']['text'] if item['document_id'] == document_id)
    assert hit['kb_name'] == kb
