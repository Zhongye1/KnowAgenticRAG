"""chat 门面事件序列测试（M9：无命中短路、带引用流式、错误事件走约定路径）。"""

from __future__ import annotations

import asyncio

from typing import TYPE_CHECKING, Any

import pytest

from backend.src.app.chat.schema.chat import ChatMessage, ChatParam
from backend.src.app.chat.service.chat_service import ChatService
from backend.src.app.chat.service.prompts import EMPTY_RESULT_MESSAGE
from backend.src.app.model_provider.providers.chat import ChatStreamEvent
from backend.src.common.exception import errors
from backend.src.core.config import settings

if TYPE_CHECKING:
    from collections.abc import AsyncIterator


def _hit(n: int) -> dict[str, Any]:
    return {
        'chunk_id': f'doc-{n}:2:0',
        'document_id': f'doc-{n}',
        'kb_name': 'dev',
        'version_id': 2,
        'chunk_index': 0,
        'content': f'分块内容{n}',
        'metadata': {'source': 'guide.md', 'score': 0.9 - n * 0.1, 'rerank_score': 0.95},
    }


def _search_output(results: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        'kb_name': 'dev',
        'mode': 'hybrid',
        'recall_count': len(results),
        'reranked': True,
        'degraded': False,
        'duration_ms': 5,
        'results': results,
    }


class FakeRetrieval:
    """检索替身：按配置返回命中或抛语义错误。"""

    def __init__(self, *, output: dict[str, Any] | None = None, exc: Exception | None = None) -> None:
        self.output = output or _search_output([])
        self.exc = exc
        self.calls: list[dict[str, Any]] = []

    async def search(
        self,
        db: Any,
        *,
        kb_name: str,
        query_text: str,
        param: Any = None,
        plugin_namespace: str | None = None,
    ) -> dict[str, Any]:
        self.calls.append({'kb_name': kb_name, 'query_text': query_text, 'param': param, 'ns': plugin_namespace})
        if self.exc is not None:
            raise self.exc
        return self.output


class FakeChatModel:
    """chat 模型替身：按配置产出流式事件或抛上游错误。"""

    def __init__(self, *, exc: Exception | None = None) -> None:
        self.exc = exc
        self.kwargs: dict[str, Any] = {}

    async def achat_stream(self, messages: list[dict[str, Any]], **kwargs: Any) -> AsyncIterator[ChatStreamEvent]:
        self.kwargs = {'messages': messages, **kwargs}
        if self.exc is not None:
            raise self.exc
        yield ChatStreamEvent(content='版本')
        yield ChatStreamEvent(content='差异如下')
        yield ChatStreamEvent(finish_reason='stop')
        yield ChatStreamEvent(usage={'prompt_tokens': 10, 'completion_tokens': 4, 'total_tokens': 14})


class FakeGateway:
    """模型解析替身：记录 spec 并返回 FakeChatModel。"""

    def __init__(self, *, model: FakeChatModel | None = None, exc: Exception | None = None) -> None:
        self.model = model or FakeChatModel()
        self.exc = exc
        self.specs: list[str] = []

    async def get(self, db: Any, spec: str) -> FakeChatModel:
        self.specs.append(spec)
        if self.exc is not None:
            raise self.exc
        return self.model


async def _collect(service: ChatService, **param_overrides: Any) -> list[tuple[str, dict[str, Any]]]:
    param = ChatParam(query_text='版本差异是什么', **param_overrides)
    return [item async for item in service.astream(None, kb_name='dev', param=param)]  # type: ignore[arg-type]


def _run(service: ChatService, **param_overrides: Any) -> list[tuple[str, dict[str, Any]]]:
    return asyncio.run(_collect(service, **param_overrides))


def test_empty_result_short_circuit_without_model(monkeypatch: pytest.MonkeyPatch) -> None:
    """无命中：meta(hit=0) → citation([]) → 明确文案 → usage(0) → done(empty_result)，不调模型。"""
    monkeypatch.setattr(settings, 'RAGF_CHAT_MODEL_SPEC', '')
    retrieval = FakeRetrieval()
    gateway = FakeGateway()
    service = ChatService(retrieval=retrieval, chat_gateway=gateway)

    events = _run(service)

    assert events[0] == ('meta', {'kb_name': 'dev', 'mode': 'hybrid', 'model_spec': '', 'hit_count': 0})
    assert events[1] == ('citation', {'citations': []})
    assert events[2] == ('delta', {'content': EMPTY_RESULT_MESSAGE})
    assert events[3] == ('usage', {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0})
    assert events[4] == ('done', {'reason': 'empty_result'})
    assert gateway.specs == []


