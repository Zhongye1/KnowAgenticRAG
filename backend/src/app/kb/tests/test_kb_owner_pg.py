"""建库即 Owner 的真实 PostgreSQL 集成测试（kb-ownership-and-acl-v2 spec Phase 1 出口条件）。

验证 kb_service.create(owner_id=...)：owner_id 落地 knowledge_bases、同一事务写入
perm=owner 的 KB 级 ACL 条目、rag_acl_audit 追加 kb_owner_init 审计；无 owner 建库
则三者皆缺省。数据在会话关闭时回滚，不留残留；DB 不可达时整模块跳过。
"""

from __future__ import annotations

import asyncio

from typing import TYPE_CHECKING, Any

import pytest

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from backend.src.app.kb.crud.crud_acl import kb_acl_dao
from backend.src.app.kb.crud.crud_acl_audit import acl_audit_dao
from backend.src.app.kb.schema.knowledge_base import KBCreateParam
from backend.src.app.kb.service.kb_service import kb_service
from backend.src.core.config import settings
from backend.src.database.db import MappedBase, get_database_url

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncEngine

KB_NAME = 'aclv2_owner_test'
OWNER_ID = '42'


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
    """幂等：确保 ragf_test 库存在（与 test_integration_pg 同策略）。"""
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
    """测试库 schema 对齐 v2：ACL v1 表为破坏性重构，DROP 后由 create_all 重建；
    knowledge_bases 旧表幂等补列（与 ragf_schema_migrations 对齐）。"""
    async with engine.begin() as conn:
        await conn.execute(text('DROP TABLE IF EXISTS rag_kb_acl'))
        await conn.execute(text('DROP TABLE IF EXISTS rag_doc_acl'))
        for stmt in (
            'ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS owner_id VARCHAR(64)',
            'ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE NOT NULL',
        ):
            await conn.execute(text(stmt))
        await conn.run_sync(MappedBase.metadata.create_all)


def _run_create(*, owner_id: str | None) -> tuple[str | None, bool, list[tuple[str, str, str, str]], list[str]]:
    """在独立会话内建库（不 commit，退出即回滚），并把结果存到外部断言。"""

    async def _run() -> tuple[str | None, bool, list[tuple[str, str, str, str]], list[str]]:
        engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as session:
                kb = await kb_service.create(
                    db=session,
                    obj=KBCreateParam.model_validate({'kb_name': KB_NAME, 'display_name': 'ACL v2 Owner 测试库'}),
                    owner_id=owner_id,
                )
                entries = await kb_acl_dao.list_entries(session, kb_name=kb.kb_name)
                audits = await acl_audit_dao.list_by_kb(session, kb_name=kb.kb_name)
                return (
                    kb.owner_id,
                    kb.is_public,
                    [(e.principal_type, e.principal_id, e.perm, e.effect) for e in entries],
                    [a.action for a in audits],
                )
        finally:
            await engine.dispose()

    return asyncio.run(_run())


def test_create_with_owner_writes_owner_entry_and_audit() -> None:
    owner_id, is_public, entries, actions = _run_create(owner_id=OWNER_ID)
    assert owner_id == OWNER_ID
    assert is_public is False
    assert entries == [('user', OWNER_ID, 'owner', 'allow')]
    assert actions == ['kb_owner_init']


def test_create_without_owner_writes_no_acl() -> None:
    owner_id, _is_public, entries, actions = _run_create(owner_id=None)
    assert owner_id is None
    assert entries == []
    assert actions == []
