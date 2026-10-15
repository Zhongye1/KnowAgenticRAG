from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.config import options
from ars.storage_migrations import v071_options
from ars.storage.postgres.models_business import Base


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


@pytest.mark.asyncio
async def test_missing_v071_config_does_not_block_migration(db_session, tmp_path):
    await options.ensure_options_in_db(db_session)

    await v071_options.migrate_system_options(db_session, legacy_config_file=tmp_path / "missing.toml")
    record = await options.get_option(db_session, options.system_options.key)

    assert record.value == {}
    assert record.params["migration_version"] == 1


@pytest.mark.asyncio
async def test_v071_base_toml_is_migrated_before_version_is_recorded(db_session, tmp_path):
    await options.ensure_options_in_db(db_session)
    config_file = tmp_path / "base.toml"
    config_file.write_text(
        'default_model = "legacy:model"\nenable_content_guard = true\n',
        encoding="utf-8",
    )

    await v071_options.migrate_system_options(db_session, legacy_config_file=config_file)
    record = await options.get_option(db_session, options.system_options.key)

    assert record.value == {
        "default_model": "legacy:model",
        "enable_content_guard": True,
    }
    assert record.params["migration_version"] == 1


@pytest.mark.asyncio
async def test_invalid_v071_base_toml_fails_without_recording_version(db_session, tmp_path):
    await options.ensure_options_in_db(db_session)
    config_file = tmp_path / "base.toml"
    config_file.write_text("invalid = [", encoding="utf-8")

    with pytest.raises(RuntimeError, match="读取历史系统配置失败"):
        await v071_options.migrate_system_options(db_session, legacy_config_file=config_file)

    record = await options.get_option(db_session, options.system_options.key)
    assert int(record.params.get("migration_version") or 0) == 0


@pytest.mark.asyncio
async def test_symlinked_v071_base_toml_is_rejected(db_session, tmp_path):
    await options.ensure_options_in_db(db_session)
    target = tmp_path / "target.toml"
    target.write_text('default_model = "legacy:model"\n', encoding="utf-8")
    config_file = tmp_path / "base.toml"
    config_file.symlink_to(target)

    with pytest.raises(RuntimeError, match="符号链接"):
        await v071_options.migrate_system_options(db_session, legacy_config_file=config_file)
