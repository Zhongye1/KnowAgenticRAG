"""登录标识（uid）与手机号不能互相占用。

`get_by_login_identifier` 先按 uid 解析、再按手机号，所以只要某个账号的 uid 与另一个账号的
手机号相同，那个人的手机号登录就会落到别人账上（密码仍然需要，属于登录拒绝/混淆而非接管）。
注册路径一开始就双向检查；管理侧的写入口（管理员建号、部门管理员建号、改资料、管理员改用户、
首启初始化）此前只在各自那一侧检查，这里把它们的守卫逐条钉住。
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.storage.postgres.models_business import Base, Department, User
from ars.utils.auth_utils import AuthUtils
from server.routers.auth_dept_router import department as department_router
from server.routers.auth_router import auth
from server.utils.auth_middleware import get_admin_user, get_db, get_required_user, get_superadmin_user

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]

# 受害者的手机号，同时也是「phoneowner」的登录标识候选
VICTIM_PHONE = "13900000002"
PHONE_SHAPED_UID = "13800000001"


async def _make_client(*, seed_phone_owner: bool = True):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    db = factory()

    department = Department(name="研发部")
    admin = User(
        username="admin",
        uid="admin",
        password_hash=AuthUtils.hash_password("admin12345"),
        role="superadmin",
        department=department,
    )
    db.add_all([department, admin])
    if seed_phone_owner:
        db.add(
            User(
                username="victim",
                uid=PHONE_SHAPED_UID,
                password_hash=AuthUtils.hash_password("victim12345"),
                role="user",
                department=department,
            )
        )
    await db.commit()
    await db.refresh(admin)

    app = FastAPI()
    app.include_router(auth, prefix="/api")
    app.include_router(department_router, prefix="/api")

    async def override_db():
        yield db

    for dependency in (get_admin_user, get_superadmin_user, get_required_user):

        async def override_user(_admin=admin):
            return _admin

        app.dependency_overrides[dependency] = override_user
    app.dependency_overrides[get_db] = override_db

    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    return engine, db, client, admin


@pytest_asyncio.fixture()
async def harness():
    """库里有一个 uid 恰好是手机号形态（13800000001）的用户。"""
    engine, db, client, admin = await _make_client()
    async with client:
        yield client, db, admin
    await db.close()
    await engine.dispose()


@pytest_asyncio.fixture()
async def first_run_harness():
    """干净库：可以走 /initialize。"""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    db = factory()
    app = FastAPI()
    app.include_router(auth, prefix="/api")

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    async with client:
        yield client, db
    await db.close()
    await engine.dispose()


async def test_admin_create_user_rejects_phone_matching_another_uid(harness):
    client, db, _admin = harness

    response = await client.post(
        "/api/auth/users",
        json={"username": "newbie", "password": "newbie12345", "phone_number": PHONE_SHAPED_UID},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "手机号与已有用户ID冲突"
    assert (await db.scalar(select(User).where(User.username == "newbie"))) is None


async def test_profile_update_rejects_phone_matching_another_uid(harness):
    client, db, admin = harness
    other = User(
        username="me",
        uid="me",
        password_hash=AuthUtils.hash_password("me12345678"),
        role="user",
        department_id=admin.department_id,
    )
    db.add(other)
    await db.commit()
    await db.refresh(other)

    response = await client.put(
        "/api/auth/profile",
        json={"phone_number": PHONE_SHAPED_UID},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "手机号与已有用户ID冲突"
    await db.refresh(other)
    assert other.phone_number is None


async def test_admin_update_user_rejects_phone_matching_another_uid(harness):
    client, db, admin = harness
    target = User(
        username="target",
        uid="target",
        password_hash=AuthUtils.hash_password("target12345"),
        role="user",
        department_id=admin.department_id,
    )
    db.add(target)
    await db.commit()
    await db.refresh(target)

    conflict = await client.put(
        f"/api/auth/users/{target.id}",
        json={"phone_number": PHONE_SHAPED_UID},
    )
    assert conflict.status_code == 400
    assert conflict.json()["detail"] == "手机号与已有用户ID冲突"

    malformed = await client.put(f"/api/auth/users/{target.id}", json={"phone_number": "12345"})
    assert malformed.status_code == 400
    assert malformed.json()["detail"] == "手机号格式不正确"

    await db.refresh(target)
    assert target.phone_number is None


async def test_department_creation_rejects_admin_uid_matching_existing_phone(harness):
    client, db, admin = harness
    victim = User(
        username="phoneuser",
        uid="phoneuser",
        phone_number=VICTIM_PHONE,
        password_hash=AuthUtils.hash_password("phone12345"),
        role="user",
        department_id=admin.department_id,
    )
    db.add(victim)
    await db.commit()

    response = await client.post(
        "/api/departments",
        json={
            "name": "新部门",
            "admin_uid": VICTIM_PHONE,
            "admin_password": "deptadmin12345",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "用户ID与已有手机号冲突"
    assert (await db.scalar(select(Department).where(Department.name == "新部门"))) is None


async def test_initialize_rejects_uid_with_trailing_newline(first_run_harness):
    """`/initialize` 与注册共用 `validate_uid`：整串匹配，结尾换行不再能冒充干净的 uid。"""
    client, db = first_run_harness

    response = await client.post(
        "/api/auth/initialize",
        json={"uid": "root\n", "password": "root12345"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "用户ID只能包含字母、数字和下划线"
    assert (await db.scalar(select(User).limit(1))) is None


async def test_self_owned_uid_phone_combination_is_allowed(harness):
    """自排除：uid 与手机号落在同一个账号上不构成遮蔽（登录解析到的是同一个人），
    否则「把手机号设成自己的 uid」和重复保存都会被无谓地拒掉。"""
    client, db, _admin = harness
    victim = await db.scalar(select(User).where(User.uid == PHONE_SHAPED_UID))
    assert victim is not None

    response = await client.put(
        f"/api/auth/users/{victim.id}",
        json={"phone_number": PHONE_SHAPED_UID},
    )

    assert response.status_code == 200, response.text
    await db.refresh(victim)
    assert victim.phone_number == PHONE_SHAPED_UID
