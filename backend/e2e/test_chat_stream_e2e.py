"""SSE 流式协议（P1；有内容的用例标 chain）：事件顺序、空结果短路、错误事件、同源。

协议契约（D25）：``step* → meta → citation → delta+ → usage → done``；语义/上游错误走
``error`` 事件（HTTP 仍是 200）；未授权在流开始前就是 HTTP 404。

有命中的用例需要真实摄取（``chain``）+ LLM 替身；空结果与未授权两条不需要。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from backend.e2e.support import seed
from backend.e2e.support.api import API, err, sse_events, sse_json
from backend.e2e.support.fake_llm import install_fake_chat
from backend.src.app.chat.service.prompts import EMPTY_RESULT_MESSAGE
from backend.src.core.config import settings

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from httpx import AsyncClient

    from backend.e2e.support.identity import Identity

pytestmark = pytest.mark.p1

SSE_HEADERS = {'Accept': 'text/event-stream'}
FAKE_MODEL_SPEC = 'e2e:fake-chat'
TOKEN = 'ZQ-4711'


def _assert_event_protocol(names: list[str], *, expect_delta: bool) -> None:
    """事件顺序契约：step* 打头 → meta → citation → delta* → usage → done。"""
    assert 'error' not in names, f'出现 error 事件: {names}'
    first = next((i for i, name in enumerate(names) if name != 'step'), None)
    assert first is not None and first >= 1, f'step 事件必须在最前: {names}'
    rest = names[first:]
    assert rest[:2] == ['meta', 'citation'], f'meta/citation 顺序异常: {rest}'
    assert rest[-2:] == ['usage', 'done'], f'usage/done 收尾异常: {rest}'
    middle = rest[2:-2]
    if expect_delta:
        assert middle and set(middle) == {'delta'}, f'delta 段异常: {rest}'
    else:
        assert set(middle) <= {'delta'}, f'未知事件: {rest}'


async def test_stream_without_permission_is_http_404(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """未授权 KB：在流开始前判定 → HTTP 404 信封（不是 error 事件，也不是 200）。"""
    kb = await make_kb()
    resp = await client.post(
        f'{API}/knowledge_bases/{kb}/chat/stream',
        json={'query_text': 'x'},
        headers={**identities['outsider'].headers, **SSE_HEADERS},
    )
    err(resp, 404)
    assert 'text/event-stream' not in resp.headers.get('content-type', '')


async def test_stream_validates_body_before_streaming(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """SSE 端点同样走 fba 请求校验面：多余字段 422（不进入流，客户端不会拿到半截帧）。"""
    kb = await make_kb()
    resp = await client.post(
        f'{API}/knowledge_bases/{kb}/chat/stream',
        json={'query_text': 'x', 'bogus': 1},
        headers={**identities['owner'].headers, **SSE_HEADERS},
    )
    err(resp, 422)


async def test_stream_empty_result_contract(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """无命中短路：hit_count=0、无引用、delta 是约定文案、reason=empty_result（不调用模型）。

    空库不触发检索，因此不依赖 Celery Worker（也不需要 Knowhere key）——这是本模块里
    唯一能在无语义解析环境下跑的 SSE 用例。
    """
    kb = await make_kb()
    resp = await client.post(
        f'{API}/knowledge_bases/{kb}/chat/stream',
        json={'query_text': f'{TOKEN} 有收录吗', 'model': FAKE_MODEL_SPEC},
        headers={**identities['owner'].headers, **SSE_HEADERS},
    )
    assert resp.status_code == 200
    assert resp.headers['content-type'].startswith('text/event-stream')

    events = sse_events(resp.text)
    _assert_event_protocol([name for name, _ in events], expect_delta=True)
    payloads = dict(sse_json(resp.text))
    assert payloads['meta']['hit_count'] == 0
    assert payloads['citation'] == {'citations': [], 'images': []}
    assert payloads['done']['reason'] == 'empty_result'
    assert payloads['done']['answer'] == EMPTY_RESULT_MESSAGE
    assert payloads['usage']['total_tokens'] == 0
    deltas = [data['content'] for name, data in sse_json(resp.text) if name == 'delta']
    assert deltas == [EMPTY_RESULT_MESSAGE]


@pytest.mark.chain
async def test_stream_protocol_with_hits(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
    require_worker: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """有命中：meta/citation 就绪后逐帧 delta，done 自包含（answer/route/steps/usage）。"""
    kb = await make_kb()
    headers = identities['owner'].headers
    upload = await seed.upload_document(
        client, headers, kb, filename='e2e-deploy.md', content=f'# 部署手册\n\n代号 {TOKEN}。\n'.encode()
    )
    await seed.trigger_ingest(client, headers, kb, upload['document_id'])
    await seed.wait_ingest(client, headers, kb, upload['document_id'])
    model = install_fake_chat(monkeypatch)

    resp = await client.post(
        f'{API}/knowledge_bases/{kb}/chat/stream',
        json={'query_text': f'{TOKEN} 是什么', 'model': FAKE_MODEL_SPEC},
        headers={**headers, **SSE_HEADERS},
    )
    assert resp.status_code == 200
    assert resp.headers['content-type'].startswith('text/event-stream')

    parsed = sse_json(resp.text)
    _assert_event_protocol([name for name, _ in parsed], expect_delta=True)
    payloads = dict(parsed)
    assert payloads['meta']['hit_count'] >= 1
    assert payloads['meta']['model_spec'] == FAKE_MODEL_SPEC
    assert payloads['citation']['citations'], '有命中却没有引用条目'
    assert payloads['done']['reason'] == 'complete'
    assert payloads['done']['route']['kb_names'] == [kb]
    assert [step['name'] for step in payloads['done']['steps']][:3] == ['recall', 'rerank', 'hydrate']
    assert model.messages, '模型未被调用'
    assert '【片段1】' in model.prompt_text


@pytest.mark.chain
async def test_stream_reports_model_error_as_event(
    client: AsyncClient,
    identities: dict[str, Identity],
    make_kb: Callable[..., Awaitable[str]],
    require_worker: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """未配置 chat 模型：有命中 → ``error`` 事件（HTTP 仍 200），客户端不必解析两套错误面。"""
    kb = await make_kb()
    headers = identities['owner'].headers
    upload = await seed.upload_document(
        client, headers, kb, filename='e2e-deploy.md', content=f'# 部署手册\n\n代号 {TOKEN}。\n'.encode()
    )
    await seed.trigger_ingest(client, headers, kb, upload['document_id'])
    await seed.wait_ingest(client, headers, kb, upload['document_id'])

    monkeypatch.setattr(settings, 'RAGF_CHAT_MODEL_SPEC', '')
    resp = await client.post(
        f'{API}/knowledge_bases/{kb}/chat/stream',
        json={'query_text': f'{TOKEN} 是什么'},
        headers={**headers, **SSE_HEADERS},
    )
    assert resp.status_code == 200
    events = sse_json(resp.text)
    errors = [data for name, data in events if name == 'error']
    assert len(errors) == 1, f'期望恰好一个 error 事件: {events}'
    assert errors[0]['code'] == 'MODEL_NOT_CONFIGURED'
    assert errors[0]['trace_id']
