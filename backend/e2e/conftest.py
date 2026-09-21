"""e2e 接口测试基建：进程内 ASGI 栈 + 单事件循环 + 真实身份工厂。

设计见 ``docs/specs/2026-09-21-backend-api-test-spec.md`` §3。三条要点：

1. **进程内打真实 ASGI 栈**（``httpx.ASGITransport``）：中间件链、依赖注入、路由全走，
   不需要 uvicorn；只需依赖容器（``task deps-up``）。
2. **单事件循环**：lifespan 由 session 级 async fixture 进入一次，会把 anyio 测试
   runner 的租约钉住整场（``anyio.pytest_plugin.get_runner`` 的引用计数），DB/Redis/
   Milvus 连接不会跨循环失效。这是不用 ``TestClient`` 的原因——同步 client 与
   ``asyncio.run()`` 造数会落在两个循环上。
3. **不 override 任何鉴权依赖**：身份由 ``support/identity.py`` 造真实用户并签发真实
   token，否则 ACL/RBAC 整层被跳过，权限用例失去意义。

前置：``task deps-up``（PG/Redis/Milvus/MinIO）。注意 `import backend.main` 会走
插件发现，Redis 不可达时 ``RedisCli.init`` 直接 ``sys.exit``（框架 fail-fast），
所以 e2e 套件**必须先起依赖**，这不是可跳过项。lifespan 起不来（PG/Milvus/MinIO
异常）才走 skip 路径。
"""

from __future__ import annotations

import asyncio

from contextlib import asynccontextmanager
from pathlib import Path
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import pytest

from httpx import ASGITransport, AsyncClient

from backend.e2e.support import identity, seed
from backend.src.core.config import settings
from backend.src.tests.utils.db import async_test_db_session

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Awaitable, Callable

    from fastapi import FastAPI

    from backend.e2e.support.identity import Identity

_E2E_DIR = Path(__file__).resolve().parent
_SEED_SQL = Path(__file__).resolve().parents[1] / 'src' / 'sql' / 'postgresql' / 'init_test_data.sql'


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """e2e 用例全部是协程：就地补 anyio 标记（避免每个模块重复 pytestmark）。"""
    for item in items:
        path = Path(str(getattr(item, 'path', '') or ''))
        if path.is_absolute() and _E2E_DIR in path.resolve().parents:
            item.add_marker(pytest.mark.anyio)


@pytest.fixture(scope='session')
def anyio_backend() -> str:
    """单一后端：asyncio（trio 未安装，不参量化）。"""
    return 'asyncio'


# --------------------------------------------------------------------------- 依赖栈 bootstrap


def _db_kwargs(database: str) -> dict[str, Any]:
    return {
        'host': settings.DATABASE_HOST,
        'port': settings.DATABASE_PORT,
        'user': settings.DATABASE_USER,
        'password': settings.DATABASE_PASSWORD,
        'database': database,
        'timeout': 5,
    }


async def _ensure_database() -> None:
    """幂等确保 ``ragf_test`` 存在（与域内 PG 集成测试同策略）。"""
    import asyncpg

    conn = await asyncpg.connect(**_db_kwargs('postgres'))
    try:
        name = f'{settings.DATABASE_SCHEMA}_test'
        exists = await conn.fetchval('SELECT 1 FROM pg_database WHERE datname = $1', name)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{name}"')
    finally:
        await conn.close()


async def _ensure_schema() -> None:
    """建表：先导入全部模型（``model/__init__.py`` 聚合导出）再 create_all。"""
    from backend.src.common.model import MappedBase
    from backend.src.utils.dynamic_import import get_app_models

    get_app_models()
    async with async_test_db_session.begin() as session:
        await session.run_sync(MappedBase.metadata.create_all)


