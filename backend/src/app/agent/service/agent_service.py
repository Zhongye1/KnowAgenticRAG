"""Agent 门面编排（agentic-rag spec D34-D41）。

两条形态同源：``astream`` 直出 D25 事件序列，``acomplete`` 消费同一序列取 ``done``
组装响应——非流式就是「不转发的流式」，两者永不漂移（与 chat 域的 done/响应同源
约定一致，D38）。

本层职责：

1. **预算**（D36 三重闸）：步数 / 改写次数 / 墙钟；客户端只能收紧不能放宽；
2. **模型装配**：``ModelInfo`` → LangChain ``ChatOpenAI``（见 ``model_adapter``）；
3. **工具上下文**：ACL 求交在 ``ToolContext.allowed_names``，工具不接受客户端过滤语义；
4. **错误面**：语义错误走 ``error`` 事件（流式）或对应 HTTP 异常（非流式）。

图按请求构建（模型 / 库集合 / 预算都是请求级），故 ``AgentGraphConfig`` 直接持有
请求字段；不引入 checkpointer（D40 stateless）。
"""

from __future__ import annotations

import asyncio
import time

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from opentelemetry import metrics as otel_metrics
from opentelemetry import trace as otel_trace

from backend.src.app.agent.graph.builder import AgentGraphConfig, build_agent_graph
from backend.src.app.agent.graph.stream_bridge import run_agent_stream
from backend.src.app.agent.graph.tools import ToolContext
from backend.src.app.agent.service.model_adapter import build_agent_chat_model
from backend.src.app.agent.service.run_log import (
    build_run_fields,
    new_run_id,
    record_agent_run,
    status_for,
)
from backend.src.app.chat.service.chat_service import to_search_param
from backend.src.app.kb.crud import knowledge_base_dao
from backend.src.app.model_provider.service.provider_service import normalize_model_spec, provider_service
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.utils.trace_id import get_request_trace_id

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Callable

    from sqlalchemy.ext.asyncio import AsyncSession

    from backend.src.app.agent.graph.stream_bridge import AgentEvent
    from backend.src.app.agent.schema.agent import AgentParam
    from backend.src.app.retrieval.service.scope import Scope

__all__ = ['AgentBudget', 'AgentService', 'agent_service']

_TRACER = otel_trace.get_tracer('backend.ragf')
_METER = otel_metrics.get_meter('backend.ragf')
_AGENT_REQUESTS = _METER.create_counter(
    'ragf.agent.requests', unit='1', description='agent 请求数（result=ok/empty/error）'
)
_AGENT_FIRST_TOKEN = _METER.create_histogram(
    'ragf.agent.first_token_seconds', unit='s', description='agent 首 delta 延迟'
)
_AGENT_DURATION = _METER.create_histogram('ragf.agent.duration_seconds', unit='s', description='agent 请求总耗时')
# D36/§3.6：预算与自省的可观测面（Grafana 可查「谁跑满了预算」）
_AGENT_STEPS = _METER.create_histogram('ragf.agent.steps', unit='1', description='单次运行的轨迹步数')
_AGENT_REWRITES = _METER.create_counter('ragf.agent.rewrites', unit='1', description='T3 自省改写次数')
_AGENT_TOOL_CALLS = _METER.create_counter(
    'ragf.agent.tool_calls', unit='1', description='内层工具循环调用次数（按 tool 名分桶）'
)
# 运行审计轨迹上限（防御异常长流；agent_runs.steps 快照不至于无界）
_MAX_AUDIT_STEPS = 50


@dataclass(frozen=True)
class AgentBudget:
    """一次运行的硬预算（D36：客户端只能收紧）。"""

    max_steps: int
    max_rewrites: int
    max_sub_queries: int
    min_score: float
    allow_rewrite: bool

    def recursion_limit(self) -> int:
        """步数预算 → LangGraph ``recursion_limit``。

        LangGraph 按「节点执行次数」计数，而 ``max_steps`` 是模型往返预算；图上
        ``plan``/``grade``/``generate`` 属同一轮的记账节点，故叠加固定开销与每个
        改写周期多出的两个节点（rewrite + 复检 act）。
        """
        return int(self.max_steps) + 2 * int(self.max_rewrites) + 3


@dataclass
class PreparedAgent:
    """装配产物：编译好的图 + 输入/配置（模型与预算已内聚在图中）。"""

    graph: Any
    inputs: dict[str, Any]
    config: dict[str, Any]
    budget: AgentBudget
    model_spec: str


