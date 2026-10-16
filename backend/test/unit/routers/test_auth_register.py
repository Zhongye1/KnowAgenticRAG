"""自助注册端点：公开入口的守卫、落库事实与限流。

覆盖的拒绝面：系统未初始化、UID 格式（含结尾换行）、UID 与手机号互相占用、手机号格式、
密码长度、多余字段（越权尝试），以及限流窗口。
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
from server.main import RATE_LIMIT_MAX_ATTEMPTS, AuthRateLimitMiddleware, _auth_attempts
from server.routers.auth_router import auth
from server.utils.auth_middleware import get_db

pytestmark = [pytest.mark.asyncio, pytest.mark.unit]

REGISTER_PATH = "/api/auth/register"
VALID_PAYLOAD = {"uid": "newcomer", "password": "passw0rd123"}
EXISTING_PHONE = "13800000001"
SELF_REGISTRATION_DEPARTMENT_NAME = "自助注册"


@pytest.fixture(autouse=True)
def reset_rate_limit_window() -> None:
    """限流状态是进程级的，用例之间必须清干净。"""
    _auth_attempts.clear()


async def _make_client(
    *,
    seed_users: bool,
    department_name: str = "研发部",
    with_rate_limit: bool = False,
):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    db = factory()
    if seed_users:
        department = Department(name=department_name)
        admin = User(
            username="admin",
            uid="admin",
            password_hash=AuthUtils.hash_password("admin12345"),
            role="superadmin",
            department=department,
        )
        phone_owner = User(
            username="phoneowner",
            uid="phoneowner",
            phone_number=EXISTING_PHONE,
            password_hash=AuthUtils.hash_password("phone12345"),
            role="user",
            department=department,
        )
        db.add_all([department, admin, phone_owner])
        await db.commit()

    app = FastAPI()
    app.include_router(auth, prefix="/api")
    if with_rate_limit:
        app.add_middleware(AuthRateLimitMiddleware)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    return engine, db, client


@pytest_asyncio.fixture()
async def harness():
    """库中已有超管与默认部门：注册应当成功。"""
    engine, db, client = await _make_client(seed_users=True)
    async with client:
        yield client, db
    await db.close()
    await engine.dispose()


@pytest_asyncio.fixture()
async def rate_limited_harness():
    engine, db, client = await _make_client(seed_users=True, with_rate_limit=True)
    async with client:
        yield client, db
    await db.close()
    await engine.dispose()


@pytest_asyncio.fixture()
async def first_run_harness():
    """干净库：注册必须被拒绝，否则部署方再也建不出超管。"""
    engine, db, client = await _make_client(seed_users=False)
    async with client:
        yield client, db
    await db.close()
    await engine.dispose()


async def test_register_creates_plain_user_with_usable_credential(harness):
    client, db = harness
    response = await client.post(REGISTER_PATH, json=VALID_PAYLOAD)

    assert response.status_code == 201, response.text
    token = response.json()
    assert token["role"] == "user"
    assert token["uid"] == "newcomer"
    assert token["username"] == "newcomer"
    assert token["phone_number"] is None

    registration_department_id = await db.scalar(
        select(Department.id).where(Department.name == SELF_REGISTRATION_DEPARTMENT_NAME)
    )
    assert registration_department_id is not None, "自助注册部门应当按需创建"
    created = await db.scalar(select(User).where(User.uid == "newcomer"))
    assert created is not None
    assert created.department_id == registration_department_id
    assert created.last_login is not None

    # 凭据真的能用：没有部门的账号会被 get_required_user 挡在 400，这里必须 200
    me = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token['access_token']}"}
    )
    assert me.status_code == 200, me.text
    profile = me.json()
    assert profile["uid"] == "newcomer"
    assert profile["role"] == "user"
    assert profile["department_id"] == registration_department_id


async def test_register_is_closed_before_initialization(first_run_harness):
    client, db = first_run_harness
    response = await client.post(REGISTER_PATH, json=VALID_PAYLOAD)

    assert response.status_code == 403
    assert "超级管理员" in response.json()["detail"]

    # 拒绝是真的拒绝：库仍然为空，首启初始化仍然可用（否则部署方永久失去超管）
    assert (await db.scalar(select(User.id).limit(1))) is None
    initialize = await client.post(
        "/api/auth/initialize",
        json={"uid": "root", "password": "root12345"},
    )
    assert initialize.status_code == 200, initialize.text
    assert initialize.json()["role"] == "superadmin"


async def test_register_reuses_one_registration_department(harness):
    """专属部门按需创建，但只建一次：第二个注册者复用同一个部门。"""
    client, db = harness
    assert (await db.scalar(select(Department.id).where(Department.name == SELF_REGISTRATION_DEPARTMENT_NAME))) is None

    first = await client.post(REGISTER_PATH, json=VALID_PAYLOAD)
    second = await client.post(REGISTER_PATH, json={**VALID_PAYLOAD, "uid": "secondcomer"})

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    departments = (
        (await db.execute(select(Department).where(Department.name == SELF_REGISTRATION_DEPARTMENT_NAME)))
        .scalars()
        .all()
    )
    assert len(departments) == 1
    users = (await db.execute(select(User).where(User.uid.in_(["newcomer", "secondcomer"])))).scalars().all()
    assert {user.department_id for user in users} == {departments[0].id}


@pytest.mark.parametrize(
    ("uid", "expected_detail"),
    [
        ("ab", "用户ID长度必须在3-20个字符之间"),
        ("a" * 21, "用户ID长度必须在3-20个字符之间"),
        ("bad-uid!", "用户ID只能包含字母、数字和下划线"),
        ("bad.uid", "用户ID只能包含字母、数字和下划线"),
        # `$` 也匹配结尾换行：`"admin\n"` 曾能通过校验并以 admin 的样子出现在用户列表里
        ("admin\n", "用户ID只能包含字母、数字和下划线"),
    ],
)
async def test_register_rejects_invalid_uid(harness, uid, expected_detail):
    client, _db = harness
    response = await client.post(REGISTER_PATH, json={**VALID_PAYLOAD, "uid": uid})

    assert response.status_code == 400
    assert response.json()["detail"] == expected_detail


async def test_register_rejects_taken_uid(harness):
    client, _db = harness
    response = await client.post(REGISTER_PATH, json={**VALID_PAYLOAD, "uid": "admin"})

    assert response.status_code == 400
    assert "已被占用" in response.json()["detail"]


async def test_register_rejects_taken_phone(harness):
    client, _db = harness
    response = await client.post(
        REGISTER_PATH, json={**VALID_PAYLOAD, "phone_number": EXISTING_PHONE}
    )

    assert response.status_code == 400
    assert "已被占用" in response.json()["detail"]


async def test_register_rejects_uid_matching_existing_phone(harness):
    """登录标识先按 uid 解析，占用别人的手机号会让对方再也无法用手机号登录。"""
    client, _db = harness
    response = await client.post(REGISTER_PATH, json={**VALID_PAYLOAD, "uid": EXISTING_PHONE})

    assert response.status_code == 400
    assert "手机号冲突" in response.json()["detail"]


async def test_register_rejects_phone_matching_existing_uid(harness):
    """反方向同样要拦：手机号与既有 uid 撞上时，手机号登录会落到别人账上。"""
    client, _db = harness
    phone_shaped_uid = "13900000002"
    first = await client.post(
        REGISTER_PATH, json={"uid": phone_shaped_uid, "password": "passw0rd123"}
    )
    assert first.status_code == 201, first.text

    second = await client.post(
        REGISTER_PATH,
        json={**VALID_PAYLOAD, "phone_number": phone_shaped_uid},
    )

    assert second.status_code == 400
    assert "用户ID冲突" in second.json()["detail"]


async def test_register_rejects_malformed_phone(harness):
    client, _db = harness
    response = await client.post(
        REGISTER_PATH, json={**VALID_PAYLOAD, "phone_number": "12345"}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "手机号格式不正确"


async def test_register_rejects_short_password(harness):
    client, _db = harness
    response = await client.post(REGISTER_PATH, json={"uid": "newcomer", "password": "short"})

    assert response.status_code == 422


async def test_register_rejects_undeclared_fields(harness):
    """多余字段直接拒绝：否则 `role` / `department_id` 会被当成越权入口。"""
    client, _db = harness
    response = await client.post(
        REGISTER_PATH, json={**VALID_PAYLOAD, "role": "admin", "department_id": 1}
    )

    assert response.status_code == 422


async def test_register_failures_are_rate_limited(rate_limited_harness):
    client, _db = rate_limited_harness
    # 失败才累计：成功的请求会被中间件清掉窗口，所以用「UID 已占用」制造 400
    payload = {**VALID_PAYLOAD, "uid": "admin"}
    for _ in range(RATE_LIMIT_MAX_ATTEMPTS):
        attempt = await client.post(REGISTER_PATH, json=payload)
        assert attempt.status_code == 400

    blocked = await client.post(REGISTER_PATH, json=payload)

    assert blocked.status_code == 429
    assert blocked.json()["detail"] == "注册尝试过于频繁，请稍后再试"
    assert int(blocked.headers["Retry-After"]) >= 1
