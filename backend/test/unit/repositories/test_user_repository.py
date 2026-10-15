"""用户 repository 的凭据撤销测试。"""

from __future__ import annotations

from datetime import timedelta

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.repositories.user_repository import UserRepository
from ars.storage.postgres.models_business import APIKey, Base, Department, User
from ars.utils.auth_utils import AuthUtils
from ars.utils.datetime_utils import utc_now_naive

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]


@pytest_asyncio.fixture()
async def user_session():
    """创建带活动 Key 与历史 tombstone 的 SQLite 会话。"""

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        user = User(
            username="Delete User",
            uid="delete_user",
            password_hash="$argon2id$placeholder",
            role="user",
        )
        session.add(user)
        await session.flush()
        keys = []
        for name in ("active", "already revoked"):
            _secret, key_hash, key_prefix = AuthUtils.generate_api_key()
            keys.append(
                APIKey(
                    key_hash=key_hash,
                    key_prefix=key_prefix,
                    name=name,
                    user_id=user.id,
                    created_by=str(user.id),
                )
            )
        previous_revocation = utc_now_naive() - timedelta(days=1)
        keys[1].is_enabled = False
        keys[1].revoked_at = previous_revocation
        session.add_all(keys)
        await session.commit()
        yield session, user, keys, previous_revocation
    await engine.dispose()


async def test_user_page_filters_before_pagination_and_excludes_deleted_users(user_session) -> None:
    """分页过滤必须作用于全部有效用户，而不是只过滤当前页。"""

    session, user, _keys, _previous_revocation = user_session
    department = Department(name="Paged Department")
    session.add(department)
    await session.flush()
    users = [
        User(
            username=f"Page User {index}",
            uid=f"page_user_{index}",
            phone_number=f"1380000000{index}",
            password_hash="$argon2id$placeholder",
            role="user" if index < 3 else "admin",
            department_id=department.id,
            is_deleted=1 if index == 1 else 0,
        )
        for index in range(4)
    ]
    session.add_all(users)
    await session.commit()

    rows, total = await UserRepository(session).list_page_with_department(
        offset=1,
        limit=1,
        department_id=department.id,
        role="user",
        search="page_user_",
    )

    assert total == 2
    assert [row[0].uid for row in rows] == ["page_user_2"]
    assert rows[0][1] == department.name
    assert all(row[0].is_deleted == 0 for row in rows)


async def test_soft_delete_tombstones_all_api_keys_without_rewriting_history(user_session) -> None:
    """通用软删除入口也必须阻止旧请求复活凭据。"""

    session, user, keys, previous_revocation = user_session

    deleted = await UserRepository(session).soft_delete(user.id, username=user.username)

    assert deleted is True
    assert user.is_deleted == 1
    assert keys[0].is_enabled is False
    assert keys[0].revoked_at is not None
    assert keys[1].is_enabled is False
    assert keys[1].revoked_at == previous_revocation
