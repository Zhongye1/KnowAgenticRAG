"""部门 repository 的事务行为测试。"""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.repositories.department_repository import DepartmentRepository
from ars.storage.postgres.models_business import APIKey, Base, Department, User
from ars.utils.auth_utils import AuthUtils

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]


@pytest_asyncio.fixture()
async def department_session():
    """创建包含默认部门和待删除部门的 SQLite 会话。"""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        default_department = Department(name="默认部门")
        deleted_department = Department(name="待删除部门")
        session.add_all([default_department, deleted_department])
        await session.flush()
        user = User(
            username="Department User",
            uid="department_user",
            password_hash="$argon2id$placeholder",
            role="user",
            department_id=deleted_department.id,
        )
        session.add(user)
        await session.flush()
        _secret, key_hash, key_prefix = AuthUtils.generate_api_key()
        api_key = APIKey(
            key_hash=key_hash,
            key_prefix=key_prefix,
            name="department key",
            user_id=user.id,
            department_id=deleted_department.id,
            created_by=str(user.id),
        )
        session.add(api_key)
        await session.commit()
        yield session, default_department, deleted_department, user, api_key
    await engine.dispose()


async def test_delete_department_migrates_users_and_revokes_department_keys(department_session):
    """部门删除必须在一次提交中迁移用户并撤销部门 Key。"""
    session, default_department, deleted_department, user, api_key = department_session

    result = await DepartmentRepository(session).delete_and_migrate_users(
        deleted_department.id,
        default_department_id=default_department.id,
    )

    assert result is not None
    assert result.name == "待删除部门"
    assert result.migrated_user_count == 1
    assert user.department_id == default_department.id
    assert await session.scalar(select(User.id).where(User.id == user.id)) == user.id
    assert await session.get(Department, deleted_department.id) is None
    key_result = await session.execute(select(APIKey).where(APIKey.id == api_key.id))
    persisted_key = key_result.scalar_one()
    assert persisted_key.is_enabled is False
    assert persisted_key.revoked_at is not None
    assert persisted_key.department_id is None
