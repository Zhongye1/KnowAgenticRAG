"""身份工厂：seed 真实用户/部门/角色 + 签发真实 access token。

为什么不用依赖覆盖：权限链的读取点是 ``request.user``（get_user_context）、
``request.user.roles[].menus[].perms``（rbac_verify）以及 ``user_id/dept_id/roles``
（resolve_kb_perm / expand_principals）。override 掉 JWT 依赖等于把整层 ACL 跳过，
那样的用例证明不了任何权限语义——chat/agent 的罐头冒烟就是这么做的，所以它们不测权限。

本模块的做法：往 ``sys_dept`` / ``sys_user`` / ``sys_user_role`` / ``sys_role`` /
``sys_role_menu`` 写真实行，再调**真实的** ``create_access_token``（写入 Redis 会话键），
得到可直接用的 ``Authorization``。不走登录接口（受验证码开关与限流影响，且登录属
admin 域，非本套件关注点）。

``mint_token`` 是例外通道：外部 IdP / PAT 桥接会给 JWT 带上 API 面不产生的 claim
（如 MCP ``scp``），只能用同一密钥本地补签来构造这类主体。
"""

from __future__ import annotations

import uuid

from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from sqlalchemy import text

from backend.src.common.security.jwt import create_access_token, jwt_encode
from backend.src.core.config import settings
from backend.src.database.redis import redis_client
from backend.src.utils.timezone import timezone

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = [
    'DEPT_ALPHA',
    'DEPT_BETA',
    'DEPT_BETA_CHILD',
    'PERSONAS',
    'ROLE_FULL',
    'ROLE_READONLY',
    'Identity',
    'build_identities',
    'drop_identities',
    'mint_token',
]

# 部门：种子已建 root(1)；alpha 与 beta 平级，beta_child 用于验证部门祖先链
DEPT_ALPHA = 9101
DEPT_BETA = 9102
DEPT_BETA_CHILD = 9103

# 角色：种子角色 1 挂全部 RAG 菜单（含 rag:kb:* 全功能码）；只读角色只挂读面菜单
ROLE_FULL = 1
ROLE_READONLY = 9201
_READONLY_MENU_IDS = (51, 52, 53, 54, 55)

# 复用种子里 admin 的 bcrypt 哈希占位：本套件从不走密码校验，只需要非空值
_PASSWORD_PLACEHOLDER = '$2b$12$8y2eNucX19VjmZ3tYhBLcOsBwy9w1IjBQE4SSqwMDL5bGQVp2wqS.'

# 主体规格：(key, user_id, dept_id, role_id, is_staff, is_superuser)
# superuser 走 is_superuser 标记（rbac_verify 对其提前返回），不依赖 admin 登录（登录受验证码开关约束）
_SPECS: tuple[tuple[str, int, int, int, bool, bool], ...] = (
    ('owner', 9301, DEPT_ALPHA, ROLE_FULL, True, False),
    ('mate', 9302, DEPT_ALPHA, ROLE_FULL, True, False),
    ('outsider', 9303, DEPT_BETA, ROLE_FULL, True, False),
    ('reader', 9304, DEPT_BETA, ROLE_FULL, True, False),
    ('contributor', 9305, DEPT_BETA, ROLE_FULL, True, False),
    ('manager', 9306, DEPT_BETA, ROLE_FULL, True, False),
    ('readonly_role', 9307, DEPT_BETA, ROLE_READONLY, True, False),
    ('dept_child', 9308, DEPT_BETA_CHILD, ROLE_FULL, True, False),
    ('superuser', 9309, DEPT_ALPHA, ROLE_FULL, True, True),
)
PERSONAS: tuple[str, ...] = tuple(spec[0] for spec in _SPECS)


@dataclass(frozen=True)
class Identity:
    """已签发的调用主体。"""

    key: str
    user_id: int
    dept_id: int
    role_id: int
    headers: dict[str, str]


async def build_identities(session: AsyncSession) -> dict[str, Identity]:
    """幂等 seed 全部主体并签发 token。"""
    await _ensure_depts(session)
    await _ensure_readonly_role(session)
    for key, user_id, dept_id, role_id, is_staff, is_superuser in _SPECS:
        await _ensure_user(
            session,
            key=key,
            user_id=user_id,
            dept_id=dept_id,
            role_id=role_id,
            is_staff=is_staff,
            is_superuser=is_superuser,
        )

    identities: dict[str, Identity] = {}
    for key, user_id, dept_id, role_id, _staff, _su in _SPECS:
        # JWT 用户信息有 Redis 缓存：造完/改完用户必须清，否则读到脏用户
        await redis_client.delete(f'{settings.JWT_USER_REDIS_PREFIX}:{user_id}')
        token = await create_access_token(user_id, multi_login=True)
        identities[key] = Identity(
            key=key,
            user_id=user_id,
            dept_id=dept_id,
            role_id=role_id,
            headers={'Authorization': f'Bearer {token.access_token}'},
        )
    return identities


