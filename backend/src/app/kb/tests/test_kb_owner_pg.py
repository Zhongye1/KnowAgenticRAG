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
from backend.src.app.kb.schema.acl import KBAclEntry
from backend.src.app.kb.schema.knowledge_base import KBCreateParam
from backend.src.app.kb.service.acl.entries import acl_entry_service
from backend.src.app.kb.service.acl.resolver import Perm, resolve_kb_perm
from backend.src.app.kb.service.acl.scope import UserContext
from backend.src.app.kb.service.kb_service import kb_service
from backend.src.app.kb.tests.pg_schema import ensure_test_database, reset_test_schema
from backend.src.common.exception import errors
from backend.src.database.db import get_database_url

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
    """委托共享助手（定义见 `pg_schema.py`）。"""
    await ensure_test_database()


async def _prepare_schema(engine: AsyncEngine) -> None:
    """委托共享助手重建 schema，再种入 Owner 转移用到的 sys_user 行。

    `sys_user` 属 admin 域（Base 元数据，不在 `MappedBase.create_all` 内），
    由 `pg_schema.reset_test_schema` 建最小结构，行由本模块自己种。
    """
    await reset_test_schema(engine)
    async with engine.begin() as conn:
        await conn.execute(
            text(
                'INSERT INTO sys_user '
                '(id, uuid, username, nickname, status, is_superuser, is_staff, is_multi_login,'
                ' join_time, created_time, deleted) VALUES '
                "(11, gen_random_uuid(), 'kbx-11', 'KB 转移用户11', 1, false, false, false, now(), now(), 0), "
                "(22, gen_random_uuid(), 'kbx-22', 'KB 转移用户22', 1, false, false, false, now(), now(), 0) "
                'ON CONFLICT (id) DO NOTHING'
            )
        )


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


def _run_transfer(*, owner_id: str | None, new_owner_id: str, operator: str = '1') -> Any:
    """在独立会话内执行所有权转移（不 commit，退出即回滚）。"""

    async def _run() -> Any:
        engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as session:
                await kb_service.create(
                    db=session,
                    obj=KBCreateParam.model_validate({'kb_name': KB_NAME, 'display_name': '转移测试库'}),
                    owner_id=owner_id,
                )
                operator_ctx = UserContext(user_id=operator, namespace='core')
                try:
                    result = await acl_entry_service.transfer_owner(
                        db=session, kb_name=KB_NAME, new_owner_id=new_owner_id, user=operator_ctx
                    )
                except errors.RequestError as exc:
                    return {'error': 'RequestError', 'msg': exc.msg}
                except errors.ConflictError as exc:
                    return {'error': 'ConflictError', 'msg': exc.msg}
                entries = await kb_acl_dao.list_entries(session, kb_name=KB_NAME)
                audits = await acl_audit_dao.list_by_kb(session, kb_name=KB_NAME)
                old_perm = await resolve_kb_perm(
                    session, user_id=str(owner_id) if owner_id else '0', dept_id=None, roles=[], kb_name=KB_NAME
                )
                new_perm = await resolve_kb_perm(session, user_id=new_owner_id, dept_id=None, roles=[], kb_name=KB_NAME)
                return {
                    'result': result,
                    'entries': [(e.principal_type, e.principal_id, e.perm, e.effect) for e in entries],
                    'actions': [a.action for a in audits],
                    'old_perm': old_perm,
                    'new_perm': new_perm,
                }
        finally:
            await engine.dispose()

    return asyncio.run(_run())


def test_transfer_changes_owner_entries_and_audit() -> None:
    """转移（spec §7.1）：owner 换绑、旧 owner 条目回收、其余条目保留、kb_transfer 审计。"""
    out = _run_transfer(owner_id='42', new_owner_id='11')
    assert out['result']['previous_owner_id'] == '42'
    assert out['result']['owner_id'] == '11'
    assert ('user', '42', 'owner', 'allow') not in out['entries']
    assert ('user', '11', 'owner', 'allow') in out['entries']
    assert out['actions'][0] == 'kb_transfer'  # list_by_kb 倒序，最新在前
    assert out['old_perm'] is None  # 旧 Owner 失去 owner 条目且无其他授权 → 不可见
    assert out['new_perm'] == Perm.OWNER  # 求值函数即时生效


def test_transfer_keeps_unrelated_entries() -> None:
    """非 owner 条目（部门授权）在转移后保留。"""

    async def _run() -> list[tuple[str, str, str]]:
        engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as session:
                await kb_service.create(
                    db=session,
                    obj=KBCreateParam.model_validate({'kb_name': KB_NAME, 'display_name': '转移测试库'}),
                    owner_id='42',
                )
                await kb_acl_dao.replace_entries(
                    session,
                    kb_name=KB_NAME,
                    entries=[KBAclEntry(principal_type='dept', principal_id='10', perm='read')],
                    plugin_namespace='core',
                )
                await acl_entry_service.transfer_owner(
                    db=session, kb_name=KB_NAME, new_owner_id='11', user=UserContext(user_id='1', namespace='core')
                )
                entries = await kb_acl_dao.list_entries(session, kb_name=KB_NAME)
                return [(e.principal_type, e.principal_id, e.perm) for e in entries]
        finally:
            await engine.dispose()

    entries = asyncio.run(_run())
    assert ('dept', '10', 'read') in entries
    assert ('user', '11', 'owner') in entries
    assert ('user', '42', 'owner') not in entries


def test_transfer_to_missing_user_rejected() -> None:
    out = _run_transfer(owner_id='42', new_owner_id='999')
    assert out == {'error': 'RequestError', 'msg': '新 Owner 用户不存在'}


def test_transfer_to_self_rejected() -> None:
    out = _run_transfer(owner_id='11', new_owner_id='11')
    assert out == {'error': 'ConflictError', 'msg': '该用户已是知识库 Owner'}


def test_transfer_orphan_kb_assigns_owner() -> None:
    """无主库（owner_id 为空）可直接指定 Owner。"""
    out = _run_transfer(owner_id=None, new_owner_id='22')
    assert out['result']['previous_owner_id'] is None
    assert out['result']['owner_id'] == '22'
    assert out['new_perm'] == Perm.OWNER
