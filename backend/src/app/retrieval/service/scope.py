"""检索范围构建（agent-layer spec ACL 设计 §4/§5）。

职责：
1. build_retrieval_scope()：从用户身份 + RBAC + ACL 构建 Scope
2. to_milvus_expr()：Scope → Milvus 过滤表达式
3. Scope 对象：携带用户组、允许的 KB 列表等上下文

过滤发生在召回内部（不是召回后过滤）、过滤条件由服务端构造（不是客户端传入）、
kb_name 必须与授权范围求交（不是拿来就用）。
"""

from __future__ import annotations

import re

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from fastapi import HTTPException, status
from sqlalchemy import func, select, text

from backend.src.common.log import log

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


__all__ = [
    'Scope',
    'UserContext',
    'build_retrieval_scope',
    'to_milvus_expr',
    'validate_ids_for_expr',
]

# ID 白名单校验：只允许字母、数字、下划线、连字符
_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]+$')
_MAX_IDS_IN_EXPR = 200  # 防止表达式过长
_MAX_DEPT_DEPTH = 20  # 防止部门树循环引用


@dataclass(frozen=True)
class UserContext:
    """用户上下文：构建检索范围所需的最小身份信息。

    HTTP 路由从 ``request.user`` 构造；MCP 从 ``UserContext(sub/tenant)`` 构造。
    ``dept_id`` 为 None 时 ``build_retrieval_scope`` 会查 DB 补全（MCP 路径）。
    """

    user_id: str
    namespace: str
    dept_id: int | None = None


@dataclass(frozen=True)
class Scope:
    """检索范围：携带用户组、允许的 KB 列表等上下文。

    由 build_retrieval_scope() 构建，供 to_milvus_expr() 生成过滤表达式。
    """

    namespace: str
    user_id: str
    groups: list[str] = field(default_factory=list)
    allowed_kbs: list[str] = field(default_factory=list)


def validate_ids_for_expr(ids: list[str], field_name: str) -> None:
    """校验 ID 列表符合白名单规则（防注入）。"""
    if len(ids) > _MAX_IDS_IN_EXPR:
        raise ValueError(f'{field_name} 数量超限: {len(ids)} > {_MAX_IDS_IN_EXPR}')
    for item in ids:
        if not _ID_PATTERN.match(item):
            raise ValueError(f'{field_name} 包含非法字符: {item}')


def to_milvus_expr(scope: Scope) -> str:
    """Scope → Milvus 过滤表达式（ID 白名单校验防注入）。

    表达式语义：
    - namespace 精确匹配（租户硬边界）
    - visibility == "public" OR owner_id == user_id OR groups 有交集（文档级 ACL）

    注意：``kb_name`` 过滤由 ``search_ragf_kb()`` 在 Milvus 层注入（单 KB per
    call），KB 级 ACL 在服务层通过 ``allowed_kbs`` 求交校验，不在本表达式内。
    """
    # 安全兜底：无权访问任何 KB 时返回不匹配表达式
    if not scope.allowed_kbs:
        return 'namespace == "__no_access__"'

    # 白名单校验
    validate_ids_for_expr([scope.namespace], 'namespace')
    validate_ids_for_expr(scope.groups, 'groups')
    if scope.user_id:
        validate_ids_for_expr([scope.user_id], 'user_id')

    # 文档级 ACL：visibility == "public" or owner_id == user or groups 有交集
    doc_filters = ['visibility == "public"']
    if scope.user_id:
        doc_filters.append(f'owner_id == "{scope.user_id}"')
    if scope.groups:
        groups = ','.join(f'"{g}"' for g in scope.groups)
        doc_filters.append(f'array_contains_any(groups, [{groups}])')
    doc_filter = ' or '.join(doc_filters)

    return f'namespace == "{scope.namespace}" and ({doc_filter})'


# ---------------------------------------------------------------------------
# Scope 构建
# ---------------------------------------------------------------------------