class _ProviderModelGateway:
    """默认模型解析通道（provider_service；测试可注入替身）。"""

    async def get(self, db: AsyncSession, spec: str) -> Any:
        info = await provider_service.get_model_info(db, spec)
        if info is None:
            raise errors.NotFoundError(msg=f'未找到模型 spec: {spec}（请检查 model_providers 配置）')
        return info


class _ModelNotConfiguredError(errors.RequestError):
    """模型未配置/未注册（与「知识库不存在」区分，前端可给出不同修复提示）。"""


class AgentService:
    """Agent 门面：流式 ``astream(...)`` + 非流式 ``acomplete(...)``（D35）。"""

    def __init__(
        self,
        *,
        model_gateway: Any | None = None,
        graph_factory: Callable[..., Any] = build_agent_graph,
    ) -> None:
        self._model_gateway = model_gateway or _ProviderModelGateway()
        self._graph_factory = graph_factory

    # ------------------------------------------------------------------ 公开入口
    async def astream(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        param: AgentParam,
        plugin_namespace: str | None = None,
        scope: Scope | None = None,
    ) -> AsyncIterator[AgentEvent]:
        """D25 事件序列（step/meta/citation/delta/usage/done/error；span + 指标 + 运行审计）。"""
        started = time.perf_counter()
        run_id = new_run_id()
        first_delta_at: float | None = None
        final: dict[str, Any] | None = None
        steps_seen: list[dict[str, Any]] = []
        meta_hits: int | None = None
        errored = False
        with _TRACER.start_as_current_span('ragf.agent.stream') as span:
            span.set_attribute('ragf.kb_name', kb_name)
            span.set_attribute('ragf.run_id', run_id)
            try:
                async for event, data in self._events(
                    db, kb_name=kb_name, param=param, plugin_namespace=plugin_namespace, scope=scope
                ):
                    if event == 'meta':
                        meta_hits = int(data.get('hit_count') or 0)
                    elif event == 'error':
                        errored = True
                    elif event == 'done':
                        final = data
                    elif event == 'step' and len(steps_seen) < _MAX_AUDIT_STEPS:
                        steps_seen.append(_step_snapshot(data))
                    elif event == 'delta' and first_delta_at is None and data.get('content'):
                        first_delta_at = time.perf_counter()
                    yield (event, data)
            finally:
                outcome = _outcome(errored=errored, meta_hits=meta_hits)
                span.set_attribute('ragf.result', outcome)
                _AGENT_REQUESTS.add(1, {'result': outcome})
                _record_run_metrics(final)
                if first_delta_at is not None:
                    _AGENT_FIRST_TOKEN.record(first_delta_at - started)
                _AGENT_DURATION.record(time.perf_counter() - started)
                await self._audit_run(
                    db,
                    run_id=run_id,
                    kb_name=kb_name,
                    plugin_namespace=plugin_namespace,
                    query=str(param.query_text or ''),
                    outcome=outcome,
                    done=final,
                    steps=steps_seen,
                )

    async def _audit_run(
        self,
        db: AsyncSession,
        *,
        run_id: str,
        kb_name: str,
        plugin_namespace: str | None,
        query: str,
        outcome: str,
        done: dict[str, Any] | None,
        steps: list[dict[str, Any]],
    ) -> None:
        """运行审计落库（best-effort；D40：无 checkpointer，审计即运行历史）。"""
        agent = (done or {}).get('agent') or {}
        await record_agent_run(
            db,
            **build_run_fields(
                run_id=run_id,
                kb_names=[kb_name],
                plugin_namespace=plugin_namespace,
                query=query,
                status=status_for(done=done, outcome=outcome),
                steps=(done or {}).get('steps') or steps,
                usage=(done or {}).get('usage'),
                model_spec=(done or {}).get('model_spec'),
                tool_calls=int(agent.get('tool_calls') or 0),
                rewrites=int(agent.get('rewrites') or 0),
            ),
        )

    async def acomplete(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        param: AgentParam,
        plugin_namespace: str | None = None,
        scope: Scope | None = None,
    ) -> dict[str, Any]:
        """非流式 Agent 问答（``POST /{kb_name}/agent``）：消费同一事件序列取 done。

        语义错误在此还原为 HTTP 异常（流式为 ``error`` 事件），与 chat 域错误面一致。
        """
        done: dict[str, Any] = {}
        async for event, data in self.astream(
            db, kb_name=kb_name, param=param, plugin_namespace=plugin_namespace, scope=scope
        ):
            if event == 'error':
                raise _http_error(data)
            if event == 'done':
                done = data
        if not done:
            raise errors.ServerError(msg='Agent 未产出结果')
        return done

    # ------------------------------------------------------------------ 事件序列
    async def _events(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        param: AgentParam,
        plugin_namespace: str | None,
        scope: Scope | None = None,
    ) -> AsyncIterator[AgentEvent]:
        """装配 → 驱动图执行；墙钟预算在此兜底（D36）。"""
        try:
            prepared = await self._prepare(
                db, kb_name=kb_name, param=param, plugin_namespace=plugin_namespace, scope=scope
            )
        except errors.NotFoundError as exc:
            yield self._error_event('KB_NOT_FOUND', exc.msg or '知识库不存在')
            return
        except _ModelNotConfiguredError as exc:
            yield self._error_event('MODEL_NOT_CONFIGURED', exc.msg or '未配置 agent 模型')
            return
        except errors.RequestError as exc:
            yield self._error_event('INVALID_REQUEST', exc.msg or '请求参数错误')
            return
        except Exception as exc:
            log.warning('agent 装配失败 kb={} err={}', kb_name, exc)
            yield self._error_event('INTERNAL', f'Agent 装配失败: {exc}')
            return

        timeout = float(settings.RAGF_AGENT_TIMEOUT_SECONDS)
        try:
            async with asyncio.timeout(timeout):
                async for event in run_agent_stream(prepared.graph, prepared.inputs, config=prepared.config):
                    yield event
        except TimeoutError:
            yield self._error_event('TIMEOUT', f'Agent 执行超过 {timeout}s 墙钟预算')
        except Exception as exc:
            log.warning('agent 图执行失败 kb={} err={}', kb_name, exc)
            yield self._error_event('INTERNAL', f'Agent 执行失败: {exc}')

    # ------------------------------------------------------------------ 装配
    async def _prepare(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        param: AgentParam,
        plugin_namespace: str | None,
        scope: Scope | None,
    ) -> PreparedAgent:
        """KB 归属预检 → 模型装配 → 预算解析 → 建图（失败抛语义异常）。"""
        kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=plugin_namespace)
        if kb is None:
            raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
        model_spec, model = await self._build_model(db, param)
        budget = self._resolve_budget(param)
        tool_ctx = ToolContext(
            db=db,
            scope=scope,
            plugin_namespace=plugin_namespace,
            kb_names=[kb_name],
            param=to_search_param(param),
        )
        config = AgentGraphConfig(
            kb_name=kb_name,
            kb_names=[kb_name],
            model_spec=model_spec,
            max_sub_queries=budget.max_sub_queries,
            max_rewrites=budget.max_rewrites,
            min_score=budget.min_score,
            allow_rewrite=budget.allow_rewrite,
            act_timeout_seconds=float(settings.RAGF_AGENT_ACT_TIMEOUT_SECONDS),
            act_recursion_limit=int(settings.RAGF_AGENT_ACT_RECURSION_LIMIT),
            context_max_tokens=int(settings.RAGF_CONTEXT_MAX_TOKENS),
            history_rounds=int(settings.RAGF_CHAT_HISTORY_ROUNDS),
            temperature=(
                param.temperature if param.temperature is not None else float(settings.RAGF_CHAT_DEFAULT_TEMPERATURE)
            ),
            max_tokens=param.max_tokens,
            thinking_level=param.thinking_level,
            history=[{'role': str(item.role), 'content': item.content} for item in param.history] or None,
            attachments=[item.model_dump() for item in param.attachments] or None,
        )
        graph = self._graph_factory(tool_ctx=tool_ctx, config=config, model=model)
        return PreparedAgent(
            graph=graph,
            inputs={'query': param.query_text, 'kb_name': kb_name, 'kb_names': [kb_name]},
            config={'recursion_limit': budget.recursion_limit()},
            budget=budget,
            model_spec=model_spec,
        )

    async def _build_model(self, db: AsyncSession, param: AgentParam) -> tuple[str, Any]:
        """解析模型 spec 并构建 LangChain 模型（spec 缺失/未注册即失败）。"""
        spec = normalize_model_spec(
            param.model or str(settings.RAGF_AGENT_MODEL_SPEC or '') or str(settings.RAGF_CHAT_MODEL_SPEC or '')
        )
        if not spec:
            raise _ModelNotConfiguredError(
                msg='未配置 agent 模型：请求未指定 model，且 RAGF_AGENT_MODEL_SPEC / RAGF_CHAT_MODEL_SPEC 为空'
            )
        try:
            info = await self._model_gateway.get(db, spec)
        except errors.NotFoundError as exc:
            raise _ModelNotConfiguredError(msg=f'{exc.msg}（agent 模型未配置或不可用）') from exc
        model = build_agent_chat_model(
            info,
            temperature=(
                param.temperature if param.temperature is not None else float(settings.RAGF_CHAT_DEFAULT_TEMPERATURE)
            ),
            max_tokens=param.max_tokens,
            timeout=float(settings.RAGF_AGENT_TIMEOUT_SECONDS),
        )
        return spec, model

    @staticmethod
    def _resolve_budget(param: AgentParam) -> AgentBudget:
        """预算解析：请求值一律与服务端默认取 min（硬上限兜底，D36）。"""
        hard_steps = max(1, int(settings.RAGF_AGENT_MAX_STEPS_HARD))
        default_steps = min(max(1, int(settings.RAGF_AGENT_MAX_STEPS)), hard_steps)
        max_steps = min(int(param.max_steps), hard_steps) if param.max_steps is not None else default_steps

        allow_rewrite = param.allow_rewrite is not False
        max_rewrites = max(0, int(settings.RAGF_AGENT_MAX_REWRITES)) if allow_rewrite else 0

        default_sub_queries = max(1, int(settings.RAGF_AGENT_MAX_SUB_QUERIES))
        max_sub_queries = (
            min(int(param.max_sub_queries), default_sub_queries)
            if param.max_sub_queries is not None
            else default_sub_queries
        )
        min_score = float(param.min_score) if param.min_score is not None else float(settings.RAGF_AGENT_MIN_SCORE)
        return AgentBudget(
            max_steps=max_steps,
            max_rewrites=max_rewrites,
            max_sub_queries=max_sub_queries,
            min_score=min_score,
            allow_rewrite=allow_rewrite,
        )

    @staticmethod
    def _error_event(code: str, msg: str) -> AgentEvent:
        return ('error', {'code': code, 'msg': msg, 'trace_id': get_request_trace_id()})


