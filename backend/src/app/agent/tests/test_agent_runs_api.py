"""Runs API 冒烟（agent 层设计 §4.1；③ 1.12/1.13）。

两个必须钉住的点：

1. **属主隔离**：Run 行没有 uid（提交身份在排队记录上），接口必须经排队记录求交，
   别人的 run_id 一律 404——否则 run_id 就成了存在性探针；
2. **取消幂等**：重复取消返回当前状态而不是 409；排队中的 Run 取消后**要唤醒队头**，
   否则同键后面的 Run 会排在一条死记录后面。

离线做法与其他域一致：覆盖 JWT/RBAC/用户依赖，只留真实 PG（Run 是状态机，事实源在库里）。
"""

from __future__ import annotations

import asyncio
import contextlib

from typing import TYPE_CHECKING, Any

import pytest

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from starlette.testclient import TestClient

from backend.main import app
from backend.src.app.agent.model.agent_run import AgentRun
from backend.src.app.agent.model.agent_run_request import AgentRunRequest
from backend.src.app.agent.schema.agent import AgentParam
from backend.src.app.agent.service import agent_run_service as agent_run_service_module
from backend.src.app.agent.service.run_payload import build_run_payload
from backend.src.app.agent.service.run_submission_service import RunSubmissionService
from backend.src.app.kb.deps import get_current_tenant, get_user_context
from backend.src.app.kb.service.acl.scope import UserContext
from backend.src.common.security.jwt import jwt_authentication_verify
from backend.src.common.security.rbac import rbac_verify
from backend.src.core.config import settings
from backend.src.database.db import get_database_url, get_db
from backend.src.middleware import request_state_middleware as rsm

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

_NS = 'agent_runs_api_test'
_UID = 'u-api'
_OTHER_UID = 'u-other'

#: TestClient 的 base_url 已含 ``FASTAPI_API_V1_PATH``，这里只写域内路径
_RUNS_PREFIX = '/agent/runs'


@pytest.fixture(scope='module')
def client() -> TestClient:
    """模块级共享实例。

    **刻意不用上下文管理**：``with TestClient(...)`` 会跑应用 lifespan，进而动用
    全局引擎（摄取/建表等启动动作）；那个引擎的池里可能躺着别的测试循环留下的连接，
    一碰就是 ``Future attached to a different loop``。本模块只用按请求新建的
    NullPool 会话（见 ``_loop_scoped_db``），所以不需要 lifespan。
    """
    return TestClient(app, base_url=f'http://testserver{settings.FASTAPI_API_V1_PATH}')


@pytest.fixture(autouse=True)
def _noop_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    """端点到 handler 前就停：JWT/RBAC 空转 + 当前用户/租户换成罐头。"""
    monkeypatch.setitem(app.dependency_overrides, jwt_authentication_verify, lambda: None)
    monkeypatch.setitem(app.dependency_overrides, rbac_verify, lambda: None)

    async def _noop_ip(request: Any) -> Any:  # ruff: ignore[unused-async]  # 替换 parse_ip_info（被 await 调用）
        return type('IP', (), {'ip': '127.0.0.1', 'country': '', 'region': '', 'city': ''})()

    monkeypatch.setattr(rsm, 'parse_ip_info', _noop_ip)
    app.dependency_overrides[get_user_context] = lambda: UserContext(
        user_id=_UID, namespace=_NS, dept_id=None, roles=[]
    )
    app.dependency_overrides[get_current_tenant] = lambda x_plugin_namespace=None: _NS
    # 会话工厂按事件循环隔离：本模块的请求循环与 asyncio.run 的循环不是同一个，
    # 共用一个池化引擎必然跨循环复用连接（见 client fixture 的说明）
    monkeypatch.setitem(app.dependency_overrides, get_db, _loop_scoped_db)


async def _loop_scoped_db() -> AsyncIterator[Any]:
    """每次请求一个 NullPool 引擎（测试专用）。

    不能沿用全局那个池化测试引擎：``TestClient`` 的请求可能落在不同事件循环上，
    池里留着上一个循环的连接就会炸 ``Future attached to a different loop``。
    这里按请求建、按请求销毁，连接生命周期不跨循环。
    """
    engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
    try:
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            yield session
    finally:
        await engine.dispose()


