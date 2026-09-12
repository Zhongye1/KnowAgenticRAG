"""resolve_kb_perm / resolve_visible_kbs 真实 PostgreSQL 集成测试（v2 spec §9.1）。

覆盖 default deny（验收 1）、role 主体、user 直接授权优先、显式 deny、owner、
公开库、过期条目在 DB 接线路径上的端到端语义（纯函数语义见 test_resolver.py）。
主体以 user/role 直传（dept 祖先链展开依赖 sys_dept，由 API 层验收覆盖）；
数据在会话关闭时回滚，不留残留；DB 不可达时整模块跳过。
"""

from __future__ import annotations

import asyncio

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

import pytest

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from backend.src.app.kb.model import KbAcl, KnowledgeBase
from backend.src.app.kb.service.acl.resolver import Perm, resolve_kb_perm, resolve_visible_kbs
from backend.src.core.config import settings
from backend.src.database.db import MappedBase, get_database_url

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncEngine

NOW = datetime.now(UTC)


@pytest.fixture(scope='module', autouse=True)
def _pg_integration_env() -> Any:
    """跳过条件 + 建表：DB 不可达则整模块 skip。"""
    try:
        asyncio.run(_ensure_test_db())
    except Exception as exc:  # pragma: no cover - 本地环境相关
        pytest.skip(f'真实 PG 不可达，跳过集成测试: {exc}')
    import backend.src.app.kb.model.acl  # ruff: ignore[unused-import]  确保模型注册到 MappedBase.metadata
    import backend.src.app.kb.model.knowledge_base  # ruff: ignore[unused-import]

    engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
    asyncio.run(_prepare_schema(engine))
    asyncio.run(engine.dispose())


async def _ensure_test_db() -> None:
    import asyncpg

    conn = await asyncpg.connect(
        host=settings.DATABASE_HOST,
        port=settings.DATABASE_PORT,
        user=settings.DATABASE_USER,
        password=settings.DATABASE_PASSWORD,
        database='postgres',
        timeout=3,
    )
    try:
        name = f'{settings.DATABASE_SCHEMA}_test'
        exists = await conn.fetchval('SELECT 1 FROM pg_database WHERE datname = $1', name)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{name}"')
    finally:
        await conn.close()


async def _prepare_schema(engine: AsyncEngine) -> None:
    """测试库 schema 对齐 v2（与 test_kb_owner_pg 同策略）。"""
    async with engine.begin() as conn:
        await conn.execute(text('DROP TABLE IF EXISTS rag_kb_acl'))
        await conn.execute(text('DROP TABLE IF EXISTS rag_doc_acl'))
        await conn.execute(text('ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS owner_id VARCHAR(64)'))
        await conn.execute(
            text('ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE NOT NULL')
        )
        await conn.run_sync(MappedBase.metadata.create_all)


def _run_resolve(*, kbs: list[dict[str, Any]], user: dict[str, Any]) -> tuple[dict[str, Perm | None], list[str]]:
    """播种 KB/ACL（会话回滚）→ 单点求值 + 批量求值。"""

    async def _run() -> tuple[dict[str, Perm | None], list[str]]:
        engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as session:
                for kb in kbs:
                    session.add(
                        KnowledgeBase(
                            kb_name=kb['kb_name'],
                            plugin_namespace='core',
                            display_name=kb['kb_name'],
                            owner_id=kb.get('owner_id'),
                            is_public=kb.get('is_public', False),
                        )
                    )
                    for e in kb.get('entries', []):
                        session.add(KbAcl(kb_name=kb['kb_name'], plugin_namespace='core', **e))
                await session.flush()

                single = {
                    kb['kb_name']: await resolve_kb_perm(
                        session,
                        user_id=user['user_id'],
                        dept_id=None,
                        roles=user.get('roles', []),
                        kb_name=kb['kb_name'],
                    )
                    for kb in kbs
                }
                visible = await resolve_visible_kbs(
                    session, user_id=user['user_id'], dept_id=None, roles=user.get('roles', [])
                )
                return single, sorted(visible)
        finally:
            await engine.dispose()

    return asyncio.run(_run())


def test_default_deny_and_role_allow() -> None:
    """无授权记录的库不可见（验收 1）；role allow → read。"""
    kbs = [
        {'kb_name': 'pg_resolver_open'},
        {'kb_name': 'pg_resolver_role', 'entries': [{'principal_type': 'role', 'principal_id': 'r1', 'perm': 'read'}]},
    ]
    single, visible = _run_resolve(kbs=kbs, user={'user_id': 'u1', 'roles': ['r1']})
    assert single['pg_resolver_open'] is None
    assert single['pg_resolver_role'] == Perm.READ
    assert visible == ['pg_resolver_role']


def test_user_allow_overrides_role_and_deny_wins() -> None:
    single, _ = _run_resolve(
        kbs=[
            {
                'kb_name': 'pg_resolver_prio',
                'entries': [
                    {'principal_type': 'role', 'principal_id': 'r1', 'perm': 'manage'},
                    {'principal_type': 'user', 'principal_id': 'u1', 'perm': 'read'},
                ],
            },
            {
                'kb_name': 'pg_resolver_deny',
                'entries': [
                    {'principal_type': 'role', 'principal_id': 'r1', 'perm': 'manage'},
                    {'principal_type': 'user', 'principal_id': 'u1', 'perm': 'read', 'effect': 'deny'},
                ],
            },
        ],
        user={'user_id': 'u1', 'roles': ['r1']},
    )
    assert single['pg_resolver_prio'] == Perm.READ  # user 直接授权覆盖 role 级别
    assert single['pg_resolver_deny'] is None  # deny 优先于一切（D44）


def test_owner_public_and_expiry() -> None:
    single, visible = _run_resolve(
        kbs=[
            {'kb_name': 'pg_resolver_owned', 'owner_id': 'u1'},
            {'kb_name': 'pg_resolver_public', 'is_public': True},
            {
                'kb_name': 'pg_resolver_expired',
                'entries': [
                    {
                        'principal_type': 'user',
                        'principal_id': 'u1',
                        'perm': 'manage',
                        'expires_at': NOW - timedelta(seconds=1),
                    }
                ],
            },
        ],
        user={'user_id': 'u1', 'roles': []},
    )
    assert single['pg_resolver_owned'] == Perm.OWNER
    assert single['pg_resolver_public'] == Perm.READ
    assert single['pg_resolver_expired'] is None  # 过期即失效（验收 6）
    assert visible == ['pg_resolver_owned', 'pg_resolver_public']
