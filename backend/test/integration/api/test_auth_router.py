"""
Integration tests for authentication-related API routes.
"""

from __future__ import annotations

import os
import uuid
from datetime import timedelta

import pytest
import pytest_asyncio
from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.services import login_rate_limit_service as login_limiter
from server.main import RATE_LIMIT_MAX_ATTEMPTS
from ars.storage.postgres.models_business import User as UserModel
from ars.storage.redis import close_async_redis_client, create_async_redis_client, get_async_redis_client
from ars.utils.datetime_utils import utc_now_naive

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


@pytest.fixture()
async def isolated_redis_client():
    """把进程内共享 Redis 客户端绑定到当前用例的 loop，结束后关闭。

    集成套件跨用例共享 pytest 进程内的 Redis 单例；若其在上一个用例的 loop
    中创建、本用例 loop 中复用会报 "attached to a different loop"。先关闭再
    重建，保证本用例拿到绑定当前 loop 的新客户端。
    """
    await close_async_redis_client()
    client = await get_async_redis_client()
    yield client
    await close_async_redis_client()


async def _expire_login_lock(user_id: int) -> None:
    """用一次性引擎把用户锁定截止时间改到过去。

    不复用 pg_manager 的共享引擎：其连接池绑定在别的 loop 上，
    跨用例事件循环复用会报 "attached to a different loop"。
    """
    engine = create_async_engine(os.environ["POSTGRES_URL"])
    try:
        session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
        async with session_factory() as session:
            await session.execute(
                update(UserModel)
                .where(UserModel.id == user_id)
                .values(login_locked_until=utc_now_naive() - timedelta(seconds=1))
            )
            await session.commit()
    finally:
        await engine.dispose()


async def _clear_login_failure_keys():
    # 每个用例的事件循环不同，不复用共享单例客户端
    redis = await create_async_redis_client()
    try:
        keys = [key async for key in redis.scan_iter(match="ars:login-failure:*")]
        if keys:
            await redis.delete(*keys)
    finally:
        await redis.aclose()


@pytest_asyncio.fixture(autouse=True)
async def _reset_login_rate_limits(test_client):
    """清理 Redis 登录失败计数，避免用例间通过共享 Redis 相互影响。"""
    await _clear_login_failure_keys()
    yield
    await _clear_login_failure_keys()
    # 一次成功登录会清空内存中间件在同一 IP 上的滑动窗口计数，
    # 避免失败密集的用例把同 IP 的后续用例顶到中间件限速。
    username = os.getenv("TEST_USERNAME")
    password = os.getenv("TEST_PASSWORD")
    if username and password:
        await test_client.post("/api/auth/token", data={"username": username, "password": password})


async def _require_superadmin(test_client, headers):
    response = await test_client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200, response.text
    if response.json()["role"] != "superadmin":
        pytest.fail("This test requires TEST_USERNAME to be a superadmin account.")


