"""chat 门面编排（ragf-design D18/D25 + agent-layer spec §5.1/M9）。

门面 = prepare（复用同步检索 → 引用/上下文组装 → chat 模型解析）+ events
（SSE 事件序列 meta / citation / delta / usage / done / error）。
首版无服务端会话状态：history 由调用方显式传入，服务端只做近 N 轮截断。

错误约定：语义错误（KB 不存在、请求参数非法）与模型未配置/上游流错误统一以
``error`` 事件表达（code + msg + trace_id），SSE 调用方无需同时解析 JSON 错误
与流错误两条路径；非 chat 场景（MCP answer_with_citations）可消费同一门面。
"""

from __future__ import annotations

import time

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from opentelemetry import metrics as otel_metrics
from opentelemetry import trace as otel_trace

from backend.src.app.chat.service.prompts import (
    EMPTY_RESULT_MESSAGE,
    build_attachments_text,
    build_context_text,
    build_messages,
    truncate_citations,
)
from backend.src.app.model_provider.service.provider_service import normalize_model_spec, provider_service
from backend.src.app.retrieval.schema.search_result import KBSearchParam
from backend.src.app.retrieval.service.retrieval_service import retrieval_service
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.utils.trace_id import get_request_trace_id

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from sqlalchemy.ext.asyncio import AsyncSession

    from backend.src.app.chat.schema.chat import ChatParam
    from backend.src.app.model_provider.providers.chat import OpenAICompatibleChatModel
    from backend.src.app.retrieval.service.scope import Scope

ChatEvent = tuple[str, dict[str, Any]]

_TRACER = otel_trace.get_tracer('backend.ragf')
_METER = otel_metrics.get_meter('backend.ragf')
# ragf-design §14.13：指标只在域门面/外部依赖边界打点，不侵入纯函数
_CHAT_REQUESTS = _METER.create_counter(
    'ragf.chat.requests', unit='1', description='chat 请求数（result=ok/empty/error）'
)
_CHAT_FIRST_TOKEN = _METER.create_histogram(
    'ragf.chat.first_token_seconds', unit='s', description='chat 首 token 延迟（有命中流式回答）'
)
_CHAT_DURATION = _METER.create_histogram('ragf.chat.duration_seconds', unit='s', description='chat 请求总耗时')

# ChatParam 中与同步检索重合的覆盖键（D17：request > KB query_params > settings）
_SEARCH_PARAM_KEYS = frozenset({
    'query_text',
    'search_mode',
    'recall_top_k',
    'final_top_k',
    'similarity_threshold',
    'use_reranker',
    'file_name',
    'filters',
})


def to_search_param(param: ChatParam) -> KBSearchParam:
    """把 ChatParam 的检索覆盖键投影为同步检索参数（只带显式提交的字段）。"""
    subset = {key: value for key, value in param.model_dump(exclude_unset=True).items() if key in _SEARCH_PARAM_KEYS}
    return KBSearchParam(**subset)


