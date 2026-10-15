from __future__ import annotations

from datetime import timedelta

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.services.auth_service import (
    CLIAuthError,
    approve_cli_auth_session,
    create_cli_auth_session,
    exchange_cli_auth_token,
    get_cli_auth_session_for_user,
)
from ars.storage.postgres.models_business import APIKey, Base, Department, User
from ars.utils.datetime_utils import utc_now_naive

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]


@pytest.fixture(autouse=True)
def api_key_derivation_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_KEY_DERIVATION_SECRET", "test-api-key-derivation-secret-32-chars")


@pytest_asyncio.fixture()
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        dept = Department(name="默认部门")
        user = User(
            username="Admin",
            uid="admin",
            password_hash="$argon2id$placeholder",
            role="superadmin",
            department=dept,
        )
        db.add_all([dept, user])
        await db.commit()
        await db.refresh(user)
        yield db, user
    await engine.dispose()


async def test_cli_auth_session_pending_then_exchange(session):
    db, user = session
    auth_session, device_code = await create_cli_auth_session(db)

    assert device_code.startswith("yxcli_")
    assert auth_session.user_code

    with pytest.raises(CLIAuthError) as pending:
        await exchange_cli_auth_token(db, device_code)
    assert pending.value.code == "authorization_pending"

    loaded = await get_cli_auth_session_for_user(db, auth_session.user_code)
    assert loaded.status == "pending"

    await approve_cli_auth_session(db, auth_session.user_code, user)
    token_data = await exchange_cli_auth_token(db, device_code)

    assert token_data["secret"].startswith("arskey_")
    assert token_data["api_key"]["user_id"] == user.id
    assert token_data["user"]["uid"] == "admin"


async def test_cli_auth_session_token_exchange_replays_same_committed_secret(session):
    db, user = session
    auth_session, device_code = await create_cli_auth_session(db)

    await approve_cli_auth_session(db, auth_session.user_code, user)
    first = await exchange_cli_auth_token(db, device_code)
    replay = await exchange_cli_auth_token(db, device_code)

    assert replay["secret"] == first["secret"]
    assert replay["api_key"]["id"] == first["api_key"]["id"]


async def test_cli_auth_session_does_not_republish_revoked_secret(session):
    db, user = session
    auth_session, device_code = await create_cli_auth_session(db)
    await approve_cli_auth_session(db, auth_session.user_code, user)
    first = await exchange_cli_auth_token(db, device_code)
    api_key = await db.get(APIKey, first["api_key"]["id"])
    api_key.is_enabled = False
    api_key.revoked_at = utc_now_naive()
    await db.commit()

    with pytest.raises(CLIAuthError) as revoked:
        await exchange_cli_auth_token(db, device_code)

    assert revoked.value.code == "api_key_revoked"
    assert revoked.value.status_code == 409


async def test_cli_auth_session_replay_expires_with_original_session_window(session):
    db, user = session
    auth_session, device_code = await create_cli_auth_session(db)
    await approve_cli_auth_session(db, auth_session.user_code, user)
    await exchange_cli_auth_token(db, device_code)

    auth_session.expires_at = auth_session.created_at - timedelta(seconds=1)
    await db.commit()

    with pytest.raises(CLIAuthError) as expired:
        await exchange_cli_auth_token(db, device_code)
    assert expired.value.code == "expired_token"
    assert expired.value.status_code == 410


async def test_cli_auth_session_rejects_unknown_user_code(session):
    db, _user = session

    with pytest.raises(CLIAuthError) as missing:
        await get_cli_auth_session_for_user(db, "NOPE-NOPE")
    assert missing.value.code == "not_found"
