"""ACL 巡检测试（kb-ownership-and-acl-v2 spec §7.3，Phase 4）。

- _mirror_mismatch：镜像漂移判定纯函数
- delete_expired：过期条目清理（真实 PG 集成，DB 不可达时跳过）
"""

from __future__ import annotations

import asyncio

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

import pytest

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from backend.src.app.kb.crud.crud_acl import kb_acl_dao
from backend.src.app.kb.model import KbAcl
from backend.src.app.kb.tasks.tasks import _mirror_mismatch
from backend.src.app.kb.tests.pg_schema import ensure_test_database, reset_test_schema
from backend.src.database.db import get_database_url

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncEngine

NOW = datetime.now(UTC)


class TestMirrorMismatch:
    def test_none_mirror_not_mismatch(self) -> None:
        assert _mirror_mismatch(None, {'visibility': 'restricted', 'owner_id': '', 'groups': []}) is False

    def test_identical_not_mismatch(self) -> None:
        actual = {'visibility': 'restricted', 'owner_id': 'u1', 'groups': ['10', 'u1']}
        assert _mirror_mismatch(actual, {'visibility': 'restricted', 'owner_id': 'u1', 'groups': ['u1', '10']}) is False

    def test_visibility_drift(self) -> None:
        actual = {'visibility': 'public', 'owner_id': '', 'groups': []}
        assert _mirror_mismatch(actual, {'visibility': 'restricted', 'owner_id': '', 'groups': []}) is True

    def test_groups_drift_order_insensitive(self) -> None:
        actual = {'visibility': 'restricted', 'owner_id': '', 'groups': ['10']}
        assert _mirror_mismatch(actual, {'visibility': 'restricted', 'owner_id': '', 'groups': ['10', '20']}) is True


@pytest.fixture(scope='module', autouse=True)
def _pg_integration_env() -> Any:
    try:
        asyncio.run(_ensure_test_db())
    except Exception as exc:  # pragma: no cover - 本地环境相关
        pytest.skip(f'真实 PG 不可达，跳过集成测试: {exc}')
    import backend.src.app.kb.model.acl  # ruff: ignore[unused-import]

    engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
    asyncio.run(_prepare_schema(engine))
    asyncio.run(engine.dispose())


async def _ensure_test_db() -> None:
    """委托共享助手（定义见 `pg_schema.py`）。"""
    await ensure_test_database()


async def _prepare_schema(engine: AsyncEngine) -> None:
    """委托共享助手：按模型元数据重建全部业务表（见 `pg_schema.py`）。"""
    await reset_test_schema(engine)


def test_delete_expired_removes_only_expired() -> None:
    """过期条目清理：过期删除、未过期与永久条目保留（验收 6 的存储侧收口）。"""

    async def _run() -> tuple[int, int]:
        engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as session:
                session.add_all([
                    KbAcl(
                        kb_name='reconcile_kb',
                        plugin_namespace='core',
                        principal_type='user',
                        principal_id='u1',
                        perm='read',
                        expires_at=NOW - timedelta(seconds=1),
                    ),
                    KbAcl(
                        kb_name='reconcile_kb',
                        plugin_namespace='core',
                        principal_type='user',
                        principal_id='u2',
                        perm='manage',
                        expires_at=NOW + timedelta(hours=1),
                    ),
                    KbAcl(
                        kb_name='reconcile_kb',
                        plugin_namespace='core',
                        principal_type='dept',
                        principal_id='10',
                        perm='read',
                    ),
                ])
                await session.flush()
                removed = await kb_acl_dao.delete_expired(session, now=NOW)
                remaining = await kb_acl_dao.list_entries(session, kb_name='reconcile_kb', plugin_namespace='core')
                return removed, len(remaining)
        finally:
            await engine.dispose()

    removed, remaining = asyncio.run(_run())
    assert removed == 1
    assert remaining == 2