async def _create_department_with_admin(test_client, headers, label: str) -> dict:
    suffix = uuid.uuid4().hex[:8]
    admin_uid = f"adm{label}_{suffix}"
    admin_password = f"Pw!{suffix}"
    response = await test_client.post(
        "/api/departments",
        json={
            "name": f"pytest_{label}_{suffix}",
            "description": "pytest managed department",
            "admin_uid": admin_uid,
            "admin_password": admin_password,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text

    login_response = await test_client.post(
        "/api/auth/token",
        data={"username": admin_uid, "password": admin_password},
    )
    assert login_response.status_code == 200, login_response.text

    login_payload = login_response.json()
    return {
        "department": response.json(),
        "admin_id": login_payload["user_id"],
        "admin_headers": {"Authorization": f"Bearer {login_payload['access_token']}"},
    }


async def _create_user(test_client, headers, label: str, role: str = "user", department_id: int | None = None) -> dict:
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "username": f"u{label}_{suffix}",
        "password": f"Pw!{suffix}",
        "role": role,
    }
    if department_id is not None:
        payload["department_id"] = department_id

    response = await test_client.post("/api/auth/users", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def _cleanup_user(test_client, headers, user_id: int) -> None:
    response = await test_client.delete(f"/api/auth/users/{user_id}", headers=headers)
    assert response.status_code in {200, 404}, response.text


async def _cleanup_department(test_client, headers, department_id: int) -> None:
    response = await test_client.delete(f"/api/departments/{department_id}", headers=headers)
    assert response.status_code in {200, 404}, response.text


async def test_login_with_invalid_credentials(test_client):
    response = await test_client.post("/api/auth/token", data={"username": "invalid", "password": "invalid"})
    assert response.status_code == 401
    assert "detail" in response.json()


async def test_user_is_locked_after_repeated_failed_logins(test_client, standard_user):
    uid = standard_user["user"]["uid"]

    for attempt in range(1, 5):
        response = await test_client.post("/api/auth/token", data={"username": uid, "password": "wrong-password"})
        assert response.status_code == 401, response.text
        assert response.json()["detail"] == "用户名或密码错误"

    locked_response = await test_client.post("/api/auth/token", data={"username": uid, "password": "wrong-password"})
    assert locked_response.status_code == 423, locked_response.text
    assert "X-Lock-Remaining" in locked_response.headers
    assert "账户已被锁定" in locked_response.json()["detail"]

    still_locked_response = await test_client.post(
        "/api/auth/token",
        data={"username": uid, "password": standard_user["password"]},
    )
    assert still_locked_response.status_code == 423, still_locked_response.text
    assert "X-Lock-Remaining" in still_locked_response.headers
    assert "登录被锁定" in still_locked_response.json()["detail"]


async def test_login_rate_limit_blocks_repeated_failures_per_ip_and_account(test_client, isolated_redis_client):
    # 测试进程连 localhost:5050，服务端看到的来源 IP 是 127.0.0.1
    identifier = f"nouser_{uuid.uuid4().hex[:8]}"
    for _ in range(login_limiter.LOGIN_FAILURE_IP_ACCOUNT_MAX - 1):
        await login_limiter.record_login_failure("127.0.0.1", identifier)

    failure_response = await test_client.post(
        "/api/auth/token",
        data={"username": identifier, "password": "wrong-password"},
    )
    assert failure_response.status_code == 401, failure_response.text

    # 第 10 次失败后，同 IP+账号组合进入滑动窗口限速
    blocked_response = await test_client.post(
        "/api/auth/token",
        data={"username": identifier, "password": "wrong-password"},
    )
    assert blocked_response.status_code == 429, blocked_response.text
    assert int(blocked_response.headers["Retry-After"]) >= 1
    assert "过于频繁" in blocked_response.json()["detail"]


async def test_expired_lock_resets_failure_count_before_next_failure(test_client, standard_user):
    uid = standard_user["user"]["uid"]

    for _ in range(4):
        response = await test_client.post("/api/auth/token", data={"username": uid, "password": "wrong-password"})
        assert response.status_code == 401, response.text
    # 第 5 次失败触发账号锁定
    locked_response = await test_client.post("/api/auth/token", data={"username": uid, "password": "wrong-password"})
    assert locked_response.status_code == 423, locked_response.text

    # 把锁定截止时间改到过去，模拟锁定到期
    await _expire_login_lock(standard_user["user"]["id"])

    # 锁定过期后首次失败应是普通 401，而不是失败计数残留导致的立即再锁定
    wrong_response = await test_client.post("/api/auth/token", data={"username": uid, "password": "wrong-password"})
    assert wrong_response.status_code == 401, wrong_response.text

    # 正确密码可正常登录
    success_response = await test_client.post(
        "/api/auth/token",
        data={"username": uid, "password": standard_user["password"]},
    )
    assert success_response.status_code == 200, success_response.text


async def test_admin_can_login_and_fetch_profile(test_client, admin_headers):
    profile_response = await test_client.get("/api/auth/me", headers=admin_headers)
    assert profile_response.status_code == 200
    data = profile_response.json()
    assert data["role"] in {"admin", "superadmin"}
    assert data["username"]
    assert data["id"]


async def test_profile_requires_authentication(test_client):
    response = await test_client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "请登录后再访问"


async def test_admin_can_create_and_delete_user(test_client, admin_headers):
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "username": f"rtu_{suffix}",
        "password": "routerTest123!",
        "role": "user",
    }
    create_response = await test_client.post("/api/auth/users", json=payload, headers=admin_headers)
    assert create_response.status_code == 200, create_response.text

    created_user = create_response.json()
    assert created_user["username"] == payload["username"]
    assert created_user["role"] == payload["role"]

    delete_response = await test_client.delete(f"/api/auth/users/{created_user['id']}", headers=admin_headers)
    assert delete_response.status_code == 200, delete_response.text
    delete_payload = delete_response.json()
    assert delete_payload["success"] is True
    assert delete_payload["message"] == "用户已删除"

    list_response = await test_client.get("/api/auth/users?limit=1000", headers=admin_headers)
    assert list_response.status_code == 200, list_response.text
    assert created_user["id"] not in {user["id"] for user in list_response.json()}


async def test_admin_user_page_filters_before_pagination_and_excludes_deleted(test_client, admin_headers):
    suffix = uuid.uuid4().hex[:8]
    created_users = []
    try:
        for index in range(3):
            response = await test_client.post(
                "/api/auth/users",
                json={
                    "username": f"paged_{suffix}_{index}",
                    "password": "routerTest123!",
                    "role": "user",
                },
                headers=admin_headers,
            )
            assert response.status_code == 200, response.text
            created_users.append(response.json())

        delete_response = await test_client.delete(f"/api/auth/users/{created_users[1]['id']}", headers=admin_headers)
        assert delete_response.status_code == 200, delete_response.text

        page_response = await test_client.get(
            "/api/auth/users/page",
            params={"search": f"paged_{suffix}", "offset": 1, "limit": 1, "role": "user"},
            headers=admin_headers,
        )
        assert page_response.status_code == 200, page_response.text
        page = page_response.json()
        assert page["total"] == 2
        assert page["limit"] == 1
        assert page["offset"] == 1
        assert [item["id"] for item in page["items"]] == [created_users[2]["id"]]
        assert created_users[1]["id"] not in {item["id"] for item in page["items"]}
    finally:
        for user in created_users:
            await test_client.delete(f"/api/auth/users/{user['id']}", headers=admin_headers)


async def test_admin_password_mutations_reject_passwords_shorter_than_eight_characters(
    test_client, admin_headers, standard_user
):
    create_response = await test_client.post(
        "/api/auth/users",
        json={"username": f"weak_{uuid.uuid4().hex[:8]}", "password": "short", "role": "user"},
        headers=admin_headers,
    )
    assert create_response.status_code == 422, create_response.text
    assert create_response.json()["detail"][0]["loc"] == ["body", "password"]

    update_response = await test_client.put(
        f"/api/auth/users/{standard_user['user']['id']}",
        json={"password": "short"},
        headers=admin_headers,
    )
    assert update_response.status_code == 422, update_response.text
    assert update_response.json()["detail"][0]["loc"] == ["body", "password"]


async def test_department_admin_is_limited_to_own_department_users(test_client, admin_headers):
    await _require_superadmin(test_client, admin_headers)

    user_ids: list[int] = []
    admin_ids: list[int] = []
    department_ids: list[int] = []

    try:
        dept_a = await _create_department_with_admin(test_client, admin_headers, "a")
        dept_b = await _create_department_with_admin(test_client, admin_headers, "b")
        department_a = dept_a["department"]
        department_b = dept_b["department"]
        department_ids.extend([department_a["id"], department_b["id"]])
        admin_ids.extend([dept_a["admin_id"], dept_b["admin_id"]])

        user_a = await _create_user(test_client, dept_a["admin_headers"], "a")
        user_b = await _create_user(test_client, dept_b["admin_headers"], "b")
        superadmin_created_user = await _create_user(test_client, admin_headers, "s", department_id=department_b["id"])
        user_ids.extend([user_a["id"], user_b["id"], superadmin_created_user["id"]])

        assert user_a["department_id"] == department_a["id"]
        assert superadmin_created_user["department_id"] == department_b["id"]

        forbidden_create = await test_client.post(
            "/api/auth/users",
            json={
                "username": f"ux_{uuid.uuid4().hex[:8]}",
                "password": "routerTest123!",
                "role": "user",
                "department_id": department_b["id"],
            },
            headers=dept_a["admin_headers"],
        )
        assert forbidden_create.status_code == 403, forbidden_create.text

        list_response = await test_client.get("/api/auth/users", headers=dept_a["admin_headers"])
        assert list_response.status_code == 200, list_response.text
        listed_users = list_response.json()
        listed_user_ids = {user["id"] for user in listed_users}
        assert user_a["id"] in listed_user_ids
        assert user_b["id"] not in listed_user_ids
        assert all(user["department_id"] == department_a["id"] for user in listed_users)

        page_response = await test_client.get(
            "/api/auth/users/page",
            params={"department_id": department_b["id"], "limit": 100},
            headers=dept_a["admin_headers"],
        )
        assert page_response.status_code == 200, page_response.text
        paged_users = page_response.json()["items"]
        paged_user_ids = {user["id"] for user in paged_users}
        assert user_a["id"] in paged_user_ids
        assert user_b["id"] not in paged_user_ids
        assert all(user["department_id"] == department_a["id"] for user in paged_users)

        options_response = await test_client.get("/api/auth/users/access-options", headers=dept_a["admin_headers"])
        assert options_response.status_code == 200, options_response.text
        access_options = options_response.json()
        option_uids = {user["uid"] for user in access_options}
        assert user_a["uid"] in option_uids
        assert user_b["uid"] not in option_uids
        assert all(user["department_id"] == department_a["id"] for user in access_options)

        superadmin_list_response = await test_client.get("/api/auth/users?limit=1000", headers=admin_headers)
        assert superadmin_list_response.status_code == 200, superadmin_list_response.text
        superadmin_user_ids = {user["id"] for user in superadmin_list_response.json()}
        assert user_a["id"] in superadmin_user_ids
        assert user_b["id"] in superadmin_user_ids

        own_read = await test_client.get(f"/api/auth/users/{user_a['id']}", headers=dept_a["admin_headers"])
        assert own_read.status_code == 200, own_read.text

        cross_read = await test_client.get(f"/api/auth/users/{user_b['id']}", headers=dept_a["admin_headers"])
        assert cross_read.status_code == 403, cross_read.text

        cross_update = await test_client.put(
            f"/api/auth/users/{user_b['id']}",
            json={"username": f"ub_{uuid.uuid4().hex[:8]}"},
            headers=dept_a["admin_headers"],
        )
        assert cross_update.status_code == 403, cross_update.text

        role_escalation = await test_client.put(
            f"/api/auth/users/{user_a['id']}", json={"role": "admin"}, headers=dept_a["admin_headers"]
        )
        assert role_escalation.status_code == 422, role_escalation.text

        cross_delete = await test_client.delete(f"/api/auth/users/{user_b['id']}", headers=dept_a["admin_headers"])
        assert cross_delete.status_code == 403, cross_delete.text

        own_delete = await test_client.delete(f"/api/auth/users/{user_a['id']}", headers=dept_a["admin_headers"])
        assert own_delete.status_code == 200, own_delete.text
        user_ids.remove(user_a["id"])
    finally:
        for user_id in user_ids:
            await _cleanup_user(test_client, admin_headers, user_id)
        for admin_id in admin_ids:
            await _cleanup_user(test_client, admin_headers, admin_id)
        for department_id in department_ids:
            await _cleanup_department(test_client, admin_headers, department_id)


async def test_invalid_token_is_rejected(test_client):
    headers = {"Authorization": "Bearer not-a-real-token"}
    response = await test_client.get("/api/auth/me", headers=headers)
    assert response.status_code == 401


async def test_deleted_user_token_is_rejected(test_client, admin_headers, standard_user):
    user_id = standard_user["user"]["id"]

    delete_response = await test_client.delete(f"/api/auth/users/{user_id}", headers=admin_headers)
    assert delete_response.status_code == 200, delete_response.text

    profile_response = await test_client.get("/api/auth/me", headers=standard_user["headers"])
    assert profile_response.status_code == 401


async def test_locked_user_token_is_rejected(test_client, standard_user):
    uid = standard_user["user"]["uid"]

    for _ in range(5):
        await test_client.post("/api/auth/token", data={"username": uid, "password": "wrong-password"})

    profile_response = await test_client.get("/api/auth/me", headers=standard_user["headers"])
    assert profile_response.status_code == 423
    assert "X-Lock-Remaining" in profile_response.headers


async def test_register_creates_user_with_usable_credential_on_real_postgres(test_client, admin_headers):
    """真实 PostgreSQL + 真实 HTTP：注册建号、专属部门按需创建并复用、凭据可用。

    这里必须走真实数据库：专属部门是「按需创建 + 并发撞唯一约束后重查」的路径，
    内存 SQLite 看不到唯一索引在真库上的行为。
    """
    suffix = uuid.uuid4().hex[:8]
    first_uid = f"reg_{suffix}"
    second_uid = f"regb_{suffix}"
    created_ids: list[int] = []
    # 独占的限流窗口（中间件按 `X-Forwarded-For` 取客户端 IP）：这条用例不该被同 IP 上
    # 其它用例或手工请求攒下的注册失败挡住
    headers = {"X-Forwarded-For": f"203.0.113.{uuid.uuid4().int % 254 + 1}"}

    first = await test_client.post(
        "/api/auth/register", json={"uid": first_uid, "password": "regTest123!"}, headers=headers
    )
    assert first.status_code == 201, first.text
    first_token = first.json()
    created_ids.append(first_token["user_id"])
    assert first_token["role"] == "user"

    try:
        # 凭据可用：/api/auth/me 走 get_required_user，没有部门会 400
        me = await test_client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {first_token['access_token']}"}
        )
        assert me.status_code == 200, me.text
        profile = me.json()
        assert profile["uid"] == first_uid
        assert profile["role"] == "user"
        department_id = profile["department_id"]
        assert department_id is not None

        # 第二个注册者复用同一个专属部门，不重复建
        second = await test_client.post(
            "/api/auth/register",
            json={"uid": second_uid, "password": "regTest123!"},
            headers=headers,
        )
        assert second.status_code == 201, second.text
        created_ids.append(second.json()["user_id"])
        second_me = await test_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {second.json()['access_token']}"},
        )
        assert second_me.status_code == 200, second_me.text
        assert second_me.json()["department_id"] == department_id

        # 专属部门的名字：/me 的 department_name 就是它（不必借管理员令牌）
        assert profile["department_name"] == "自助注册"

        # 唯一性在真库上拒绝
        duplicate = await test_client.post(
            "/api/auth/register",
            json={"uid": first_uid, "password": "regTest123!"},
            headers=headers,
        )
        assert duplicate.status_code == 400, duplicate.text
        assert "已被占用" in duplicate.json()["detail"]

        # 用同账号密码登录（注册时自动登录之外，独立验证一次凭据）
        login = await test_client.post(
            "/api/auth/token",
            data={"username": first_uid, "password": "regTest123!"},
            headers=headers,
        )
        assert login.status_code == 200, login.text
        assert login.json()["uid"] == first_uid
    finally:
        for user_id in created_ids:
            await _cleanup_user(test_client, admin_headers, user_id)


