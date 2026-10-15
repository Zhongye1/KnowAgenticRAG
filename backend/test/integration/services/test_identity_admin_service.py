"""真实 PostgreSQL 上的组织身份用例事务测试。"""

from __future__ import annotations

import asyncio
import os
import uuid

import pytest
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.services.identity_admin_service import (
    DepartmentAdminCreation,
    IdentityConflictError,
    SystemAlreadyInitializedError,
    create_department_with_admin,
    initialize_system_admin,
)
from ars.storage.postgres.models_business import Base, Department, OperationLog, User

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def test_user_conflict_rolls_back_new_department_and_audit() -> None:
    """管理员插入失败时不得留下无管理员部门。"""

    unique = uuid.uuid4().hex[:12]
    actor_department_name = f"uow-actor-{unique}"
    attempted_department_name = f"uow-attempt-{unique}"
    actor_uid = f"uow_actor_{unique}"
    conflicting_username = f"uow_admin_{unique}"
    conflicting_uid = f"uow_other_{unique}"
    engine = create_async_engine(os.environ["POSTGRES_URL"], pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    actor_id: int | None = None
    conflict_id: int | None = None
    actor_department_id: int | None = None

    try:
        async with factory() as db:
            actor_department = Department(name=actor_department_name)
            db.add(actor_department)
            await db.flush()
            actor_department_id = actor_department.id
            actor = User(
                username=actor_uid,
                uid=actor_uid,
                password_hash="$argon2id$placeholder",
                role="superadmin",
                department_id=actor_department.id,
            )
            conflict = User(
                username=conflicting_username,
                uid=conflicting_uid,
                password_hash="$argon2id$placeholder",
                role="user",
                department_id=actor_department.id,
            )
            db.add_all([actor, conflict])
            await db.commit()
            actor_id = actor.id
            conflict_id = conflict.id

        async with factory() as db:
            with pytest.raises(IdentityConflictError):
                await create_department_with_admin(
                    db,
                    name=attempted_department_name,
                    description="must rollback",
                    admin_uid=conflicting_username,
                    admin_password="valid-password-123",
                    admin_phone=None,
                    actor_user_id=actor_id,
                )

        async with factory() as db:
            attempted_department = await db.scalar(
                select(Department).where(Department.name == attempted_department_name)
            )
            attempted_admin = await db.scalar(select(User).where(User.uid == conflicting_username))
            audit = await db.scalar(
                select(OperationLog).where(
                    OperationLog.user_id == actor_id,
                    OperationLog.operation == "创建部门",
                    OperationLog.details.contains(attempted_department_name),
                )
            )

        assert attempted_department is None
        assert attempted_admin is None
        assert audit is None
    finally:
        async with factory() as db:
            if actor_id is not None:
                await db.execute(delete(OperationLog).where(OperationLog.user_id == actor_id))
            ids = [item for item in (actor_id, conflict_id) if item is not None]
            if ids:
                await db.execute(delete(User).where(User.id.in_(ids)))
            if actor_department_id is not None:
                await db.execute(delete(Department).where(Department.id == actor_department_id))
            await db.commit()
        await engine.dispose()


async def test_required_audit_failure_rolls_back_department_and_admin() -> None:
    """强制审计失败必须回滚同一事务中的全部业务事实。"""

    unique = uuid.uuid4().hex[:12]
    department_name = f"uow-audit-{unique}"
    admin_uid = f"uow_audit_{unique}"
    engine = create_async_engine(os.environ["POSTGRES_URL"], pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with factory() as db:
            with pytest.raises(IntegrityError):
                await create_department_with_admin(
                    db,
                    name=department_name,
                    description="audit must fail",
                    admin_uid=admin_uid,
                    admin_password="valid-password-123",
                    admin_phone=None,
                    actor_user_id=-1,
                )

        async with factory() as db:
            department = await db.scalar(select(Department).where(Department.name == department_name))
            admin = await db.scalar(select(User).where(User.uid == admin_uid))

        assert department is None
        assert admin is None
    finally:
        async with factory() as db:
            await db.execute(delete(OperationLog).where(OperationLog.user_id == -1))
            await db.execute(delete(User).where(User.uid == admin_uid))
            await db.execute(delete(Department).where(Department.name == department_name))
            await db.commit()
        await engine.dispose()


async def test_concurrent_initialization_has_exactly_one_atomic_winner() -> None:
    """干净 schema 的并发首次初始化必须只产生一套完整身份事实。"""

    schema = f"pytest_init_{uuid.uuid4().hex[:16]}"
    admin_uids = (f"init_a_{uuid.uuid4().hex[:8]}", f"init_b_{uuid.uuid4().hex[:8]}")
    admin_engine = create_async_engine(os.environ["POSTGRES_URL"], pool_pre_ping=True)
    scoped_engine = None

    try:
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{schema}"'))

        scoped_engine = create_async_engine(
            os.environ["POSTGRES_URL"],
            pool_pre_ping=True,
            connect_args={"server_settings": {"search_path": schema}},
        )
        async with scoped_engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(scoped_engine, expire_on_commit=False)

        async def initialize(uid: str):
            async with factory() as db:
                try:
                    return await initialize_system_admin(
                        db,
                        uid=uid,
                        password="valid-password-123",
                        phone_number=None,
                    )
                except Exception as exc:
                    return exc

        results = await asyncio.gather(*(initialize(uid) for uid in admin_uids))

        async with factory() as db:
            department_count = await db.scalar(select(func.count(Department.id)))
            user_count = await db.scalar(select(func.count(User.id)))
            audit_count = await db.scalar(select(func.count(OperationLog.id)))

        assert sum(isinstance(result, DepartmentAdminCreation) for result in results) == 1
        assert sum(isinstance(result, SystemAlreadyInitializedError) for result in results) == 1
        assert department_count == 1
        assert user_count == 1
        assert audit_count == 1
    finally:
        if scoped_engine is not None:
            await scoped_engine.dispose()
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await admin_engine.dispose()