async def drop_identities(session: AsyncSession) -> None:
    """清理本模块造的主体（按固定 ID 区间，不影响种子数据）。"""
    for _key, user_id, _dept_id, _role_id, _staff, _su in _SPECS:
        await redis_client.delete(f'{settings.JWT_USER_REDIS_PREFIX}:{user_id}')
        await session.execute(text('DELETE FROM sys_user_role WHERE user_id = :uid'), {'uid': user_id})
        await session.execute(text('DELETE FROM sys_user WHERE id = :uid'), {'uid': user_id})
    await session.execute(text('DELETE FROM sys_role_menu WHERE role_id = :role'), {'role': ROLE_READONLY})
    await session.execute(text('DELETE FROM sys_role WHERE id = :role'), {'role': ROLE_READONLY})
    # 子部门先删，避免父部门行被引用
    for dept_id in (DEPT_BETA_CHILD, DEPT_ALPHA, DEPT_BETA):
        await session.execute(text('DELETE FROM sys_dept WHERE id = :did'), {'did': dept_id})


async def mint_token(user_id: int | str, **claims: Any) -> str:
    """补签带自定义 claim 的 token（外部 IdP/PAT 桥接通道的替身）。

    仅用于 API 面不会产生的 claim（如 MCP ``scp``）。会话键与 fba 同源，
    否则 MCP ``_session_alive`` 校验会 fail-closed 判为无效凭证。
    """
    session_uuid = str(uuid.uuid4())
    expire = timezone.now() + timedelta(seconds=settings.TOKEN_EXPIRE_SECONDS)
    token = jwt_encode({
        'session_uuid': session_uuid,
        'exp': timezone.to_utc(expire).timestamp(),
        'sub': str(user_id),
        **claims,
    })
    await redis_client.set(
        f'{settings.TOKEN_REDIS_PREFIX}:{user_id}:{session_uuid}',
        token,
        ex=settings.TOKEN_EXPIRE_SECONDS,
    )
    return token


async def _ensure_depts(session: AsyncSession) -> None:
    for dept_id, parent_id in ((DEPT_ALPHA, 1), (DEPT_BETA, 1), (DEPT_BETA_CHILD, DEPT_BETA)):
        await session.execute(
            text(
                'INSERT INTO sys_dept (id, name, sort, status, deleted, parent_id, created_time) '
                'VALUES (:id, :name, 0, 1, 0, :parent, now()) ON CONFLICT (id) DO NOTHING'
            ),
            {'id': dept_id, 'name': f'e2e_dept_{dept_id}', 'parent': parent_id},
        )


async def _ensure_readonly_role(session: AsyncSession) -> None:
    await session.execute(
        text(
            'INSERT INTO sys_role (id, name, status, is_filter_scopes, remark, created_time) '
            "VALUES (:id, 'e2e_readonly', 1, true, 'e2e 只读角色（无写权限码）', now()) "
            'ON CONFLICT (id) DO NOTHING'
        ),
        {'id': ROLE_READONLY},
    )
    for menu_id in _READONLY_MENU_IDS:
        # 显式主键 + 存在性判断：sys_role_menu 的 PK 是 (id, role_id, menu_id)，
        # 不依赖 (role_id, menu_id) 上的唯一约束，避免 ON CONFLICT 依赖未声明的索引
        await session.execute(
            text(
                'INSERT INTO sys_role_menu (id, role_id, menu_id) '
                'SELECT :id, :role, :menu '
                'WHERE NOT EXISTS (SELECT 1 FROM sys_role_menu WHERE role_id = :role AND menu_id = :menu)'
            ),
            {'id': 92_000 + menu_id, 'role': ROLE_READONLY, 'menu': menu_id},
        )


async def _ensure_user(
    session: AsyncSession,
    *,
    key: str,
    user_id: int,
    dept_id: int,
    role_id: int,
    is_staff: bool,
    is_superuser: bool = False,
) -> None:
    await session.execute(
        text(
            'INSERT INTO sys_user (id, uuid, username, nickname, password, email, status, is_superuser, '
            'is_staff, is_multi_login, join_time, dept_id, deleted, created_time) '
            'VALUES (:id, gen_random_uuid(), :username, :nickname, :pwd, :email, 1, :su, '
            ':staff, true, now(), :dept, 0, now()) ON CONFLICT (id) DO NOTHING'
        ),
        {
            'id': user_id,
            'username': f'e2e_{key}',
            'nickname': f'e2e_{key}',
            'pwd': _PASSWORD_PLACEHOLDER,
            'email': f'e2e_{key}@example.com',
            'staff': is_staff,
            'su': is_superuser,
            'dept': dept_id,
        },
    )
    await session.execute(
        text(
            'INSERT INTO sys_user_role (id, user_id, role_id) '
            'SELECT :id, :user, :role '
            'WHERE NOT EXISTS (SELECT 1 FROM sys_user_role WHERE user_id = :user AND role_id = :role)'
        ),
        {'id': 93_000 + user_id, 'user': user_id, 'role': role_id},
    )
