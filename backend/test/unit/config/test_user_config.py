from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.config import UserConfig, UserConfigSchema
from ars.storage.postgres.models_business import Base, Department, User
from ars.storage.postgres.models_business import UserConfig as UserConfigRecord

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]


@pytest_asyncio.fixture()
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        department = Department(name="Config Dept")
        user = User(
            username="Config User",
            uid="config_user",
            password_hash="$argon2id$placeholder",
            role="user",
            department=department,
        )
        db.add_all([department, user])
        await db.commit()
        await db.refresh(user)
        yield db, user
    await engine.dispose()


async def test_user_config_load_returns_defaults_without_creating_row(session):
    db, user = session

    user_config = await UserConfig.load(db, user.uid)
    dumped = user_config.dump_config()

    assert dumped["uid"] == user.uid
    assert dumped["enable_memory"] is False

    result = await db.execute(select(UserConfigRecord).filter(UserConfigRecord.uid == user.uid))
    assert result.scalar_one_or_none() is None


async def test_user_config_save_persists_user_specific_values(session):
    db, user = session

    saved = await UserConfig(uid=user.uid, schema=UserConfigSchema(enable_memory=True)).save(db)
    loaded = await UserConfig.load(db, user.uid)

    assert saved.dump_config()["enable_memory"] is True
    assert loaded.dump_config()["enable_memory"] is True
    result = await db.execute(select(UserConfigRecord).filter(UserConfigRecord.uid == user.uid))
    assert result.scalar_one().enable_memory is True