async def build_retrieval_scope(
    db: AsyncSession,
    *,
    user: UserContext,
    namespace: str,
    kb_names: list[str] | None = None,
) -> Scope:
    """构建检索范围（scope 构建在服务端，客户端不可传入任何过滤语义）。

    流程：
    1. namespace 校验（header 只能"选"，不能"越"）
    2. 补全 dept_id（MCP 路径可能没有）
    3. 展开用户组（本人 + 部门 + 祖先部门）
    4. 查询 allowed_kbs（KB 级 ACL）
    5. 如果指定了 kb_names，求交校验
    """
    # 1. namespace 校验
    if user.namespace and namespace != user.namespace:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f'namespace 不匹配: {namespace}',
        )

    # 2. 补全 dept_id（MCP 路径可能没有，查 DB 补全）
    dept_id = user.dept_id
    if dept_id is None and user.user_id:
        dept_id = await _resolve_user_dept_id(db, user.user_id)

    # 3. 展开用户组（本人 ID + 直属部门 + 祖先部门链）
    groups = await _expand_user_groups(db, user.user_id, dept_id)

    # 4. 查询 allowed_kbs（KB 级 ACL）
    allowed_kbs = await _resolve_allowed_kbs(db, namespace=namespace, groups=groups)

    # 5. 如果指定了 kb_names，求交校验（防 IDOR）
    if kb_names:
        requested = set(kb_names)
        allowed = set(allowed_kbs)
        denied = requested - allowed
        if denied:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f'无权访问以下知识库: {sorted(denied)}',
            )
        allowed_kbs = [kb for kb in allowed_kbs if kb in requested]

    return Scope(
        namespace=namespace,
        user_id=user.user_id,
        groups=groups,
        allowed_kbs=allowed_kbs,
    )


async def _resolve_user_dept_id(db: AsyncSession, user_id: str) -> int | None:
    """从 sys_user 表查询用户部门 ID（MCP 路径补全用）。"""
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


async def _expand_user_groups(db: AsyncSession, user_id: str, dept_id: int | None) -> list[str]:
    """展开用户组（本人 ID + 直属部门 + 祖先部门链）。

    组 ID 即 Admin 部门 ID（``sys_dept.id``），RAG ACL 引用同一套 ID。
    部门树变更通过查询期展开天然跟随；缓存 30~60s 待后续实现。
    """
    groups = [user_id]
    if dept_id is not None:
        groups.extend(await _walk_dept_ancestors(db, dept_id))
    return groups


async def _walk_dept_ancestors(db: AsyncSession, dept_id: int) -> list[str]:
    """沿 parent_id 链向上遍历，收集部门 ID 及所有祖先 ID。"""
    groups: list[str] = []
    current: int | None = dept_id
    visited: set[int] = set()  # 防循环引用
    for _ in range(_MAX_DEPT_DEPTH):
        if current is None or current in visited:
            break
        visited.add(current)
        groups.append(str(current))
        row = await db.execute(
            text('SELECT parent_id FROM sys_dept WHERE id = :id AND deleted = 0'),
            {'id': current},
        )
        result = row.fetchone()
        if result is None:
            break
        current = result[0]
    return groups


async def _resolve_allowed_kbs(
    db: AsyncSession,
    *,
    namespace: str,
    groups: list[str],
) -> list[str]:
    """查询用户有权限访问的 KB 列表（KB 级 ACL）。

    如果 rag_kb_acl 表为空（未配置 ACL），返回该 namespace 下所有 KB（向后兼容）。
    如果 rag_kb_acl 表有记录，只返回用户组有权限的 KB。
    """
    from backend.src.app.kb.model.acl import KbAcl

    # 查询该 namespace 下是否有 ACL 记录
    acl_count = await db.scalar(select(func.count()).select_from(KbAcl).where(KbAcl.plugin_namespace == namespace))

    # 无 ACL 记录 → 向后兼容：返回所有 KB
    if acl_count == 0:
        from backend.src.app.kb.model.knowledge_base import KnowledgeBase

        kbs = await db.scalars(select(KnowledgeBase.kb_name).where(KnowledgeBase.plugin_namespace == namespace))
        return list(kbs.all())

    # 有 ACL 记录 → 只返回用户组有权限的 KB
    if not groups:
        return []

    stmt = (
        select(KbAcl.kb_name)
        .where(
            KbAcl.plugin_namespace == namespace,
            KbAcl.group_id.in_(groups),
        )
        .distinct()
    )
    result = await db.scalars(stmt)
    return list(result.all())
