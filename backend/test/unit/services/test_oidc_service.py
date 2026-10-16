from __future__ import annotations

import os
from urllib.parse import unquote

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

os.environ.setdefault("OPENAI_API_KEY", "dummy")

from ars.repositories.user_repository import UserRepository
from ars.services import oidc_service
from ars.storage.postgres.models_business import Department, User


pytestmark = [pytest.mark.asyncio, pytest.mark.unit]


@pytest_asyncio.fixture
async def oidc_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(User.__table__.create)
        await conn.run_sync(Department.__table__.create)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def bind_oidc_repository(oidc_session, monkeypatch):
    # create_oidc_user 内部用的是未绑会话的 UserRepository()（走全局连接），因此任何走到
    # 建号那一步的用例都会往真实开发库写行（第一版正向用例就这么写过一次）。放在模块级
    # autouse 里，后来的用例不必各自记得这件事。
    monkeypatch.setattr(
        oidc_service, "UserRepository", lambda *args, **kwargs: UserRepository(oidc_session)
    )


async def _create_user(session, uid: str = "alice") -> User:
    user = User(username="alice", uid=uid, password_hash="x", role="user", is_deleted=0)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def test_find_user_by_oidc_sub_resolves_placeholder_when_sub_contains_colon(oidc_session):
    user = await _create_user(oidc_session)

    await oidc_service._create_oidc_binding_placeholder(oidc_session, "tenant:user", user)

    resolved = await oidc_service.find_user_by_oidc_sub(oidc_session, "tenant:user")

    assert resolved is not None
    assert resolved.id == user.id
    assert resolved.uid == user.uid
    assert resolved.is_deleted == 0


async def test_find_deleted_oidc_user_by_sub_resolves_deleted_target_when_sub_contains_colon(oidc_session):
    user = await _create_user(oidc_session)
    user.is_deleted = 1
    await oidc_session.commit()

    await oidc_service._create_oidc_binding_placeholder(oidc_session, "tenant:user", user)

    resolved = await oidc_service.find_deleted_oidc_user_by_sub(oidc_session, "tenant:user")

    assert resolved is not None
    assert resolved.id == user.id
    assert resolved.uid == user.uid
    assert resolved.is_deleted == 1


async def test_oidc_callback_allows_existing_binding_when_sub_contains_colon(oidc_session, monkeypatch):
    user = await _create_user(oidc_session)
    await oidc_service._create_oidc_binding_placeholder(oidc_session, "tenant:user", user)

    monkeypatch.setattr(oidc_service.oidc_config, "enabled", True)
    monkeypatch.setattr(oidc_service.oidc_config, "client_id", "cid")
    monkeypatch.setattr(oidc_service.oidc_config, "client_secret", "secret")
    monkeypatch.setattr(oidc_service.oidc_config, "token_endpoint", "https://example/token")
    monkeypatch.setattr(oidc_service.oidc_config, "authorization_endpoint", "https://example/auth")
    monkeypatch.setattr(oidc_service.oidc_config, "userinfo_endpoint", "https://example/userinfo")
    monkeypatch.setattr(oidc_service.oidc_config, "use_raw_username", True)
    monkeypatch.setattr(oidc_service.oidc_config, "auto_create_user", False)

    monkeypatch.setattr(
        oidc_service.OIDCUtils,
        "verify_state",
        classmethod(lambda cls, state: {"redirect_path": "/"}),
    )

    async def fake_exchange(cls, code):
        return {"access_token": "token"}

    async def fake_userinfo(cls, access_token):
        return {"sub": "tenant:user", "preferred_username": "alice"}

    async def fake_log_operation(db, user_id, operation, request=None):
        return None

    monkeypatch.setattr(oidc_service.OIDCUtils, "exchange_code_for_token", classmethod(fake_exchange))
    monkeypatch.setattr(oidc_service.OIDCUtils, "get_userinfo", classmethod(fake_userinfo))
    monkeypatch.setattr(oidc_service, "log_operation", fake_log_operation)

    response = await oidc_service.oidc_callback_handler("dummy-code", "dummy-state", oidc_session)

    assert response.status_code == 302
    assert unquote(response.headers["location"]).startswith("/auth/oidc/callback?code=")