def build_citations(kb_name: str, hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """检索命中 → D24 引用条目（n 从 1 起连续编号，与回答中 [n] 标注对应）。"""
    citations: list[dict[str, Any]] = []
    for idx, hit in enumerate(hits, start=1):
        metadata = hit.get('metadata') or {}
        citations.append({
            'n': idx,
            'kb_name': str(hit.get('kb_name') or kb_name),
            'document_id': str(hit.get('document_id') or ''),
            'version_id': int(hit.get('version_id') or 1),
            'chunk_id': str(hit.get('chunk_id') or ''),
            'source': str(metadata.get('source') or '未知来源'),
            'score': float(metadata.get('score') or hit.get('score') or 0.0),
            'content': str(hit.get('content') or ''),
        })
    return citations


def _usage_payload(usage: dict[str, Any] | None) -> dict[str, int]:
    """usage 事件负载：缺省补 0（无命中短路不调用模型）。"""
    if not usage:
        return {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    return {
        'prompt_tokens': int(usage.get('prompt_tokens') or 0),
        'completion_tokens': int(usage.get('completion_tokens') or 0),
        'total_tokens': int(usage.get('total_tokens') or 0),
    }


@dataclass
class PreparedChat:
    """prepare 产物：命中引用（已按上下文预算裁剪）+ 就绪消息 + chat 模型。"""

    kb_name: str
    mode: str
    hit_count: int
    citations: list[dict[str, Any]]
    context_text: str = ''
    messages: list[dict[str, str]] | None = None
    chat_model: OpenAICompatibleChatModel | None = None
    model_spec: str = ''
    temperature: float | None = None
    max_tokens: int | None = None
    thinking_level: str | None = None
    model_error: tuple[str, str] | None = None
    kb_names: list[str] | None = None


class _ProviderChatGateway:
    """默认 chat 模型解析通道（provider_service；测试可注入替身）。"""

    async def get(self, db: AsyncSession, spec: str) -> OpenAICompatibleChatModel:
        return await provider_service.get_chat_model(db, spec)


class ChatService:
    """chat 门面：对外仅 ``astream(...)``（§5.1/D18/D25 事件契约）。"""

    def __init__(self, *, retrieval: Any | None = None, chat_gateway: Any | None = None) -> None:
        self._retrieval = retrieval or retrieval_service
        self._chat_gateway = chat_gateway or _ProviderChatGateway()

    # ------------------------------------------------------------------ 事件流
    async def astream(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        param: ChatParam,
        plugin_namespace: str | None = None,
        scope: Scope | None = None,
    ) -> AsyncIterator[ChatEvent]:
        """SSE 事件序列（meta/citation/delta/usage/done/error；span + 指标）。"""
        started = time.perf_counter()
        first_token_at: float | None = None
        with _TRACER.start_as_current_span('ragf.chat.stream') as span:
            span.set_attribute('ragf.kb_name', kb_name)
            outcome = 'error'
            try:
                async for event, data in self._events(
                    db, kb_name=kb_name, param=param, plugin_namespace=plugin_namespace, scope=scope
                ):
                    if event == 'meta':
                        outcome = 'empty' if int(data.get('hit_count') or 0) == 0 else 'ok'
                    elif event == 'error':
                        outcome = 'error'
                    elif event == 'delta' and first_token_at is None and data.get('content'):
                        first_token_at = time.perf_counter()
                    yield (event, data)
            finally:
                span.set_attribute('ragf.result', outcome)
                _CHAT_REQUESTS.add(1, {'result': outcome})
                if first_token_at is not None:
                    _CHAT_FIRST_TOKEN.record(first_token_at - started)
                _CHAT_DURATION.record(time.perf_counter() - started)

    async def acomplete(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        param: ChatParam,
        plugin_namespace: str | None = None,
    ) -> dict[str, Any]:
        """非流式问答（MCP answer_with_citations 批次面，M10）：返回答案 + 引用 + 用量。

        与 ``astream`` 共用 prepare 语义：无命中短路返回约定文案；语义错误
        （KB 不存在/参数非法/模型未配置）以 fba 异常上抛，由调用方映射工具错误码。
        """
        prepared = await self._prepare(db, kb_name=kb_name, param=param, plugin_namespace=plugin_namespace)
        if prepared.hit_count == 0:
            return {
                'kb_name': kb_name,
                'mode': prepared.mode,
                'model_spec': '',
                'hit_count': 0,
                'citations': [],
                'answer': EMPTY_RESULT_MESSAGE,
                'reason': 'empty_result',
                'usage': _usage_payload(None),
            }
        if prepared.model_error is not None:
            raise errors.RequestError(msg=f'{prepared.model_error[1]}（code={prepared.model_error[0]}）')
        content, usage = await prepared.chat_model.achat(  # type: ignore[union-attr]
            prepared.messages or [],
            temperature=prepared.temperature,
            max_tokens=prepared.max_tokens,
            thinking_level=prepared.thinking_level,
        )
        return {
            'kb_name': kb_name,
            'mode': prepared.mode,
            'model_spec': prepared.model_spec,
            'hit_count': prepared.hit_count,
            'citations': prepared.citations,
            'answer': content,
            'reason': 'complete',
            'usage': _usage_payload(usage),
        }

    async def acomplete_multi(
        self,
        db: AsyncSession,
        *,
        kb_names: list[str],
        param: ChatParam,
        plugin_namespace: str | None = None,
        scope: Scope | None = None,
    ) -> dict[str, Any]:
        """非流式多 KB 问答（M11/D27：跨库检索 + 引用汇总一次生成）。

        scope: 检索范围（ACL 过滤），由 build_retrieval_scope() 构建。
        """
        prepared = await self._prepare(
            db,
            kb_name=None,
            kb_names=kb_names,
            param=param,
            plugin_namespace=plugin_namespace,
            scope=scope,
        )
        payload: dict[str, Any] = {
            'kb_name': prepared.kb_name,
            'kb_names': prepared.kb_names or list(kb_names),
            'mode': prepared.mode,
            'model_spec': '',
            'hit_count': prepared.hit_count,
            'citations': prepared.citations,
            'answer': EMPTY_RESULT_MESSAGE if prepared.hit_count == 0 else '',
            'reason': 'empty_result' if prepared.hit_count == 0 else 'complete',
            'usage': _usage_payload(None),
        }
        if prepared.hit_count == 0:
            return payload
        if prepared.model_error is not None:
            raise errors.RequestError(msg=f'{prepared.model_error[1]}（code={prepared.model_error[0]}）')
        content, usage = await prepared.chat_model.achat(  # type: ignore[union-attr]
            prepared.messages or [],
            temperature=prepared.temperature,
            max_tokens=prepared.max_tokens,
            thinking_level=prepared.thinking_level,
        )
        payload['model_spec'] = prepared.model_spec
        payload['answer'] = content
        payload['usage'] = _usage_payload(usage)
        return payload

    async def _events(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        param: ChatParam,
        plugin_namespace: str | None,
        scope: Scope | None = None,
    ) -> AsyncIterator[ChatEvent]:
        """事件序列核心：prepare 后按命中/错误分支产出（无 IO 逃逸，全量守卫）。"""
        try:
            prepared = await self._prepare(
                db,
                kb_name=kb_name,
                param=param,
                plugin_namespace=plugin_namespace,
                scope=scope,
            )
        except errors.NotFoundError as exc:
            yield self._error_event('KB_NOT_FOUND', exc.msg or '知识库不存在')
            return
        except errors.RequestError as exc:
            yield self._error_event('INVALID_REQUEST', exc.msg or '请求参数错误')
            return
        except Exception as exc:
            log.warning('chat prepare 失败 kb={} err={}', kb_name, exc)
            yield self._error_event('INTERNAL', f'检索/装配失败: {exc}')
            return

        if prepared.hit_count == 0:
            async for item in self._emit_empty(kb_name=kb_name, mode=prepared.mode):
                yield item
            return

        if prepared.model_error is not None:
            code, msg = prepared.model_error
            yield self._error_event(code, msg)
            return

        async for item in self._emit_answer(kb_name=kb_name, prepared=prepared):
            yield item

    async def _emit_empty(self, *, kb_name: str, mode: str) -> AsyncIterator[ChatEvent]:
        """无命中短路（D18：不调用模型，明确文案走 empty_result）。"""
        yield ('meta', {'kb_name': kb_name, 'mode': mode, 'model_spec': '', 'hit_count': 0})
        yield ('citation', {'citations': []})
        yield ('delta', {'content': EMPTY_RESULT_MESSAGE})
        yield ('usage', _usage_payload(None))
        yield ('done', {'reason': 'empty_result'})

    async def _emit_answer(self, *, kb_name: str, prepared: PreparedChat) -> AsyncIterator[ChatEvent]:
        """有命中回答流：meta/citation 后逐帧 delta，收尾 usage + done。"""
        yield (
            'meta',
            {
                'kb_name': kb_name,
                'mode': prepared.mode,
                'model_spec': prepared.model_spec,
                'hit_count': prepared.hit_count,
            },
        )
        yield ('citation', {'citations': prepared.citations})

        finish_reason: str | None = None
        usage: dict[str, Any] | None = None
        try:
            async for ev in prepared.chat_model.achat_stream(  # type: ignore[union-attr]
                prepared.messages or [],
                temperature=prepared.temperature,
                max_tokens=prepared.max_tokens,
                thinking_level=prepared.thinking_level,
            ):
                if ev.content:
                    yield ('delta', {'content': ev.content})
                if ev.finish_reason:
                    finish_reason = ev.finish_reason
                if ev.usage:
                    usage = dict(ev.usage)
        except Exception as exc:
            log.warning('chat 流式上游失败 kb={} model={} err={}', kb_name, prepared.model_spec, exc)
            yield self._error_event('STREAM_ERROR', f'模型流式响应失败: {exc}')
            return

        yield ('usage', _usage_payload(usage))
        yield ('done', {'reason': 'max_tokens' if finish_reason == 'length' else 'complete'})

    # ------------------------------------------------------------------ prepare
    async def _prepare(
        self,
        db: AsyncSession,
        *,
        kb_name: str | None,
        kb_names: list[str] | None = None,
        param: ChatParam,
        plugin_namespace: str | None,
        scope: Scope | None = None,
    ) -> PreparedChat:
        """检索 + 引用裁剪 + 消息组装 + chat 模型解析（模型解析失败不进异常面）。

        scope: 检索范围（ACL 过滤），由 build_retrieval_scope() 构建。
        """
        effective = kb_names or ([kb_name] if kb_name else None)
        if effective is None:
            raise errors.RequestError(msg='必须提供 kb_name 或 kb_names')
        if len(effective) == 1:
            data = await self._retrieval.search(
                db,
                kb_name=effective[0],
                query_text=param.query_text,
                param=to_search_param(param),
                plugin_namespace=plugin_namespace,
                scope=scope,
            )
        else:
            data = await self._retrieval.search_multi(
                db,
                kb_names=effective,
                query_text=param.query_text,
                param=to_search_param(param),
                plugin_namespace=plugin_namespace,
                scope=scope,
            )
        kb_label = str(effective[0]) if effective else (kb_name or '')
        mode = str(data.get('mode') or 'hybrid')
        hits = list(data.get('results') or [])
        citations = build_citations(kb_label, hits)
        if not citations:
            return PreparedChat(
                kb_name=kb_label,
                kb_names=list(effective),
                mode=mode,
                hit_count=0,
                citations=[],
            )

        kept, _dropped = truncate_citations(citations, int(settings.RAGF_CONTEXT_MAX_TOKENS))
        context_text = build_context_text(kept)
        attachments_text = build_attachments_text(
            [item.model_dump() for item in param.attachments] if param.attachments else None
        )
        history = (
            [{'role': str(item.role), 'content': item.content} for item in param.history] if param.history else None
        )
        messages = build_messages(
            query_text=param.query_text,
            context_text=context_text,
            history=history,
            history_rounds=int(settings.RAGF_CHAT_HISTORY_ROUNDS),
            attachments_text=attachments_text,
        )

        spec = normalize_model_spec(param.model or str(settings.RAGF_CHAT_MODEL_SPEC or ''))
        if not spec:
            return PreparedChat(
                kb_name=kb_label,
                kb_names=list(effective),
                mode=mode,
                hit_count=len(hits),
                citations=kept,
                context_text=context_text,
                messages=messages,
                model_error=('MODEL_NOT_CONFIGURED', '未配置 chat 模型：请求未指定 model 且 RAGF_CHAT_MODEL_SPEC 为空'),
            )

        try:
            chat_model = await self._chat_gateway.get(db, spec)
        except errors.NotFoundError as exc:
            return PreparedChat(
                kb_name=kb_label,
                kb_names=list(effective),
                mode=mode,
                hit_count=len(hits),
                citations=kept,
                context_text=context_text,
                messages=messages,
                model_error=('MODEL_NOT_CONFIGURED', f'{exc.msg}（chat 模型未配置或不可用）'),
            )
        except errors.RequestError as exc:
            return PreparedChat(
                kb_name=kb_label,
                kb_names=list(effective),
                mode=mode,
                hit_count=len(hits),
                citations=kept,
                context_text=context_text,
                messages=messages,
                model_error=('MODEL_NOT_CONFIGURED', exc.msg or 'chat 模型装配失败'),
            )
        except Exception as exc:
            log.warning('chat 模型装配失败 spec={} err={}', spec, exc)
            return PreparedChat(
                kb_name=kb_label,
                kb_names=list(effective),
                mode=mode,
                hit_count=len(hits),
                citations=kept,
                context_text=context_text,
                messages=messages,
                model_error=('MODEL_NOT_CONFIGURED', f'chat 模型装配失败: {exc}'),
            )

        return PreparedChat(
            kb_name=kb_label,
            kb_names=list(effective),
            mode=mode,
            hit_count=len(hits),
            citations=kept,
            context_text=context_text,
            messages=messages,
            chat_model=chat_model,
            model_spec=spec,
            temperature=param.temperature
            if param.temperature is not None
            else float(settings.RAGF_CHAT_DEFAULT_TEMPERATURE),
            max_tokens=param.max_tokens,
            thinking_level=param.thinking_level,
        )

    @staticmethod
    def _error_event(code: str, msg: str) -> ChatEvent:
        return ('error', {'code': code, 'msg': msg, 'trace_id': get_request_trace_id()})


chat_service = ChatService()

__all__ = ['ChatEvent', 'ChatService', 'PreparedChat', 'build_citations', 'chat_service', 'to_search_param']
