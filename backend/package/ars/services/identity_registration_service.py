"""自助注册用例的事务 Owner。

与首启建号（`identity_admin_service`）分开：那条路径建默认部门与超级管理员，只在库为空时成立；
这条只建一个普通用户，且必须**在系统已初始化之后**才允许——否则第一个注册者会让库不再为空，
登录页的首启初始化表单从此消失，部署方再也建不出超级管理员。
"""

from ars.repositories.department_repository import DepartmentRepository
from ars.repositories.user_repository import UserRepository
from ars.services.identity_admin_service import IdentityConflictError
from ars.services.operation_log_service import log_operation
from ars.services.user_identity_service import validate_uid
from ars.storage.postgres.models_business import Department, User
from ars.utils.auth_utils import AuthUtils
from ars.utils.datetime_utils import utc_now_naive
from fastapi import Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

# 自助注册用户的专属部门，不存在时创建（与 OIDC 自动建号的 `default_department` 同口径）
SELF_REGISTRATION_DEPARTMENT_NAME = "自助注册"


class RegistrationClosedError(Exception):
    """注册当前不可用：系统尚未初始化。"""


class InvalidRegistrationError(Exception):
    """注册载荷在信任边界上不合法（UID 格式等）。"""


async def _resolve_registration_department(db: AsyncSession) -> Department:
    """自助注册用户落在专属部门，不存在时创建。

    不落「默认部门」：那是初始化流程建的，真实部署可能改名或删除（本项目 dev 库就是
    研发部 / 产品部 / 运营部），按名字找会让注册在这些部署上直接不可用。也不落超管所在的
    部门：那等于把该部门的可见性隐式授予任何自助注册的人。专属部门与 OIDC 自动建号
    （`oidc_service` 的 `default_department`）是同一套做法，管理员随后可按需把用户调走。
    """
    repository = DepartmentRepository(db)
    existing = await repository.get_by_name(SELF_REGISTRATION_DEPARTMENT_NAME)
    if existing is not None:
        return existing

    try:
        return await repository.create(
            {
                "name": SELF_REGISTRATION_DEPARTMENT_NAME,
                "description": "自助注册用户的默认部门",
            }
        )
    except IntegrityError as exc:
        # 并发注册同时建部门：回滚后重查，拿对方建好的那个
        await db.rollback()
        existing = await repository.get_by_name(SELF_REGISTRATION_DEPARTMENT_NAME)
        if existing is None:
            raise IdentityConflictError("创建自助注册部门失败，请重试") from exc
        return existing


async def register_user(
    db: AsyncSession,
    *,
    uid: str,
    password: str,
    phone_number: str | None,
    request: Request | None = None,
) -> User:
    """创建一个普通用户：角色 `user`、落在自助注册部门、注册即视为已登录。

    `request` 只为审计：公开端点应当留下来源 IP（与管理员建号同口径）。
    """
    repository = UserRepository(db)

    if await repository.is_first_run():
        raise RegistrationClosedError("系统尚未初始化，请先创建超级管理员")

    is_valid, message = validate_uid(uid)
    if not is_valid:
        raise InvalidRegistrationError(message)
    if await repository.exists_by_uid(uid):
        raise IdentityConflictError("该用户ID已被占用")
    if await repository.exists_by_phone(uid):
        # 登录标识先按 uid 解析（`get_by_login_identifier`），占用别人的手机号会让对方
        # 再也无法用手机号登录（uid 允许 11 位数字，与手机号形态重合）
        raise IdentityConflictError("该用户ID与已有手机号冲突")
    if phone_number:
        if await repository.exists_by_phone(phone_number):
            raise IdentityConflictError("该手机号已被占用")
        if await repository.exists_by_uid(phone_number):
            raise IdentityConflictError("该手机号与已有用户ID冲突")

    department = await _resolve_registration_department(db)

    try:
        user = await repository.create(
            {
                "username": uid,
                "uid": uid,
                "phone_number": phone_number,
                "avatar": None,
                "password_hash": AuthUtils.hash_password(password),
                "role": "user",
                "department_id": department.id,
                "last_login": utc_now_naive(),
            }
        )
    except IntegrityError as exc:
        # 并发注册撞上唯一约束（UID 或手机号）
        await db.rollback()
        raise IdentityConflictError("该用户ID或手机号已被占用") from exc

    await log_operation(db, user.id, "用户注册", f"自助注册用户 {user.uid}", request)
    await db.commit()
    return user