async def test_register_failures_do_not_block_login_from_the_same_ip(test_client):
    """限流窗口按 (IP, 端点) 分开：注册失败攒满后，同一 IP 的登录仍应放行。

    用独占的 `X-Forwarded-For` 拿一个只属于这条用例的窗口（中间件按该头取客户端 IP）：
    既不与其它用例共用窗口，也不需要账号、不写库、不用清理。载荷本身非法（UID 带空格），
    因此每次都是 400 而不会建号。
    """
    # TEST-NET-3 里每次运行换一个地址：窗口是 60 秒的进程级状态，固定地址会让
    # 相邻两次运行互相影响
    headers = {"X-Forwarded-For": f"203.0.113.{uuid.uuid4().int % 254 + 1}"}
    payload = {"uid": "a b", "password": "regTest123!"}

    statuses: list[int] = []
    for _ in range(RATE_LIMIT_MAX_ATTEMPTS + 1):
        attempt = await test_client.post("/api/auth/register", json=payload, headers=headers)
        statuses.append(attempt.status_code)
        if attempt.status_code == 429:
            break

    assert statuses[-1] == 429, statuses
    assert set(statuses[:-1]) == {400}, statuses

    blocked = await test_client.post("/api/auth/register", json=payload, headers=headers)
    assert blocked.json()["detail"] == "注册尝试过于频繁，请稍后再试"

    # 同一 IP 的登录不受注册窗口影响：凭据错是 401，不是 429
    login = await test_client.post(
        "/api/auth/token",
        data={"username": "no-such-user", "password": "wrong-password"},
        headers=headers,
    )
    assert login.status_code == 401, login.text


