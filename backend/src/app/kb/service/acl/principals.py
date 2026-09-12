"""主体展开（kb-ownership-and-acl-v2 spec §4.4 第 1 步、§5.3）。

user/role/dept(含祖先链)/group → 求值用的主体集合。sys_dept/sys_user_role
经只读 SQL 访问（沿用 retrieval/service/scope.py 的既有做法），不 import
admin 域；HTTP 路径 roles 来自 JWT 已加载角色，MCP 路径查库补全。

Phase 3 将把 retrieval 的 scope 构建下沉到本域，届时本模块是主体展开的
唯一实现点（禁止各域各写一份）。
"""

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.common.log import log

__all__ = ['Principal', 'expand_principals']

_MAX_DEPT_DEPTH = 20  # 防部门树循环引用


@dataclass(frozen=True)
class Principal:
    """授权主体：(类型, ID)。KB/文档 ACL 条目以二元组对齐。"""

    type: str  # user / role / dept / group
    id: str


async def expand_principals(
    db: AsyncSession, *, user_id: str, dept_id: int | None, roles: list[str] | None
) -> list[Principal]:
    """展开用户主体集合 P = {user} ∪ {role} ∪ {dept 及祖先链}。

    - roles 传 None 时查库补全（MCP 路径）；传空列表 = 明确无角色
    - dept_id 传 None 时查库补全
    - group 主体首版预留（spec §4.2 不开放写入），此处不展开
    """
    role_ids = roles if roles is not None else await _load_user_role_ids(db, user_id)
    principals = [Principal('user', user_id)]
    principals.extend(Principal('role', str(role_id)) for role_id in role_ids)
    resolved_dept = dept_id if dept_id is not None else await _resolve_user_dept_id(db, user_id)
    if resolved_dept is not None:
        principals.extend(Principal('dept', d) for d in await _walk_dept_ancestors(db, resolved_dept))
    return principals


async def _load_user_role_ids(db: AsyncSession, user_id: str) -> list[str]:
    """查库补全用户角色 ID（MCP 路径；只读，不校验角色状态——停用角色在 RBAC 层拦截）。"""
    try:
        rows = await db.execute(
            text('SELECT role_id FROM sys_user_role WHERE user_id = :uid'),
            {'uid': int(user_id)},
        )
        return [str(row[0]) for row in rows.fetchall()]
    except (ValueError, Exception) as exc:
        log.debug('查询用户角色失败 user_id={}: {}', user_id, exc)
        return []


async def _resolve_user_dept_id(db: AsyncSession, user_id: str) -> int | None:
    """查库补全用户部门 ID（MCP 路径）。"""
    try:
        row = await db.execute(
            text('SELECT dept_id FROM sys_user WHERE id = :uid AND deleted = 0'),
            {'uid': int(user_id)},
        )
        result = row.fetchone()
        return int(result[0]) if result and result[0] is not None else None
    except (ValueError, Exception) as exc:
        log.debug('查询用户部门失败 user_id={}: {}', user_id, exc)
        return None


async def _walk_dept_ancestors(db: AsyncSession, dept_id: int) -> list[str]:
    """沿 parent_id 链向上遍历，收集部门 ID 及所有祖先 ID。"""
    ids: list[str] = []
    current: int | None = dept_id
    visited: set[int] = set()
    for _ in range(_MAX_DEPT_DEPTH):
        if current is None or current in visited:
            break
        visited.add(current)
        ids.append(str(current))
        row = await db.execute(
            text('SELECT parent_id FROM sys_dept WHERE id = :id AND deleted = 0'),
            {'id': current},
        )
        result = row.fetchone()
        if result is None:
            break
        current = result[0]
    return ids