async def _ensure_seed() -> None:
    """导入 init_test_data.sql（幂等：仅在 sys_dept 为空时执行）。"""
    import asyncpg

    conn = await asyncpg.connect(**_db_kwargs(f'{settings.DATABASE_SCHEMA}_test'))
    try:
        if await conn.fetchval('SELECT count(*) FROM sys_dept'):
            return
        sql = await asyncio.to_thread(_SEED_SQL.read_text, 'utf-8')
        await conn.execute(sql)
    finally:
        await conn.close()


@asynccontextmanager
async def _running_app() -> AsyncIterator[FastAPI]:
    """进入 lifespan；依赖不可达一律 skip（本地未起 docker compose 时不失败）。"""
    # 延迟导入：模块级导入会在 Redis 不可达时（插件发现 fail-fast）炸掉整个收集阶段
    from backend.main import app

    try:
        await _ensure_database()
        await _ensure_schema()
        await _ensure_seed()
    except Exception as exc:  # pragma: no cover - 环境相关
        pytest.skip(f'ragf_test 不可用（PG 未启动或不可达），跳过 e2e：{exc!r}')

    lifespan = app.router.lifespan_context(app)
    try:
        await lifespan.__aenter__()
    except Exception as exc:  # pragma: no cover - 环境相关
        pytest.skip(f'应用 lifespan 启动失败（PG/Redis/Milvus/MinIO 不可达），跳过 e2e：{exc!r}')
    try:
        yield app
    finally:
        await lifespan.__aexit__(None, None, None)


# --------------------------------------------------------------------------- 夹具


@pytest.fixture(scope='session')
async def e2e_app() -> AsyncIterator[FastAPI]:
    async with _running_app() as running:
        yield running


@pytest.fixture(scope='session')
async def client(e2e_app: FastAPI) -> AsyncIterator[AsyncClient]:
    """进程内 HTTP 客户端。路径前缀显式拼接（``support.api.API``），不用 base_url 合并。"""
    async with AsyncClient(transport=ASGITransport(app=e2e_app), base_url='http://e2e') as http:
        yield http


@pytest.fixture(scope='session')
async def identities(client: AsyncClient) -> AsyncIterator[dict[str, Identity]]:
    """主体矩阵 + 已签发 token（session 级共享，结束后清理）。

    造数事务必须在 yield 前提交（try/finally 形式）：请求侧用的是另一个连接，
    未提交的 sys_user/sys_dept 行对应用不可见。
    """
    async with async_test_db_session.begin() as session:
        matrix = await identity.build_identities(session)
    try:
        yield matrix
    finally:
        async with async_test_db_session.begin() as session:
            await identity.drop_identities(session)


@pytest.fixture(scope='session')
def worker_ready() -> bool:
    """Celery Worker 是否在消费（链路用例的前置）。"""
    from backend.src.app.task.celery import celery_app

    try:
        return bool(celery_app.control.inspect(timeout=2.0).ping())
    except Exception:  # pragma: no cover - broker 不可达
        return False


@pytest.fixture
def require_worker(request: pytest.FixtureRequest) -> None:
    """需要异步摄取链路的用例：worker 不在就跳过，而不是等超时。"""
    if not request.getfixturevalue('worker_ready'):
        pytest.skip('Celery Worker 未运行（先执行 task worker），跳过摄取链路用例')


@pytest.fixture
async def make_kb(client: AsyncClient, identities: dict[str, Identity]) -> AsyncIterator[Callable[..., Awaitable[str]]]:
    """函数级独立 KB 工厂：``e2e_{uuid}`` 命名 + teardown 级联删除。"""
    created: list[str] = []
    owner_headers = identities['owner'].headers

    async def _make(**overrides: Any) -> str:
        kb_name = str(overrides.pop('kb_name', None) or f'e2e_{uuid4().hex[:8]}')
        await seed.create_kb(client, owner_headers, kb_name, **overrides)
        created.append(kb_name)
        return kb_name

    yield _make
    for kb_name in created:
        await seed.delete_kb_quiet(client, owner_headers, kb_name)