async def test_superadmin_created_user_without_department_lands_in_creators_department(test_client, admin_headers):
    """超管建号不指定部门时落到自己的部门。

    真库上未必有名为「默认部门」的部门（本项目 dev 库是 研发部/产品部/运营部），旧行为在这种
    部署上会静默写 `department_id = NULL`，造出一个每个端点都 400 的账号；这里连同「新账号可用」
    一起验：注册/建号后必须能登录并通过 `get_required_user`。
    """
    suffix = uuid.uuid4().hex[:8]
    created_id: int | None = None
    try:
        response = await test_client.post(
            "/api/auth/users",
            json={"username": f"dfb{suffix}", "password": "routerTest123!"},
            headers=admin_headers,
        )
        assert response.status_code == 200, response.text
        created = response.json()
        created_id = created["id"]

        creator = await test_client.get("/api/auth/me", headers=admin_headers)
        assert creator.status_code == 200, creator.text
        assert created["department_id"] is not None
        assert created["department_id"] == creator.json()["department_id"]

        login = await test_client.post(
            "/api/auth/token",
            data={"username": created["uid"], "password": "routerTest123!"},
        )
        assert login.status_code == 200, login.text
        me = await test_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {login.json()['access_token']}"},
        )
        assert me.status_code == 200, me.text
        assert me.json()["department_id"] == created["department_id"]
    finally:
        if created_id is not None:
            await _cleanup_user(test_client, admin_headers, created_id)
