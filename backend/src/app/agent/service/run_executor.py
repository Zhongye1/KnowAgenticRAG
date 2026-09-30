"""Run 执行器：把一次 Run 从「行」跑成「终态」（agent 层设计 §4.1、§4.2；D87–D92）。

与 :mod:`agent_service` 的分工：

- ``agent_service`` 是**门面**（HTTP 路径的双形态：SSE / 非流式）；
- 本模块是**执行器**：从 ``agent_runs.payload`` 重建执行、驱动图、把事件写进 Redis
  事件流、并按 D92 在取消/超时时**合成已收集的部分结果**。

三条必须钉住的语义：

1. **执行输入只来自快照**——worker 拿不到 HTTP 请求对象，也拿不到已求值的 ACL；
   ``payload`` 给身份，ACL 在执行时**重新求值**（撤权立即生效，fail-closed）；
2. **取消要真的生效**——只在两个事件之间查取消是不够的：工具调用可以几十秒没有事件。
   这里让「下一个事件」与「取消信号」赛跑，谁先到谁说话（见 :func:`_race_next`）；
3. **取消/超时不丢已有结果**（D92）——把已收集的 step/citation/answer 合成为终态产物
   落库；连接通常已断，所以这是**落库问题**，不是推送问题。
"""

from __future__ import annotations

import asyncio
import contextlib

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from sqlalchemy import select

from backend.src.app.agent.model.agent_run import AgentRun
from backend.src.app.agent.service.agent_service import agent_service
from backend.src.app.agent.service.run_payload import parse_run_payload
from backend.src.app.agent.service.run_queue_service import get_run_queue_service
from backend.src.app.kb.service.acl.scope import build_retrieval_scope
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.db import async_db_session

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from backend.src.app.agent.graph.stream_bridge import AgentEvent

__all__ = ['RunExecutor', 'RunOutcome', 'get_run_executor']

#: 合成结果的结束原因：必须落在 ``ChatDoneReason`` 三个取值内（前端解析器不认识第四种）
_REASON_WITH_CONTENT = 'complete'
_REASON_EMPTY = 'empty_result'


@dataclass
class RunOutcome:
    """一次执行的结局（worker 据此写终态；``status`` 三选一：终态集合的子集）。"""

    status: str
    result: dict[str, Any] = field(default_factory=dict)
    steps: list[dict[str, Any]] = field(default_factory=list)
    usage: dict[str, Any] = field(default_factory=dict)
    tool_calls: int = 0
    rewrites: int = 0
    model_spec: str | None = None
    error: str | None = None
    error_code: str | None = None

    def finalize_fields(self) -> dict[str, Any]:
        """→ ``RunWorker.finalize(**fields)`` 的审计字段（一次写全，避免多处拼装）。"""
        return {
            'result': dict(self.result),
            'steps': list(self.steps),
            'usage': dict(self.usage),
            'tool_call_count': int(self.tool_calls),
            'rewrite_count': int(self.rewrites),
            'model_spec': self.model_spec,
            'error': self.error,
            'error_code': self.error_code,
        }


