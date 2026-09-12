"""Agent 运行审计（spec D40 / 1.11）：状态映射 + 字段构造 + 真实落库。

纯函数用例离线可跑；落库用例沿用 ``retrieval/tests/test_integration_pg`` 的
「PG 不可达则整模块 skip」约定，不引入新的测试基础设施。
"""

from __future__ import annotations

import asyncio

from typing import Any, cast
from uuid import UUID

import pytest

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from backend.src.app.agent.model.agent_run import AgentRun
from backend.src.app.agent.service.agent_service import _outcome
from backend.src.app.agent.service.run_log import (
    RUN_QUERY_MAX,
    build_run_fields,
    record_agent_run,
    status_for,
)
from backend.src.app.agent.tests.test_agent_service import _kb_dao, _param, _service
from backend.src.common.model import MappedBase
from backend.src.database.db import get_database_url


# --------------------------------------------------------------------- 状态映射
def test_status_follows_done_reason() -> None:
    assert status_for(done={'reason': 'complete'}, outcome='ok') == 'ok'
    assert status_for(done={'reason': 'empty_result'}, outcome='empty') == 'empty'
    # max_tokens：回答被截断但已产出，仍算成功完成
    assert status_for(done={'reason': 'max_tokens'}, outcome='ok') == 'ok'


def test_status_distinguishes_error_from_client_cancel() -> None:
    assert status_for(done=None, outcome='error') == 'error'
    assert status_for(done=None, outcome='ok') == 'cancelled'


def test_outcome_labels_cover_cancelled_stream() -> None:
    assert _outcome(errored=True, meta_hits=3) == 'error'
    assert _outcome(errored=False, meta_hits=None) == 'cancelled'
    assert _outcome(errored=False, meta_hits=0) == 'empty'
    assert _outcome(errored=False, meta_hits=2) == 'ok'


# --------------------------------------------------------------------- 字段构造
def test_build_run_fields_truncates_query_and_clamps_counts() -> None:
    fields = build_run_fields(
        run_id='run-1',
        kb_names=['dev', 'acme'],
        plugin_namespace=None,
        query='  ' + 'x' * (RUN_QUERY_MAX + 100) + '  ',
        status='ok',
        steps=[{'name': 'plan', 'detail': ''}],
        usage={'total_tokens': 3},
        model_spec='acme:qwen-max',
        tool_calls=-1,
        rewrites=-2,
    )
    assert len(fields['query']) == RUN_QUERY_MAX
    assert fields['kb_names'] == ['dev', 'acme']
    assert fields['plugin_namespace'] == 'core'  # 未指定 → 默认部署域
    assert fields['tool_call_count'] == 0
    assert fields['rewrite_count'] == 0
    assert fields['model_spec'] == 'acme:qwen-max'
    assert fields['usage'] == {'total_tokens': 3}


def test_build_run_fields_defaults_are_json_safe() -> None:
    fields = build_run_fields(run_id='run-2', kb_names=[], plugin_namespace='acme', query='', status='ok')
    assert fields['steps'] == []
    assert fields['usage'] == {}
    assert fields['model_spec'] is None


def test_record_agent_run_never_raises_on_broken_session() -> None:
    """审计是 best-effort：即使会话不可用（对象没有 add/commit）也不能抛出。"""

    async def _run() -> None:
        await record_agent_run(cast('Any', object()), run_id='run-3', query='问')

    asyncio.run(_run())


# --------------------------------------------------------------------- 真实落库
async def _create_all(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(MappedBase.metadata.create_all)


async def _with_session(coro: Any) -> Any:
    """独立 NullPool 引擎 + 会话（与 retrieval 集成测试同法，避免跨事件循环复用连接池）。"""
    engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            return await coro(session)
    finally:
        await engine.dispose()


async def _latest_run(session: AsyncSession) -> AgentRun | None:
    stmt = (
        select(AgentRun)
        .where(AgentRun.plugin_namespace == 'agent_audit_test')
        .order_by(AgentRun.created_time.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalars().first()


async def _pop_latest_run(session: AsyncSession) -> AgentRun | None:
    """取最后一行并删除（用例不留数据残留）。"""
    row = await _latest_run(session)
    if row is not None:
        await session.execute(delete(AgentRun).where(AgentRun.run_id == row.run_id))
        await session.commit()
    return row


@pytest.fixture(scope='module', autouse=True)
def _pg_available() -> Any:
    """真实 PG 不可达则整模块 skip（与 retrieval 集成测试同一约定）。"""
    import backend.src.app.agent.model.agent_run  # ruff: ignore[unused-import]  注册 agent_runs 到 metadata

    engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
    try:
        asyncio.run(_create_all(engine))
    except Exception as exc:  # pragma: no cover - 本地环境相关
        pytest.skip(f'真实 PG 不可达，跳过 agent_runs 落库用例: {exc}')
    finally:
        asyncio.run(engine.dispose())
    yield


def test_astream_persists_run_row(monkeypatch: pytest.MonkeyPatch) -> None:
    """一次成功运行落一行：状态/轨迹/工具计数/用量与 done 一致。"""
    service = _service()
    monkeypatch.setattr('backend.src.app.agent.service.agent_service.knowledge_base_dao', _kb_dao(found=True))

    async def _case(session: AsyncSession) -> AgentRun | None:
        events = [
            event
            async for event in service.astream(
                session, kb_name='dev', param=_param(), plugin_namespace='agent_audit_test'
            )
        ]
        assert events[-1][0] == 'done'
        return await _pop_latest_run(session)

    row = asyncio.run(_with_session(_case))
    assert row is not None
    UUID(row.run_id)  # run_id 是 UUID 字符串
    assert row.status == 'ok'
    assert row.kb_names == ['dev']
    assert row.query == '问'
    assert row.model_spec == 'acme:qwen-max'
    assert row.tool_call_count == 2
    assert row.rewrite_count == 0
    assert [step['name'] for step in row.steps] == ['plan', 'act', 'grade', 'generate']
    assert row.usage['total_tokens'] == 2


def test_error_run_is_audited_with_error_status(monkeypatch: pytest.MonkeyPatch) -> None:
    """语义错误（KB 不存在）同样落审计行，状态 error，避免「失败的运行查无此人」。"""
    service = _service()
    monkeypatch.setattr('backend.src.app.agent.service.agent_service.knowledge_base_dao', _kb_dao(found=False))

    async def _case(session: AsyncSession) -> AgentRun | None:
        events = [
            event
            async for event in service.astream(
                session, kb_name='missing', param=_param(), plugin_namespace='agent_audit_test'
            )
        ]
        assert events[0][0] == 'error'
        return await _pop_latest_run(session)

    row = asyncio.run(_with_session(_case))
    assert row is not None
    assert row.status == 'error'
    assert row.steps == []
    assert row.tool_call_count == 0