def test_hit_streams_with_citations_and_usage() -> None:
    """有命中：meta/citation → delta 逐帧 → usage → done(complete)；模型 spec/温度正确下发。"""
    retrieval = FakeRetrieval(output=_search_output([_hit(1), _hit(2)]))
    model = FakeChatModel()
    gateway = FakeGateway(model=model)
    service = ChatService(retrieval=retrieval, chat_gateway=gateway)

    events = _run(service, model='acme:qwen-max', temperature=0.7)

    names = [event for event, _data in events]
    assert names == ['meta', 'citation', 'delta', 'delta', 'usage', 'done']
    meta = events[0][1]
    assert meta['hit_count'] == 2
    assert meta['model_spec'] == 'acme:qwen-max'
    assert meta['mode'] == 'hybrid'
    citations = events[1][1]['citations']
    assert [item['n'] for item in citations] == [1, 2]
    assert citations[0]['chunk_id'] == 'doc-1:2:0'
    assert citations[0]['source'] == 'guide.md'
    assert ''.join(data['content'] for event, data in events if event == 'delta') == '版本差异如下'
    assert events[-2] == ('usage', {'prompt_tokens': 10, 'completion_tokens': 4, 'total_tokens': 14})
    assert events[-1] == ('done', {'reason': 'complete'})
    assert gateway.specs == ['acme:qwen-max']
    assert model.kwargs['temperature'] == pytest.approx(0.7)
    assert model.kwargs['messages'][0]['role'] == 'system'
    assert model.kwargs['messages'][-1] == {'role': 'user', 'content': '版本差异是什么'}


def test_model_not_configured_error_event(monkeypatch: pytest.MonkeyPatch) -> None:
    """有命中但未配置模型：error 事件 MODEL_NOT_CONFIGURED，无 meta/citation 泄漏。"""
    monkeypatch.setattr(settings, 'RAGF_CHAT_MODEL_SPEC', '')
    retrieval = FakeRetrieval(output=_search_output([_hit(1)]))
    service = ChatService(retrieval=retrieval, chat_gateway=FakeGateway())

    events = _run(service)

    assert len(events) == 1
    event, data = events[0]
    assert event == 'error'
    assert data['code'] == 'MODEL_NOT_CONFIGURED'
    assert 'trace_id' in data


def test_kb_not_found_error_event() -> None:
    retrieval = FakeRetrieval(exc=errors.NotFoundError(msg='知识库不存在: nope'))
    service = ChatService(retrieval=retrieval, chat_gateway=FakeGateway())

    events = _run(service)

    assert events == [('error', {'code': 'KB_NOT_FOUND', 'msg': '知识库不存在: nope', 'trace_id': '-'})]


def test_request_error_event() -> None:
    retrieval = FakeRetrieval(exc=errors.RequestError(msg='文件名过滤命中过多文档'))
    service = ChatService(retrieval=retrieval, chat_gateway=FakeGateway())

    events = _run(service)

    assert events[0][0] == 'error'
    assert events[0][1]['code'] == 'INVALID_REQUEST'


def test_upstream_stream_error_event() -> None:
    """上游流中断：已发 delta 后补发 error(STREAM_ERROR)，不再产出 usage/done。"""
    retrieval = FakeRetrieval(output=_search_output([_hit(1)]))
    gateway = FakeGateway(model=FakeChatModel(exc=RuntimeError('upstream boom')))
    service = ChatService(retrieval=retrieval, chat_gateway=gateway)

    events = _run(service, model='acme:qwen-max')

    names = [event for event, _data in events]
    assert names == ['meta', 'citation', 'error']
    assert events[-1][1]['code'] == 'STREAM_ERROR'


def test_history_and_max_tokens_passed_through() -> None:
    retrieval = FakeRetrieval(output=_search_output([_hit(1)]))
    model = FakeChatModel()
    service = ChatService(retrieval=retrieval, chat_gateway=FakeGateway(model=model))

    _run(
        service,
        model='acme:qwen-max',
        max_tokens=64,
        history=[ChatMessage(role='user', content='上一问'), ChatMessage(role='assistant', content='上一答')],
    )

    assert model.kwargs['max_tokens'] == 64
    history_roles = [item['role'] for item in model.kwargs['messages'][1:-1]]
    assert history_roles == ['user', 'assistant']


def test_default_temperature_from_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'RAGF_CHAT_DEFAULT_TEMPERATURE', 0.2)
    retrieval = FakeRetrieval(output=_search_output([_hit(1)]))
    model = FakeChatModel()
    service = ChatService(retrieval=retrieval, chat_gateway=FakeGateway(model=model))

    _run(service, model='acme:qwen-max')

    assert model.kwargs['temperature'] == pytest.approx(0.2)
