"""Run 执行 / 取消合成 / 兜底对账测试（agent 层设计 §4.1、§4.2；D66、D92）。

这里测的都是**分布式语义**——单进程跑起来看不出问题、线上却会丢任务或双跑的那些：

1. **终态写回**：正常跑完把 done 负载、轨迹、用量一次写进 Run 行（非流式响应与
   ``GET /runs/{id}`` 都读它）；
2. **取消合成**（D92）：取消/超时**不丢已收集结果**，且事件流里必须有显式终态帧
   （不该让客户端靠超时猜「是不是完了」）；
3. **租约丢失不收尾**：租约丢了还写终态 = 覆盖接管者的结果，必须抛而不是写；
4. **兜底重投与放弃**：消息丢了要重投，重投次数用尽要**收敛为失败并放行队列**，
   否则同键后面所有 Run 一起卡死。

图与队列都是替身：这里测的是编排与状态机，不是 LangGraph 也不是 Redis（那两样各有
自己的用例）。真依赖只剩 PostgreSQL——因为「谁在跑 / 跑完没有」的事实源就在那里。
"""

from __future__ import annotations

import asyncio
import contextlib

from datetime import timedelta
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

import pytest

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from backend.src.app.agent.model.agent_run import AgentRun
from backend.src.app.agent.model.agent_run_attempt import AgentRunAttempt
from backend.src.app.agent.model.agent_run_request import AgentRunRequest
from backend.src.app.agent.schema.agent import AgentParam
from backend.src.app.agent.service import run_executor as run_executor_module
from backend.src.app.agent.service.run_executor import RunExecutor
from backend.src.app.agent.service.run_payload import build_run_payload, parse_run_payload
from backend.src.app.agent.service.run_submission_service import RunSubmissionService
from backend.src.app.agent.service.run_worker import RunWorker
from backend.src.app.agent.tasks import tasks as agent_tasks
from backend.src.common.model import MappedBase
from backend.src.core.config import settings
from backend.src.database.db import get_database_url
from backend.src.database.ragf_schema_migrations import ensure_ragf_column_migrations
from backend.src.utils.timezone import timezone

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

_NS = 'agent_run_tasks_test'
_UID = 'u-tasks'


# --------------------------------------------------------------------- 替身
class _FakeGraph:
    """脚本化图：``('custom', envelope)`` / ``('values', state)`` 顺序产出，``block`` 永久挂起。"""

    def __init__(self, script: list[tuple[str, Any]]) -> None:
        self._script = script

    async def astream(self, inputs: Any, stream_mode: Any = None, config: Any = None) -> Any:
        for mode, chunk in self._script:
            if mode == 'block':
                await asyncio.sleep(30)
            yield (mode, chunk)


class _FakeService:
    """替身门面：只实现执行器用到的那一个方法（装配口径由 agent_service 用例覆盖）。"""

    def __init__(self, script: list[tuple[str, Any]]) -> None:
        self._script = script

    async def prepare(
        self, db: Any, *, kb_name: str, param: Any, plugin_namespace: Any = None, scope: Any = None
    ) -> Any:
        return SimpleNamespace(graph=_FakeGraph(self._script), inputs={'query': param.query_text}, config={})


class _FakePubSub:
    """替身订阅：取消事件置位即返回一条消息，否则轮询超时返回 None。"""

    def __init__(self, cancel: asyncio.Event) -> None:
        self._cancel = cancel

    async def get_message(
        self, *, ignore_subscribe_messages: bool = True, timeout: float = 1.0
    ) -> dict[str, Any] | None:
        try:
            await asyncio.wait_for(self._cancel.wait(), timeout=0.05)
        except TimeoutError:
            return None
        return {'type': 'message', 'data': 'cancel'}

    async def aclose(self) -> None:
        return None


