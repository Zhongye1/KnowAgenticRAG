from __future__ import annotations

import json

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.config import options
from ars.storage.postgres.models_business import Base


class FakeRedis:
    def __init__(self):
        self.values: dict[str, str] = {}

    async def get(self, key: str):
        return self.values.get(key)

    async def set(self, key: str, value: str, nx: bool = False, **_kwargs):
        if not nx or key not in self.values:
            self.values[key] = value

    async def delete(self, key: str):
        self.values.pop(key, None)

    async def incr(self, key: str):
        value = int(self.values.get(key, "0")) + 1
        self.values[key] = str(value)
        return value

    async def eval(self, script: str, _numkeys: int, *args):
        if "INCR" in script:
            version_key, cache_key = args
            await self.incr(version_key)
            await self.delete(cache_key)
            return 1
        version_key, cache_key, version, value, _ttl = args
        if self.values.get(version_key, "0") == str(version):
            self.values[cache_key] = value
            return "OK"
        return None


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


@pytest.mark.asyncio
async def test_system_options_preserve_boolean_values(db_session, monkeypatch):
    fake_redis = FakeRedis()
    monkeypatch.setattr(options, "get_async_redis_client", lambda: _async_value(fake_redis))
    await options.ensure_options_in_db(db_session)
    await options.update_option_value(
        db_session,
        options.system_options.key,
        {"enable_content_guard": False, "default_model": "test-provider:model"},
        "tester",
    )

    values = await options.system_options.get(db_session)

    assert values["enable_content_guard"] is False
    assert values["default_model"] == "test-provider:model"


@pytest.mark.asyncio
async def test_explicit_session_reads_database_instead_of_shared_cache(db_session, monkeypatch):
    fake_redis = FakeRedis()
    cache_key = f"{options.OPTION_CACHE_PREFIX}{options.system_options.key}"
    fake_redis.values[cache_key] = json.dumps({"default_model": "cached:model"})
    monkeypatch.setattr(options, "get_async_redis_client", lambda: _async_value(fake_redis))
    await options.ensure_options_in_db(db_session)
    await options.update_option_value(
        db_session,
        options.system_options.key,
        {"default_model": "database:model"},
        "tester",
    )

    values = await options.system_options.get(db_session)

    assert values["default_model"] == "database:model"


@pytest.mark.asyncio
async def test_implicit_option_read_uses_shared_cache(monkeypatch):
    fake_redis = FakeRedis()
    cache_key = f"{options.OPTION_CACHE_PREFIX}{options.system_options.key}"
    fake_redis.values[cache_key] = json.dumps({"default_model": "cached:model"})
    monkeypatch.setattr(options, "get_async_redis_client", lambda: _async_value(fake_redis))

    values = await options.system_options.get()

    assert values["default_model"] == "cached:model"


@pytest.mark.asyncio
async def test_sensitive_option_does_not_use_redis(db_session, monkeypatch):
    fake_redis = FakeRedis()
    monkeypatch.setattr(options, "get_async_redis_client", lambda: _async_value(fake_redis))
    await options.ensure_options_in_db(db_session)
    await options.update_option_value(
        db_session,
        options.mineru_official_api_opts.key,
        {"api_key": "database-secret"},
        "tester",
    )

    values = await options.mineru_official_api_opts.get(db_session)

    assert values["api_key"] == "database-secret"
    assert fake_redis.values == {}


@pytest.mark.asyncio
async def test_invalidate_option_cache_removes_cached_value(monkeypatch):
    fake_redis = FakeRedis()
    key = f"{options.OPTION_CACHE_PREFIX}{options.system_options.key}"
    fake_redis.values[key] = "{}"
    monkeypatch.setattr(options, "get_async_redis_client", lambda: _async_value(fake_redis))

    await options.invalidate_option_cache(options.system_options.key)

    assert key not in fake_redis.values


@pytest.mark.asyncio
async def test_stale_database_read_does_not_refill_invalidated_cache(monkeypatch):
    fake_redis = FakeRedis()
    monkeypatch.setattr(options, "get_async_redis_client", lambda: _async_value(fake_redis))
    version = await options._load_cache_version(options.system_options.key)

    await options.invalidate_option_cache(options.system_options.key)
    await options._save_cached_value(options.system_options.key, {"default_model": "stale:model"}, version)

    cache_key = f"{options.OPTION_CACHE_PREFIX}{options.system_options.key}"
    assert cache_key not in fake_redis.values


@pytest.mark.asyncio
async def test_first_implicit_option_read_initializes_cache_version(monkeypatch):
    fake_redis = FakeRedis()
    monkeypatch.setattr(options, "get_async_redis_client", lambda: _async_value(fake_redis))

    version = await options._load_cache_version(options.system_options.key)
    await options._save_cached_value(options.system_options.key, {"default_model": "first:model"}, version)

    cache_key = f"{options.OPTION_CACHE_PREFIX}{options.system_options.key}"
    assert version == "0"
    assert json.loads(fake_redis.values[cache_key]) == {"default_model": "first:model"}


@pytest.mark.asyncio
async def test_invalid_boolean_is_rejected(db_session):
    await options.ensure_options_in_db(db_session)

    with pytest.raises(ValueError, match="布尔值"):
        await options.update_option_value(
            db_session,
            options.system_options.key,
            {"enable_content_guard": "true"},
            "tester",
        )


async def _async_value(value):
    return value
