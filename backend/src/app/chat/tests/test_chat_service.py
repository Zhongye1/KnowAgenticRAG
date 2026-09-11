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


def _steps(results: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [
        {'name': 'recall', 'detail': f'text={len(results)} visual=0 recall_top_k=10'},
        {'name': 'rerank', 'detail': 'applied'},
        {'name': 'hydrate', 'detail': f'text={len(results)} visual=0'},
    ]


def _search_output(results: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        'kb_name': 'dev',
        'kb_names': ['dev'],
        'mode': 'hybrid',
        'recall_count': len(results),
        'reranked': True,
        'degraded': False,
        'duration_ms': 5,
        'results': results,
        'visual_results': [],
        'include_visual': False,
        'steps': _steps(results),
    }


class FakeRetrieval:
    """检索替身：按配置返回命中/步骤或抛语义错误；同步与流式两条门面同源。"""

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
        scope: Any = None,
    ) -> dict[str, Any]:
        self.calls.append({'kb_name': kb_name, 'query_text': query_text, 'param': param, 'ns': plugin_namespace})
        if self.exc is not None:
            raise self.exc
        return self.output

    async def astream_search(
        self,
        db: Any,
        *,
        kb_names: list[str],
        query_text: str,
        param: Any = None,
        plugin_namespace: str | None = None,
        scope: Any = None,
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        self.calls.append({'kb_names': kb_names, 'query_text': query_text, 'param': param, 'ns': plugin_namespace})
        if self.exc is not None:
            raise self.exc
        for step in self.output.get('steps') or []:
            yield 'step', step
        yield 'result', self.output


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

    async def achat(self, messages: list[dict[str, Any]], **kwargs: Any) -> tuple[str, dict[str, Any]]:
        self.kwargs = {'messages': messages, **kwargs}
        if self.exc is not None:
            raise self.exc
        return '版本差异如下', {'prompt_tokens': 10, 'completion_tokens': 4, 'total_tokens': 14}


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


def _names(events: list[tuple[str, dict[str, Any]]]) -> list[str]:
    return [event for event, _data in events]


def _non_step(events: list[tuple[str, dict[str, Any]]]) -> list[tuple[str, dict[str, Any]]]:
    """剔除检索 step 事件后的序列（事件顺序在 test_stream_emits_retrieval_steps 单独断言）。"""
    return [item for item in events if item[0] != 'step']


def test_empty_result_short_circuit_without_model(monkeypatch: pytest.MonkeyPatch) -> None:
    """无命中：meta(hit=0) → citation([]) → 明确文案 → usage(0) → done(empty_result)，不调模型。"""
    monkeypatch.setattr(settings, 'RAGF_CHAT_MODEL_SPEC', '')
    retrieval = FakeRetrieval()
    gateway = FakeGateway()
    service = ChatService(retrieval=retrieval, chat_gateway=gateway)

    events = _non_step(_run(service))

    assert events[0] == (
        'meta',
        {'kb_name': 'dev', 'mode': 'hybrid', 'model_spec': '', 'hit_count': 0, 'visual_count': 0},
    )
    assert events[1] == ('citation', {'citations': [], 'images': []})
    assert events[2] == ('delta', {'content': EMPTY_RESULT_MESSAGE})
    assert events[3] == ('usage', {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0})
    assert events[4][0] == 'done'
    assert events[4][1]['reason'] == 'empty_result'
    assert events[4][1]['answer'] == EMPTY_RESULT_MESSAGE
    assert events[4][1]['steps'] == _steps([])
    assert gateway.specs == []


def test_hit_streams_with_citations_and_usage() -> None:
    """有命中：meta/citation → delta 逐帧 → usage → done(complete)；模型 spec/温度正确下发。"""
    retrieval = FakeRetrieval(output=_search_output([_hit(1), _hit(2)]))
    model = FakeChatModel()
    gateway = FakeGateway(model=model)
    service = ChatService(retrieval=retrieval, chat_gateway=gateway)

    events = _non_step(_run(service, model='acme:qwen-max', temperature=0.7))

    names = _names(events)
    assert names == ['meta', 'citation', 'delta', 'delta', 'usage', 'done']
    assert retrieval.calls[0]['kb_names'] == ['dev']  # 流式走 astream_search（同一编排）
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
    done = events[-1][1]
    assert done['reason'] == 'complete'
    assert done['answer'] == '版本差异如下'
    assert done['usage'] == {'prompt_tokens': 10, 'completion_tokens': 4, 'total_tokens': 14}
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

    # 检索步骤先于装配产出（step 是真实进度），模型未配置在装配后才可知
    assert _names(events) == ['step', 'step', 'step', 'error']
    event, data = events[-1]
    assert event == 'error'
    assert data['code'] == 'MODEL_NOT_CONFIGURED'
    assert 'trace_id' in data
    assert 'meta' not in _names(events)
    assert 'citation' not in _names(events)


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

    names = _names(_non_step(events))
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


def test_include_visual_projected_and_meta_counts() -> None:
    """include_visual/visual_top_k 投影为检索覆盖层；meta 透出 visual_count，引用仍只含 chunk。"""
    visual = [
        {
            'id': 'doc-9_t0',
            'image_path': 'kb/core/dev/doc-9/tiles/doc-9_t0.jpg',
            'document_id': 'doc-9',
            'kb_name': 'dev',
            'page': 1,
            'position': 'strip_0',
            'chunk_type': 'tile',
            'parent_section': '',
            'content_summary': '',
            'score': 0.88,
        }
    ]
    output = _search_output([_hit(1)])
    output['visual_results'] = visual
    retrieval = FakeRetrieval(output=output)
    gateway = FakeGateway(model=FakeChatModel())
    service = ChatService(retrieval=retrieval, chat_gateway=gateway)

    events = _non_step(_run(service, model='acme:qwen-max', include_visual=True, visual_top_k=3))

    param = retrieval.calls[0]['param']
    assert param.include_visual is True
    assert param.visual_top_k == 3
    assert events[0][1]['visual_count'] == 1
    assert events[0][1]['hit_count'] == 1
    assert len(events[1][1]['citations']) == 1  # 引用契约不含视觉命中


def test_citation_event_carries_visual_items() -> None:
    """citation 事件附带 images 列表(visual_results 归一映射);引用编号仍只含 chunk。"""
    output = _search_output([_hit(1)])
    output['visual_results'] = [
        {
            'id': 'doc-9_t0',
            'image_path': 'kb/core/dev/doc-9/tiles/doc-9_t0.jpg',
            'document_id': 'doc-9',
            'kb_name': 'dev',
            'page': 1,
            'position': 'strip_0',
            'chunk_type': 'tile',
            'parent_section': '',
            'content_summary': '',
            'score': 0.88,
        }
    ]
    retrieval = FakeRetrieval(output=output)
    service = ChatService(retrieval=retrieval, chat_gateway=FakeGateway(model=FakeChatModel()))

    events = _non_step(_run(service, model='acme:qwen-max', include_visual=True))

    images = events[1][1]['images']
    assert len(images) == 1
    assert images[0]['image_id'] == 'doc-9_t0'
    assert images[0]['type'] == 'image'
    assert len(events[1][1]['citations']) == 1


def _run_sync(service: ChatService, **param_overrides: Any) -> dict[str, Any]:
    param = ChatParam(query_text='版本差异是什么', **param_overrides)

    async def _call() -> dict[str, Any]:
        return await service.acomplete(None, kb_name='dev', param=param)  # type: ignore[arg-type]

    return asyncio.run(_call())


def test_stream_emits_retrieval_steps_before_meta() -> None:
    """step 事件随检索编排即时产出且在 meta 之前（EagleRAG query_stream 事件序对齐）。"""
    retrieval = FakeRetrieval(output=_search_output([_hit(1)]))
    service = ChatService(retrieval=retrieval, chat_gateway=FakeGateway(model=FakeChatModel()))

    events = _run(service, model='acme:qwen-max')

    assert _names(events) == ['step', 'step', 'step', 'meta', 'citation', 'delta', 'delta', 'usage', 'done']
    assert events[0][1] == {'name': 'recall', 'detail': 'text=1 visual=0 recall_top_k=10'}
    assert events[1][1] == {'name': 'rerank', 'detail': 'applied'}
    assert events[2][1] == {'name': 'hydrate', 'detail': 'text=1 visual=0'}


def test_done_event_is_self_contained() -> None:
    """done 携带全文 + route/steps/用量，客户端可只消费 done 渲染。"""
    retrieval = FakeRetrieval(output=_search_output([_hit(1)]))
    service = ChatService(retrieval=retrieval, chat_gateway=FakeGateway(model=FakeChatModel()))

    done = _run(service, model='acme:qwen-max')[-1][1]

    assert done['reason'] == 'complete'
    assert done['answer'] == '版本差异如下'
    assert done['kb_name'] == 'dev'
    assert done['kb_names'] == ['dev']
    assert done['mode'] == 'hybrid'
    assert done['hit_count'] == 1
    assert done['model_spec'] == 'acme:qwen-max'
    assert done['route']['selected'] == ['text']
    assert [step['name'] for step in done['steps']] == ['recall', 'rerank', 'hydrate']
    assert done['usage']['total_tokens'] == 14


def test_acomplete_returns_full_payload() -> None:
    """非流式 acomplete：一次返回回答 + 引用 + route/steps（与流式 done 同源）。"""
    retrieval = FakeRetrieval(output=_search_output([_hit(1), _hit(2)]))
    model = FakeChatModel()
    service = ChatService(retrieval=retrieval, chat_gateway=FakeGateway(model=model))

    payload = _run_sync(service, model='acme:qwen-max')

    assert payload['answer'] == '版本差异如下'
    assert payload['reason'] == 'complete'
    assert payload['hit_count'] == 2
    assert payload['model_spec'] == 'acme:qwen-max'
    assert [item['n'] for item in payload['citations']] == [1, 2]
    assert payload['route']['kb_names'] == ['dev']
    assert [step['name'] for step in payload['steps']] == ['recall', 'rerank', 'hydrate']
    assert payload['usage']['completion_tokens'] == 4
    assert retrieval.calls[0]['kb_name'] == 'dev'


def test_acomplete_empty_result_short_circuits(monkeypatch: pytest.MonkeyPatch) -> None:
    """无命中：不调模型，answer 为约定文案 + reason=empty_result。"""
    monkeypatch.setattr(settings, 'RAGF_CHAT_MODEL_SPEC', '')
    gateway = FakeGateway()
    service = ChatService(retrieval=FakeRetrieval(), chat_gateway=gateway)

    payload = _run_sync(service)

    assert payload['answer'] == EMPTY_RESULT_MESSAGE
    assert payload['reason'] == 'empty_result'
    assert payload['hit_count'] == 0
    assert payload['citations'] == []
    assert payload['usage'] == {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    assert gateway.specs == []
