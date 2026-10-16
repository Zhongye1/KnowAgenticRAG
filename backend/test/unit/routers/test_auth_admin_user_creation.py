"""管理员建号的部门归属：两条分支都落到创建者所在部门，落不到时显式失败。

修复前的行为是「按名字找『默认部门』，找不到就静默写 `department_id = NULL`」——那会造出一个
每个端点都 400 的账号（`get_required_user` 要求有部门），而改名或删掉默认部门的部署正好踩到
（本项目 dev 库就是 研发部 / 产品部 / 运营部）。
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
from server.routers.auth_router import auth
from server.utils.auth_middleware import get_admin_user, get_db

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]

USERS_PATH = "/api/auth/users"
NEW_USER = {"username": "newbie", "password": "newbie12345"}


async def _make_client(
    *, creator_role: str = "superadmin", creator_department: str | None = "研发部"
):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    db = factory()

    department = Department(name=creator_department) if creator_department else None
    creator = User(
        username="creator",
        uid="creator",
        password_hash=AuthUtils.hash_password("creator12345"),
        role=creator_role,
        department=department,
    )
    db.add(creator)
    await db.commit()
    await db.refresh(creator)

    app = FastAPI()
    app.include_router(auth, prefix="/api")

    async def override_db():
        yield db

    async def override_admin():
        return creator

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_admin_user] = override_admin
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    return engine, db, client, creator


@pytest_asyncio.fixture()
async def superadmin_client():
    """库里有研发部（没有「默认部门」），创建者是超管且属于研发部。"""
    engine, db, client, creator = await _make_client()
    async with client:
        yield client, db, creator
    await db.close()
    await engine.dispose()


@pytest_asyncio.fixture()
async def departmentless_creator_client():
    engine, db, client, creator = await _make_client(creator_department=None)
    async with client:
        yield client, db, creator
    await db.close()
    await engine.dispose()


@pytest_asyncio.fixture()
async def department_admin_client():
    engine, db, client, creator = await _make_client(creator_role="admin")
    async with client:
        yield client, db, creator
    await db.close()
    await engine.dispose()


async def test_superadmin_without_department_falls_back_to_own_department(superadmin_client):
    """不指定部门时落到超管自己的部门，而不是 NULL（旧行为在改名过的部署上会写 NULL）。"""
    client, db, creator = superadmin_client

    response = await client.post(USERS_PATH, json=NEW_USER)

    assert response.status_code == 200, response.text
    created = await db.scalar(select(User).where(User.uid == response.json()["uid"]))
    assert created is not None
    assert created.department_id == creator.department_id
    assert created.department_id is not None
    assert response.json()["department_id"] == creator.department_id


async def test_superadmin_can_target_another_department(superadmin_client):
    client, db, _creator = superadmin_client
    target = Department(name="产品部")
    db.add(target)
    await db.commit()
    await db.refresh(target)

    response = await client.post(USERS_PATH, json={**NEW_USER, "department_id": target.id})

    assert response.status_code == 200, response.text
    created = await db.scalar(select(User).where(User.uid == response.json()["uid"]))
    assert created is not None
    assert created.department_id == target.id


async def test_creator_without_department_is_refused(departmentless_creator_client):
    """创建者自己都没有部门时显式失败，而不是造一个不可用账号。"""
    client, db, _creator = departmentless_creator_client

    response = await client.post(USERS_PATH, json=NEW_USER)

    assert response.status_code == 400
    assert response.json()["detail"] == "无法确定新用户的部门：请指定部门，或先让当前账号加入一个部门"
    assert (await db.scalar(select(User).where(User.username == "newbie"))) is None


async def test_department_admin_inherits_own_department_and_cannot_override(department_admin_client):
    client, db, creator = department_admin_client

    inherited = await client.post(USERS_PATH, json=NEW_USER)
    assert inherited.status_code == 200, inherited.text
    created = await db.scalar(select(User).where(User.uid == inherited.json()["uid"]))
    assert created is not None
    assert created.department_id == creator.department_id

    other = Department(name="产品部")
    db.add(other)
    await db.commit()
    await db.refresh(other)

    refused = await client.post(
        USERS_PATH, json={"username": "another", "password": "another12345", "department_id": other.id}
    )
    assert refused.status_code == 403
    assert refused.json()["detail"] == "普通管理员不能指定部门"


async def test_username_check_is_exact_not_a_page_scan(superadmin_client):
    """用户名查重必须精确查询。

    修复前是翻一页 `list_users()`（默认 100 行）在 Python 里比名字，用户数超过那一页就漏，
    插库时撞唯一索引、又没有全局处理，管理员看到的是 500 而不是 400。这里把重名的用户放在
    第一页之外（最后插入），并断言拿到的是「用户名已存在」这条精确查重的文案——退回翻页扫描
    时文案会变成唯一约束兜底的那条。
    """
    client, db, creator = superadmin_client
    for index in range(120):
        db.add(
            User(
                username=f"bulk{index:03d}",
                uid=f"bulk{index:03d}",
                password_hash="x",
                role="user",
                department_id=creator.department_id,
            )
        )
    await db.commit()
    db.add(
        User(
            username="latecomer",
            uid="latecomer",
            password_hash="x",
            role="user",
            department_id=creator.department_id,
        )
    )
    await db.commit()

    response = await client.post(
        USERS_PATH, json={"username": "latecomer", "password": "latecomer12345"}
    )

    assert response.status_code == 400, response.text
    assert response.json()["detail"] == "用户名已存在"