class _FakeQueue:
    """替身队列通道：事件、取消、投递都记账，不碰 Redis/Celery。"""

    def __init__(self, *, auto_cancel_after: int | None = None) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []
        self.cancel = asyncio.Event()
        self.dispatched: list[str] = []
        self.cleared: list[str] = []
        self._auto_cancel_after = auto_cancel_after

    async def append_event(self, run_id: str, event: str, data: Any = None) -> str:
        self.events.append((str(event), dict(data or {})))
        if self._auto_cancel_after is not None and len(self.events) >= self._auto_cancel_after:
            self.cancel.set()
        return str(len(self.events))

    async def is_cancel_requested(self, run_id: str) -> bool:
        return self.cancel.is_set()

    async def subscribe_cancel(self, run_id: str) -> Any:
        return _FakePubSub(self.cancel)

    async def clear_cancel(self, run_id: str) -> None:
        self.cleared.append(run_id)

    async def event_count(self, run_id: str) -> int:
        return len(self.events)

    def dispatch(self, run_id: str, **kwargs: Any) -> None:
        self.dispatched.append(run_id)

    def dispatch_best_effort(self, run_id: str, **kwargs: Any) -> bool:
        self.dispatched.append(run_id)
        return True


# --------------------------------------------------------------------- PG 夹具
async def _prepare(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(MappedBase.metadata.create_all)
    await ensure_ragf_column_migrations(engine)


async def _cleanup(factory: async_sessionmaker[AsyncSession]) -> None:
    async with factory() as session:
        await session.execute(
            delete(AgentRunAttempt).where(
                AgentRunAttempt.run_id.in_(select(AgentRun.run_id).where(AgentRun.plugin_namespace == _NS))
            )
        )
        await session.execute(delete(AgentRunRequest).where(AgentRunRequest.plugin_namespace == _NS))
        await session.execute(delete(AgentRun).where(AgentRun.plugin_namespace == _NS))
        await session.commit()


@pytest.fixture(scope='module', autouse=True)
def _pg_available() -> Any:
    engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
    try:
        asyncio.run(_prepare(engine))
    except Exception as exc:  # pragma: no cover - 本地环境相关
        pytest.skip(f'真实 PG 不可达，跳过 Run 执行用例: {exc}')
    finally:
        asyncio.run(engine.dispose())
    yield


@contextlib.asynccontextmanager
async def _env(
    monkeypatch: pytest.MonkeyPatch,
    *,
    script: list[tuple[str, Any]] | None = None,
    auto_cancel_after: int | None = None,
    max_engine: bool = True,
) -> AsyncIterator[tuple[async_sessionmaker[AsyncSession], _FakeQueue]]:
    """一次用例的运行环境：测试库会话工厂 + 替身队列/执行器（退出时清理残留行）。

    ``tasks`` / ``run_executor`` 生产里用的是全局 ``async_db_session``（指向 ``ragf``）；
    不切会话工厂，用例会往**开发库**写 Run——模块级会话单例最容易踩的坑。
    """
    engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(agent_tasks, 'async_db_session', factory)
    monkeypatch.setattr(run_executor_module, 'async_db_session', factory)
    queue = _FakeQueue(auto_cancel_after=auto_cancel_after)
    monkeypatch.setattr(
        agent_tasks, 'get_run_executor', lambda: RunExecutor(service=_FakeService(script or _HAPPY_SCRIPT), queue=queue)
    )
    monkeypatch.setattr(agent_tasks, 'get_run_queue_service', lambda: queue)
    try:
        yield factory, queue
    finally:
        await _cleanup(factory)
        await engine.dispose()


async def _load_run(factory: async_sessionmaker[AsyncSession], run_id: str) -> AgentRun | None:
    async with factory() as session:
        return (await session.execute(select(AgentRun).where(AgentRun.run_id == run_id))).scalars().first()


async def _load_request(factory: async_sessionmaker[AsyncSession], run_id: str) -> AgentRunRequest | None:
    async with factory() as session:
        return (
            (await session.execute(select(AgentRunRequest).where(AgentRunRequest.run_id == run_id))).scalars().first()
        )


async def _submit(factory: async_sessionmaker[AsyncSession], thread: str, *, query: str = '问') -> tuple[str, bool]:
    payload = build_run_payload(kb_name='kb-a', param=AgentParam.model_validate({'query_text': query}), namespace=_NS)
    async with factory() as session:
        return await RunSubmissionService().submit(
            session, payload=payload, uid=_UID, agent_slug='default', thread_id=thread
        )


async def _age_request(factory: async_sessionmaker[AsyncSession], run_id: str) -> None:
    """把排队记录的更新时间拨到「投递超时」之前（模拟消息丢失）。"""
    async with factory() as session:
        request = (
            (await session.execute(select(AgentRunRequest).where(AgentRunRequest.run_id == run_id))).scalars().first()
        )
        assert request is not None
        request.updated_time = timezone.now() - timedelta(
            seconds=int(settings.RAGF_AGENT_DISPATCH_TIMEOUT_SECONDS) + 60
        )
        await session.commit()


# --------------------------------------------------------------------- 快照
def test_run_payload_round_trip() -> None:
    """快照是提交/执行两个进程之间唯一的交接面，字段丢一个就是线上才炸的 bug。"""
    payload = build_run_payload(
        kb_name='kb-a', param=AgentParam.model_validate({'query_text': '问', 'max_steps': 3}), namespace='core'
    )
    parsed = parse_run_payload(payload)
    assert parsed.kb_name == 'kb-a'
    assert parsed.query == '问'
    assert parsed.param.max_steps == 3
    assert parsed.user is None


def test_run_payload_rejects_broken_snapshot() -> None:
    with pytest.raises(ValueError, match='kb_name'):
        parse_run_payload({'param': {}})
    with pytest.raises(TypeError, match='param'):
        parse_run_payload({'kb_name': 'kb-a'})


# --------------------------------------------------------------------- 执行
_HAPPY_SCRIPT: list[tuple[str, Any]] = [
    ('custom', {'type': 'step', 'name': 'plan', 'detail': '1 路子查询'}),
    (
        'custom',
        {
            'type': 'meta',
            'payload': {'kb_name': 'kb-a', 'mode': 'hybrid', 'model_spec': 'acme:qwen-max', 'hit_count': 1},
        },
    ),
    ('custom', {'type': 'citation', 'citations': [{'n': 1, 'chunk_id': 'c1'}], 'images': []}),
    ('custom', {'type': 'delta', 'content': '答案'}),
    ('custom', {'type': 'usage', 'usage': {'prompt_tokens': 3, 'completion_tokens': 2, 'total_tokens': 5}}),
    (
        'values',
        {
            'answer': '答案',
            'kb_name': 'kb-a',
            'steps': [{'name': 'plan', 'detail': '1 路子查询'}],
            'citations': [{'n': 1, 'chunk_id': 'c1'}],
            'usage': {'prompt_tokens': 3, 'completion_tokens': 2, 'total_tokens': 5},
            'model_spec': 'acme:qwen-max',
            'retrieval': {
                'mode': 'hybrid',
                'route': {'mode': 'hybrid', 'selected': [], 'reason': '', 'kb_names': ['kb-a']},
            },
            'hits': [{'chunk_id': 'c1'}],
            'tool_calls': 2,
            'rewrite_count': 1,
        },
    ),
]


def test_completed_run_persists_result_and_wakes_queue(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _run() -> None:
        async with _env(monkeypatch) as (factory, queue):
            first, _ = await _submit(factory, 't-happy')
            second, second_dispatched = await _submit(factory, 't-happy')
            assert second_dispatched is False, '同键第二次提交必须排队'

            result = await agent_tasks.run_agent_once(first, worker=RunWorker(worker_id='test:w1'))
            assert result['status'] == 'completed'

            row = await _load_run(factory, first)
            assert row is not None
            assert row.status == 'completed'
            assert row.result['answer'] == '答案'
            assert row.steps == [{'name': 'plan', 'detail': '1 路子查询'}]
            assert row.usage['total_tokens'] == 5
            assert row.model_spec == 'acme:qwen-max'
            assert row.tool_call_count == 2 and row.rewrite_count == 1
            assert queue.cleared == [first]
            # 收尾必须唤醒队头，否则同键后面的 Run 永远停在 pending
            assert queue.dispatched == [second]
            second_request = await _load_request(factory, second)
            assert second_request is not None and second_request.status == 'dispatched'

    asyncio.run(_run())


def test_duplicate_delivery_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    """重复投递（Celery 至少一次语义）不能双跑：第二次必须拿不到租约。"""

    async def _run() -> None:
        async with _env(monkeypatch) as (factory, queue):
            run_id, _ = await _submit(factory, 't-dup')
            worker = RunWorker(worker_id='test:w1')
            first = await agent_tasks.run_agent_once(run_id, worker=worker)
            second = await agent_tasks.run_agent_once(run_id, worker=worker)
            assert first['status'] == 'completed'
            assert second['status'] == 'skipped'
            assert queue.dispatched == []

    asyncio.run(_run())


# --------------------------------------------------------------------- D92 合成
def test_cancel_synthesizes_collected_result(monkeypatch: pytest.MonkeyPatch) -> None:
    """D92：取消要**落库已收集结果**，而不是把这一次运行当没发生。"""

    async def _run() -> None:
        script: list[tuple[str, Any]] = [
            ('custom', {'type': 'step', 'name': 'plan', 'detail': '1 路子查询'}),
            ('custom', {'type': 'meta', 'payload': {'kb_name': 'kb-a', 'mode': 'hybrid', 'hit_count': 2}}),
            ('custom', {'type': 'delta', 'content': '半截回答'}),
            ('block', None),
        ]
        # 第 3 条事件之后触发取消（此时已收集 step/meta/delta）
        async with _env(monkeypatch, script=script, auto_cancel_after=3) as (factory, queue):
            run_id, _ = await _submit(factory, 't-cancel')
            result = await agent_tasks.run_agent_once(run_id, worker=RunWorker(worker_id='test:w1'))
            assert result['status'] == 'cancelled'

            row = await _load_run(factory, run_id)
            assert row is not None
            assert row.status == 'cancelled'
            assert row.steps == [{'name': 'plan', 'detail': '1 路子查询'}]
            assert row.result['synthetic'] is True
            assert row.result['terminated_by'] == 'cancel_requested'
            assert row.result['answer'] == '半截回答'
            assert row.result['hit_count'] == 2

            # 事件流必须有显式终态帧（客户端不该靠超时猜结局）
            assert queue.events[-1][0] == 'done'
            assert queue.events[-1][1]['terminated_by'] == 'cancel_requested'
            cancelled_request = await _load_request(factory, run_id)
            assert cancelled_request is not None and cancelled_request.status == 'cancelled'

    asyncio.run(_run())


def test_timeout_fails_but_keeps_partial_result(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _run() -> None:
        monkeypatch.setattr(settings, 'RAGF_AGENT_TIMEOUT_SECONDS', 0.3)
        script: list[tuple[str, Any]] = [
            ('custom', {'type': 'step', 'name': 'act', 'detail': '开始检索'}),
            ('block', None),
        ]
        async with _env(monkeypatch, script=script) as (factory, queue):
            run_id, _ = await _submit(factory, 't-timeout')
            result = await agent_tasks.run_agent_once(run_id, worker=RunWorker(worker_id='test:w1'))
            assert result['status'] == 'failed'
            assert result['error_code'] == 'TIMEOUT'

            row = await _load_run(factory, run_id)
            assert row is not None and row.status == 'failed'
            assert row.error_code == 'TIMEOUT'
            assert row.steps == [{'name': 'act', 'detail': '开始检索'}], '超时也要保留已收集轨迹（D92）'
            assert queue.events[-1][0] == 'error'
            assert queue.events[-1][1]['code'] == 'TIMEOUT'

    asyncio.run(_run())


def test_lease_lost_does_not_finalize(monkeypatch: pytest.MonkeyPatch) -> None:
    """租约丢失后**不得**写终态：另一个 worker 可能已接管这一行。"""

    async def _run() -> None:
        monkeypatch.setattr(settings, 'RAGF_AGENT_HEARTBEAT_SECONDS', 0)
        script: list[tuple[str, Any]] = [
            ('custom', {'type': 'step', 'name': 'act', 'detail': 'x'}),
            ('block', None),
        ]
        async with _env(monkeypatch, script=script) as (factory, queue):
            run_id, _ = await _submit(factory, 't-lease-lost')

            class _DeadWorker(RunWorker):
                async def heartbeat(self, db: Any, *, run_id: str) -> bool:
                    return False

            result = await agent_tasks.run_agent_once(run_id, worker=_DeadWorker(worker_id='test:dead'))
            assert result['status'] == 'lease_lost'
            row = await _load_run(factory, run_id)
            assert row is not None and row.status == 'running', '租约丢失时不能收尾'
            assert row.result == {}
            assert queue.dispatched == []

    asyncio.run(_run())


# --------------------------------------------------------------------- 对账
def test_reconcile_redispatches_lost_delivery(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _run() -> None:
        async with _env(monkeypatch) as (factory, queue):
            run_id, _ = await _submit(factory, 't-lost')
            await _age_request(factory, run_id)

            summary = await agent_tasks.reconcile_runs(limit=50)
            assert run_id in summary['redispatched']
            assert queue.dispatched == [run_id]

    asyncio.run(_run())


def test_reconcile_expired_unblocks_queue(monkeypatch: pytest.MonkeyPatch) -> None:
    """worker 失联后：租约过期收敛为 failed，且**同键后面的 Run 要被放行**。"""

    async def _run() -> None:
        async with _env(monkeypatch) as (factory, queue):
            first, _ = await _submit(factory, 't-expired')
            second, _ = await _submit(factory, 't-expired')
            async with factory() as session:
                run = (await session.execute(select(AgentRun).where(AgentRun.run_id == first))).scalars().first()
                assert run is not None
                run.status = 'running'
                run.worker_id = 'test:dead'
                run.lease_expires_at = timezone.now() - timedelta(seconds=1)
                await session.commit()

            summary = await agent_tasks.reconcile_runs(limit=50)
            assert first in summary['expired']
            row = await _load_run(factory, first)
            assert row is not None and row.status == 'failed'
            settled = await _load_request(factory, first)
            assert settled is not None and settled.status == 'done'
            assert queue.dispatched == [second]

    asyncio.run(_run())


def test_reconcile_abandons_exhausted_run_and_unblocks_queue(monkeypatch: pytest.MonkeyPatch) -> None:
    """重投次数用尽 → 收敛为 failed 并放行队头；否则同键后面所有 Run 一起卡死。"""

    async def _run() -> None:
        async with _env(monkeypatch) as (factory, queue):
            first, _ = await _submit(factory, 't-stuck')
            second, _ = await _submit(factory, 't-stuck')
            async with factory() as session:
                for attempt_no in (1, 2):
                    session.add(
                        AgentRunAttempt(run_id=first, attempt_no=attempt_no, worker_id='test:w1', status='lost')
                    )
                await session.commit()
            await _age_request(factory, first)

            summary = await agent_tasks.reconcile_runs(limit=50)
            assert first in summary['exhausted']
            row = await _load_run(factory, first)
            assert row is not None and row.status == 'failed' and row.error_code == 'DISPATCH_EXHAUSTED'
            settled = await _load_request(factory, first)
            assert settled is not None and settled.status == 'done'
            # 队头被唤醒并投递
            assert queue.dispatched == [second]

    asyncio.run(_run())


# --------------------------------------------------------------------- 恢复
def test_resume_creates_child_run_with_same_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _run() -> None:
        async with _env(monkeypatch) as (factory, queue):
            origin, _ = await _submit(factory, 't-resume', query='原问题')
            async with factory() as session:
                run = (await session.execute(select(AgentRun).where(AgentRun.run_id == origin))).scalars().first()
                assert run is not None
                run.status = 'failed'
                await session.commit()

            result = await agent_tasks.resume_agent_run(origin)
            assert result['status'] == 'resumed'
            child = await _load_run(factory, result['new_run_id'])
            assert child is not None
            assert child.parent_run_id == origin
            assert child.query == '原问题', '恢复要沿用同一份提交快照'
            assert queue.dispatched == [result['new_run_id']]

    asyncio.run(_run())


def test_resume_rejects_running_run(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _run() -> None:
        async with _env(monkeypatch) as (factory, queue):
            run_id, _ = await _submit(factory, 't-resume-bad')
            async with factory() as session:
                run = (await session.execute(select(AgentRun).where(AgentRun.run_id == run_id))).scalars().first()
                assert run is not None
                run.status = 'running'
                await session.commit()

            result = await agent_tasks.resume_agent_run(run_id)
            assert result['status'] == 'rejected'
            assert queue.dispatched == []

    asyncio.run(_run())