@dataclass
class _Collected:
    """执行过程中从事件流里攒下的**部分结果**（D92 合成的原料）。"""

    steps: list[dict[str, Any]] = field(default_factory=list)
    usage: dict[str, Any] = field(default_factory=dict)
    citations: list[dict[str, Any]] = field(default_factory=list)
    images: list[dict[str, Any]] = field(default_factory=list)
    answer_parts: list[str] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)
    done: dict[str, Any] | None = None
    error: tuple[str, str] | None = None
    #: 显式中止原因（取消 / 超时）；不靠「缺哪个事件」倒推终态（D92）
    terminated_by: str | None = None
    timed_out: bool = False

    def observe(self, event: str, data: dict[str, Any]) -> None:
        """记录一条 D25 事件（只认协议字段，不认识的事件直接忽略）。"""
        if event == 'step':
            self.steps.append({'name': str(data.get('name') or ''), 'detail': str(data.get('detail') or '')})
        elif event == 'meta':
            self.meta = dict(data)
        elif event == 'citation':
            self.citations = list(data.get('citations') or [])
            self.images = list(data.get('images') or [])
        elif event == 'delta':
            content = str(data.get('content') or '')
            if content:
                self.answer_parts.append(content)
        elif event == 'usage':
            self.usage = dict(data)
        elif event == 'done':
            self.done = dict(data)
        elif event == 'error':
            self.error = (str(data.get('code') or 'INTERNAL'), str(data.get('msg') or ''))

    @property
    def answer(self) -> str:
        return ''.join(self.answer_parts)

    def synthesize(self, *, terminated_by: str) -> dict[str, Any]:
        """D92：把已收集的 hits/steps/answer 合成一个 ``done`` 形状的产物。

        不编造没发生的事：没跑到的字段留空/为 0，``reason`` 取合法值，
        真实终止原因放 ``terminated_by``（终态由**显式原因**决定，不由缺哪个事件倒推）。
        """
        has_content = bool(self.answer or self.citations or self.steps)
        return {
            'reason': _REASON_WITH_CONTENT if has_content else _REASON_EMPTY,
            'terminated_by': str(terminated_by),
            'synthetic': True,
            'answer': self.answer,
            'kb_name': str(self.meta.get('kb_name') or ''),
            'kb_names': [str(self.meta.get('kb_name'))] if self.meta.get('kb_name') else [],
            'mode': str(self.meta.get('mode') or 'none'),
            'model_spec': str(self.meta.get('model_spec') or ''),
            'hit_count': int(self.meta.get('hit_count') or 0),
            'visual_count': len(self.images),
            'citations': list(self.citations),
            'images': list(self.images),
            'route': {
                'mode': str(self.meta.get('mode') or 'none'),
                'selected': [],
                'reason': f'run {terminated_by}：保留已收集结果（D92）',
                'kb_names': [str(self.meta.get('kb_name'))] if self.meta.get('kb_name') else [],
            },
            'steps': list(self.steps),
            'usage': _usage_payload(self.usage),
            'agent': {
                'need_retrieval': bool(self.meta),
                'sub_queries': [],
                'plan_rationale': '',
                'grade_score': 0.0,
                'rewrites': 0,
                'tool_calls': 0,
                'tool_calls_by_name': {},
            },
        }