# --------------------------------------------------------------------- PG 工具
@contextlib.asynccontextmanager
async def _db() -> AsyncIterator[tuple[AsyncEngine, async_sessionmaker[Any]]]:
    engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
    try:
        yield engine, async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()


async def _cleanup() -> None:
    async with _db() as (_, factory):
        async with factory() as session:
            await session.execute(delete(AgentRunRequest).where(AgentRunRequest.plugin_namespace == _NS))
            await session.execute(delete(AgentRun).where(AgentRun.plugin_namespace == _NS))
            await session.commit()


async def _submit(*, thread: str, uid: str = _UID) -> str:
    payload = build_run_payload(kb_name='kb-a', param=AgentParam.model_validate({'query_text': '问'}), namespace=_NS)
    async with _db() as (_, factory):
        async with factory() as session:
            run_id, _ = await RunSubmissionService().submit(
                session, payload=payload, uid=uid, agent_slug='default', thread_id=thread
            )
    return run_id


async def _mark_running(run_id: str) -> None:
    async with _db() as (_, factory):
        async with factory() as session:
            run = await session.get(AgentRun, run_id)
            assert run is not None
            run.status = 'running'
            await session.commit()


# --------------------------------------------------------------------- 用例
def test_get_run_returns_detail(client: TestClient) -> None:
    run_id = asyncio.run(_submit(thread='api-get'))
    try:
        response = client.get(f'{_RUNS_PREFIX}/{run_id}')
        assert response.status_code == 200
        data = response.json()['data']
        assert data['run_id'] == run_id
        assert data['status'] == 'queued'
        assert data['has_result'] is False
        assert data['kb_names'] == ['kb-a']
        assert data['plugin_namespace'] == _NS
    finally:
        asyncio.run(_cleanup())


def test_other_users_run_is_404(client: TestClient) -> None:
    """别人的 run_id 必须 404：不区分「不存在」与「不是你的」。"""
    run_id = asyncio.run(_submit(uid=_OTHER_UID, thread='api-foreign'))
    try:
        assert client.get(f'{_RUNS_PREFIX}/{run_id}').status_code == 404
        assert client.post(f'{_RUNS_PREFIX}/{run_id}/cancel').status_code == 404
    finally:
        asyncio.run(_cleanup())


def test_cancel_queued_run_settles_request_and_wakes_next(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    run_id, follower = asyncio.run(_submit_two('api-cancel'))
    dispatched: list[str] = []

    class _Queue:
        def dispatch_best_effort(self, next_run_id: str, **kwargs: Any) -> bool:
            dispatched.append(next_run_id)
            return True

    monkeypatch.setattr(agent_run_service_module, 'get_run_queue_service', lambda: _Queue())
    try:
        response = client.post(f'{_RUNS_PREFIX}/{run_id}/cancel')
        assert response.status_code == 200
        assert response.json()['data'] == {'run_id': run_id, 'status': 'cancelled', 'accepted': True}
        # 队列空位要让出来：排在后面的 Run 必须被唤醒，否则永远停在 pending
        assert dispatched == [follower]

        again = client.post(f'{_RUNS_PREFIX}/{run_id}/cancel')
        assert again.json()['data']['accepted'] is False, '取消必须幂等'
        assert again.json()['data']['status'] == 'cancelled'
    finally:
        asyncio.run(_cleanup())


def test_cancel_running_run_requests_convergence(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """在跑的 Run 不能直接置终态：转 ``cancel_requested``，由 worker 合成收敛（D92）。"""
    run_id = asyncio.run(_submit(thread='api-running'))
    signalled: list[str] = []

    class _Queue:
        async def request_cancel(self, target: str) -> None:
            signalled.append(target)

        def dispatch_best_effort(self, next_run_id: str, **kwargs: Any) -> bool:
            return True

    monkeypatch.setattr(agent_run_service_module, 'get_run_queue_service', lambda: _Queue())
    try:
        asyncio.run(_mark_running(run_id))
        response = client.post(f'{_RUNS_PREFIX}/{run_id}/cancel')
        assert response.json()['data']['status'] == 'cancel_requested'
        assert response.json()['data']['accepted'] is True
        assert signalled == [run_id]
    finally:
        asyncio.run(_cleanup())


async def _submit_two(thread: str) -> tuple[str, str]:
    """同一排队键连续提交两次（第一次派发、第二次排队）。"""
    first = await _submit(thread=thread)
    second = await _submit(thread=thread)
    return first, second