async def test_create_oidc_user_rejects_raw_uid_matching_local_phone(oidc_session, monkeypatch):
    """raw 模式下 uid 逐字取自 IdP：撞上本地账号手机号时必须拒绝。

    放它进来会让那个人的手机号登录落到这个 OIDC 账号上（`get_by_login_identifier` 先按 uid 解析）。
    """
    monkeypatch.setattr(oidc_service.oidc_config, "use_raw_username", True)
    oidc_session.add(
        User(
            username="本地用户",
            uid="localuser",
            phone_number="13800000001",
            password_hash="x",
            role="user",
            is_deleted=0,
        )
    )
    await oidc_session.commit()

    with pytest.raises(HTTPException) as exc_info:
        await oidc_service.create_oidc_user(
            oidc_session,
            {"sub": "sub-phone", "name": "张三", "username": "13800000001"},
        )

    assert exc_info.value.status_code == 409
    assert "手机号冲突" in exc_info.value.detail
    assert (
        await oidc_session.execute(select(User).where(User.uid == "13800000001"))
    ).scalar_one_or_none() is None


async def test_create_oidc_user_keeps_raw_uid_when_it_does_not_collide(oidc_session, monkeypatch):
    """不冲突时行为不变：raw 模式下 uid 就是 IdP 给的 username。
    """
    monkeypatch.setattr(oidc_service.oidc_config, "use_raw_username", True)
    oidc_session.add(
        User(username="本地用户", uid="localuser", phone_number="13800000001", password_hash="x", role="user", is_deleted=0)
    )
    await oidc_session.commit()

    created = await oidc_service.create_oidc_user(
        oidc_session,
        {"sub": "sub-ok", "name": "李四", "username": "lisi"},
    )

    assert created.uid == "lisi"
    assert created.phone_number is None


async def test_oidc_callback_redirects_to_login_when_raw_uid_collides_with_local_phone(
    oidc_session, monkeypatch
):
    """raw 模式下 uid 撞本地手机号：浏览器导航要回到登录页带错误，而不是收到裸 JSON。

    这条同时证明守卫在**正常回调链路**上可达（回调自己的预检查按 uid 查，不看手机号）。
    """
    oidc_session.add(
        User(
            username="本地用户",
            uid="localuser",
            phone_number="13800000001",
            password_hash="x",
            role="user",
            is_deleted=0,
        )
    )
    await oidc_session.commit()

    for name, value in (
        ("enabled", True),
        ("client_id", "cid"),
        ("client_secret", "secret"),
        ("token_endpoint", "https://example/token"),
        ("authorization_endpoint", "https://example/auth"),
        ("userinfo_endpoint", "https://example/userinfo"),
        ("use_raw_username", True),
        ("auto_create_user", True),
        ("default_role", "user"),
    ):
        monkeypatch.setattr(oidc_service.oidc_config, name, value)

    monkeypatch.setattr(
        oidc_service.OIDCUtils,
        "verify_state",
        classmethod(lambda cls, state: {"redirect_path": "/"}),
    )

    async def fake_exchange(cls, code):
        return {"access_token": "token"}

    async def fake_userinfo(cls, access_token):
        return {"sub": "sub-phone", "preferred_username": "13800000001"}

    monkeypatch.setattr(oidc_service.OIDCUtils, "exchange_code_for_token", classmethod(fake_exchange))
    monkeypatch.setattr(oidc_service.OIDCUtils, "get_userinfo", classmethod(fake_userinfo))

    response = await oidc_service.oidc_callback_handler("dummy-code", "dummy-state", oidc_session)

    assert response.status_code == 302
    location = unquote(response.headers["location"])
    assert location.startswith("/login?oidc_error=")
    assert "手机号冲突" in location
    assert (
        await oidc_session.execute(select(User).where(User.uid == "13800000001"))
    ).scalar_one_or_none() is None