def _usage_payload(usage: dict[str, Any] | None) -> dict[str, int]:
    """usage 负载：缺省补 0（与 stream_bridge 同形）。"""
    if not usage:
        return {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    return {
        'prompt_tokens': int(usage.get('prompt_tokens') or 0),
        'completion_tokens': int(usage.get('completion_tokens') or 0),
        'total_tokens': int(usage.get('total_tokens') or 0),
    }


async def _race_next(
    stream: AsyncIterator[AgentEvent],
    abort: asyncio.Event,
) -> tuple[str, AgentEvent | None]:
    """「下一个事件」与「中止信号」赛跑，返回 ``(结果, 事件)``。

    结果是 ``'event'`` / ``'end'`` / ``'abort'`` 三选一。这样写而不是在循环里
    ``await anext()``：卡在工具调用或模型长等待时，取消/租约丢失依然能立刻生效。
    """
    next_task = asyncio.ensure_future(stream.__anext__())
    abort_task = asyncio.ensure_future(abort.wait())
    try:
        done, _ = await asyncio.wait({next_task, abort_task}, return_when=asyncio.FIRST_COMPLETED)
    except asyncio.CancelledError:
        next_task.cancel()
        abort_task.cancel()
        raise
    if abort_task in done and abort_task.result():
        next_task.cancel()
        with contextlib.suppress(asyncio.CancelledError, StopAsyncIteration):
            await next_task
        return 'abort', None
    abort_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await abort_task
    try:
        return 'event', next_task.result()
    except StopAsyncIteration:
        return 'end', None


async def _watch_cancel(run_id: str, abort: asyncio.Event, *, stop: asyncio.Event, queue: Any) -> None:
    """订阅取消通道：收到即置位（并复查 key，堵住「订阅前已取消」的窗口）。"""
    pubsub = None
    try:
        if await queue.is_cancel_requested(run_id):
            abort.set()
            return
        pubsub = await queue.subscribe_cancel(run_id)
        while not stop.is_set():
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message is not None or await queue.is_cancel_requested(run_id):
                abort.set()
                return
    except Exception as exc:  # pragma: no cover - Redis 异常不该拖垮执行
        log.warning('agent Run 取消订阅失败（降级为心跳复查）run_id={} err={}', run_id, exc)
    finally:
        if pubsub is not None:
            with contextlib.suppress(Exception):
                await pubsub.aclose()


class LeaseLostError(RuntimeError):
    """租约丢失：执行结果作废，且**不得**再写终态（另一个 worker 可能已接管）。"""


class RunExecutor:
    """执行一次 Run：重建 → 驱动 → 收敛；**不写终态**（终态归 ``RunWorker.finalize``）。"""

    def __init__(self, *, service: Any | None = None, queue: Any | None = None) -> None:
        self._service = service or agent_service
        self._queue = queue or get_run_queue_service()

    async def execute(self, run_id: str, *, lease_lost: asyncio.Event | None = None) -> RunOutcome:
        """跑一次 Run，返回结局；**租约丢失时抛** :class:`LeaseLostError`（调用方不得收尾）。"""
        async with async_db_session() as db:
            run = (await db.execute(select(AgentRun).where(AgentRun.run_id == run_id))).scalars().first()
            if run is None:
                return await self._fail(run_id, 'Run 不存在', 'RUN_NOT_FOUND')
            try:
                payload = parse_run_payload(run.payload)
            except ValueError as exc:
                return await self._fail(run_id, f'Run 快照不可用: {exc}', 'INVALID_PAYLOAD')

            try:
                scope = None
                if payload.user is not None:
                    # ACL **执行时**重新求值：提交到执行之间可能已撤权（fail-closed）
                    scope = await build_retrieval_scope(
                        db,
                        user=payload.user,
                        namespace=str(run.plugin_namespace),
                        kb_names=[payload.kb_name],
                    )
                prepared = await self._service.prepare(
                    db,
                    kb_name=payload.kb_name,
                    param=payload.param,
                    plugin_namespace=run.plugin_namespace,
                    scope=scope,
                )
            except errors.ForbiddenError as exc:
                return await self._fail(run_id, str(exc.msg or '无权访问'), 'FORBIDDEN')
            except errors.NotFoundError as exc:
                return await self._fail(run_id, str(exc.msg or ''), 'KB_NOT_FOUND')
            except errors.RequestError as exc:
                # prepare 里唯一的 RequestError 是「模型未配置/未注册」（agent_service 的
                # _ModelNotConfiguredError 继承自它），与非法参数分开报，便于前端给修复提示
                return await self._fail(run_id, str(exc.msg or ''), 'MODEL_NOT_CONFIGURED')
            except Exception as exc:
                return await self._fail(run_id, f'Run 装配失败: {exc}', 'INTERNAL')

            return await self._drive(run_id, prepared, lease_lost=lease_lost)

    async def _fail(self, run_id: str, error: str, error_code: str) -> RunOutcome:
        """装配期失败：补一条 ``error`` 事件，让订阅事件流的客户端不必靠轮询才知情。"""
        outcome = RunOutcome(status='failed', error=error, error_code=error_code)
        await self._publish_terminal(run_id, outcome)
        return outcome

    # ------------------------------------------------------------------ 驱动
    async def _drive(self, run_id: str, prepared: Any, *, lease_lost: asyncio.Event | None) -> RunOutcome:
        collected = _Collected()
        abort = asyncio.Event()
        stop_watch = asyncio.Event()
        watcher = asyncio.create_task(_watch_cancel(run_id, abort, stop=stop_watch, queue=self._queue))
        lease_task: asyncio.Task[None] | None = None
        if lease_lost is not None:
            lease_task = asyncio.create_task(_mirror_event(lease_lost, abort))

        try:
            terminal = await self._consume(run_id, prepared, collected, abort)
        finally:
            stop_watch.set()
            watcher.cancel()
            if lease_task is not None:
                lease_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await watcher
            if lease_task is not None:
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await lease_task

        if lease_lost is not None and lease_lost.is_set():
            # 租约已丢：另一个 worker 可能已接管，**绝不能**再写终态
            raise LeaseLostError(f'Run 租约丢失，放弃收尾: {run_id}')
        if terminal is not None:
            return terminal
        return await self._settle(run_id, collected)

    async def _consume(
        self,
        run_id: str,
        prepared: Any,
        collected: _Collected,
        abort: asyncio.Event,
    ) -> RunOutcome | None:
        """驱动事件流；返回 None 表示「流已停，结局待 :meth:`_settle` 判定」。

        流本身的异常就地转失败结局（不依赖收尾路径），因为这时的收尾逻辑只会
        把同一个异常再包一层。
        """
        from backend.src.app.agent.graph.stream_bridge import run_agent_stream

        stream = run_agent_stream(prepared.graph, prepared.inputs, config=prepared.config)
        try:
            async with asyncio.timeout(float(settings.RAGF_AGENT_TIMEOUT_SECONDS)):
                while True:
                    kind, item = await _race_next(stream, abort)
                    if kind == 'abort':
                        collected.terminated_by = 'cancel_requested'
                        return None
                    if kind == 'end':
                        return None
                    assert item is not None
                    event, data = item
                    collected.observe(event, data)
                    await self._queue.append_event(run_id, event, data)
        except TimeoutError:
            collected.timed_out = True
            return None
        except Exception as exc:
            log.warning('agent Run 执行失败 run_id={} err={}', run_id, exc)
            outcome = self._outcome_from_error(collected, exc)
            await self._publish_terminal(run_id, outcome)
            return outcome
        finally:
            with contextlib.suppress(Exception):
                await stream.aclose()

    async def _settle(self, run_id: str, collected: _Collected) -> RunOutcome:
        """流停之后的结局判定：**由显式原因决定，不由「缺哪个事件」倒推**（D92）。"""
        if collected.done is not None:
            return self._outcome_from_done(collected)
        if collected.error is not None:
            outcome = self._outcome_from_error(collected, None)
        else:
            # 没有 done / error / 显式中止：图被外部掐断（进程被杀 / 事件流空转），
            # 按取消处理——保留已收集结果，比记一条空结果诚实
            terminated_by = 'timeout' if collected.timed_out else (collected.terminated_by or 'cancel_requested')
            outcome = self._synthesized(collected, terminated_by=terminated_by)
        await self._publish_terminal(run_id, outcome)
        return outcome

    async def _publish_terminal(self, run_id: str, outcome: RunOutcome) -> None:
        """把终态补进事件流：``failed`` 补 ``error``；``cancelled`` 补合成的 ``done``。

        客户端（或 SSE 中继）因此能只靠事件流自洽地收尾：**不该出现「流里既没有
        done 也没有 error」这种要靠超时猜测的结局**。
        """
        payload: tuple[str, dict[str, Any]] | None = None
        if outcome.status == 'failed':
            payload = ('error', {'code': outcome.error_code or 'INTERNAL', 'msg': outcome.error or 'Run 执行失败'})
        elif outcome.status == 'cancelled':
            payload = ('done', dict(outcome.result))
        if payload is None:
            return
        with contextlib.suppress(Exception):
            await self._queue.append_event(run_id, payload[0], payload[1])

    # ------------------------------------------------------------------ 结局
    @staticmethod
    def _synthesized(collected: _Collected, *, terminated_by: str) -> RunOutcome:
        """取消/超时：合成已收集结果（D92）；超时算失败，取消算取消。"""
        result = collected.synthesize(terminated_by=terminated_by)
        usage = dict(result.get('usage') or {})
        agent = dict(result.get('agent') or {})
        if terminated_by == 'cancel_requested':
            return RunOutcome(
                status='cancelled',
                result=result,
                steps=list(result.get('steps') or []),
                usage=usage,
                tool_calls=int(agent.get('tool_calls') or 0),
                rewrites=int(agent.get('rewrites') or 0),
                model_spec=str(result.get('model_spec') or '') or None,
            )
        return RunOutcome(
            status='failed',
            result=result,
            steps=list(result.get('steps') or []),
            usage=usage,
            model_spec=str(result.get('model_spec') or '') or None,
            error=f'Run 执行超过 {settings.RAGF_AGENT_TIMEOUT_SECONDS}s 墙钟预算',
            error_code='TIMEOUT',
        )

    @staticmethod
    def _outcome_from_error(collected: _Collected, exc: Exception | None) -> RunOutcome:
        """错误事件 / 异常 → 失败结局（已收集的轨迹与用量照常落库）。"""
        if collected.error is not None:
            code, msg = collected.error
        else:
            code, msg = 'INTERNAL', f'Run 执行失败: {exc}'
        result = collected.synthesize(terminated_by='error')
        return RunOutcome(
            status='failed',
            result=result,
            steps=list(collected.steps),
            usage=_usage_payload(collected.usage),
            model_spec=str(collected.meta.get('model_spec') or '') or None,
            error=msg,
            error_code=code,
        )

    @staticmethod
    def _outcome_from_done(collected: _Collected) -> RunOutcome:
        """正常跑完：``done`` 即终态产物（非流式响应与 GET /runs 都读它）。"""
        done = dict(collected.done or {})
        agent = dict(done.get('agent') or {})
        return RunOutcome(
            status='completed',
            result=done,
            steps=list(done.get('steps') or collected.steps),
            usage=_usage_payload(done.get('usage') or collected.usage),
            tool_calls=int(agent.get('tool_calls') or 0),
            rewrites=int(agent.get('rewrites') or 0),
            model_spec=str(done.get('model_spec') or '') or None,
        )


async def _mirror_event(source: asyncio.Event, target: asyncio.Event) -> None:
    """把一个事件的中止信号转发到执行器的中止位（租约丢失 → 立即停）。"""
    await source.wait()
    target.set()


_executor: RunExecutor | None = None


def get_run_executor() -> RunExecutor:
    """模块级单例。"""
    global _executor
    if _executor is None:
        _executor = RunExecutor()
    return _executor