def _http_error(data: dict[str, Any]) -> Exception:
    """``error`` 事件 → HTTP 异常（非流式路径的错误面）。"""
    code = str(data.get('code') or 'INTERNAL')
    msg = str(data.get('msg') or 'Agent 执行失败')
    if code == 'KB_NOT_FOUND':
        return errors.NotFoundError(msg=msg)
    if code in {'INVALID_REQUEST', 'MODEL_NOT_CONFIGURED'}:
        return errors.RequestError(msg=msg)
    return errors.ServerError(msg=msg)


def _step_snapshot(data: dict[str, Any]) -> dict[str, str]:
    """step 事件 → 审计快照（与 D25 事件同形，仅留 name/detail）。"""
    return {'name': str(data.get('name') or ''), 'detail': str(data.get('detail') or '')}


def _outcome(*, errored: bool, meta_hits: int | None) -> str:
    """事件流终态 → 指标标签：error / empty / ok / cancelled（客户端中断/超时）。"""
    if errored:
        return 'error'
    if meta_hits is None:
        return 'cancelled'
    return 'empty' if meta_hits == 0 else 'ok'


def _record_run_metrics(done: dict[str, Any] | None) -> None:
    """done 负载 → 预算/自省指标（失败或未产出 done 时不打点，避免污染直方图）。"""
    if not done:
        return
    agent = done.get('agent') or {}
    _AGENT_STEPS.record(len(done.get('steps') or []))
    _AGENT_REWRITES.add(max(0, int(agent.get('rewrites') or 0)))
    total_calls = max(0, int(agent.get('tool_calls') or 0))
    by_name = {str(k): max(0, int(v)) for k, v in (agent.get('tool_calls_by_name') or {}).items()}
    if by_name:
        for tool, calls in by_name.items():
            if calls:
                _AGENT_TOOL_CALLS.add(calls, {'tool': tool})
    elif total_calls:
        # 兼容：无工具名明细（替身图/旧负载）时只记总量，工具名归一为 unknown
        _AGENT_TOOL_CALLS.add(total_calls, {'tool': 'unknown'})


agent_service = AgentService()
