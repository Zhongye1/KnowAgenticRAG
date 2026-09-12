"""KB 模块公共依赖：租户域解析、当前用户上下文与检索范围构建。"""

from typing import Annotated

from fastapi import Depends, Header, Request
from starlette.authentication import UnauthenticatedUser

from backend.src.app.kb.service.acl.scope import Scope, UserContext, build_retrieval_scope
from backend.src.app.kb.utils.namespace import resolve_namespace
from backend.src.database.db import CurrentSession

__all__ = [
    'CurrentKbUser',
    'CurrentNamespace',
    'CurrentScope',
    'get_current_tenant',
    'get_retrieval_scope',
    'get_user_context',
]


def get_current_tenant(
    x_plugin_namespace: Annotated[str | None, Header(alias='X-Plugin-Namespace')] = None,
) -> str:
    """解析实例域；显式传入且与实例不一致时 403。"""
    return resolve_namespace(x_plugin_namespace)


CurrentNamespace = Annotated[str, Depends(get_current_tenant)]


def get_user_context(request: Request, current_namespace: CurrentNamespace) -> UserContext:
    """request.user → 求值用 UserContext（roles 取 JWT 已加载角色，供 role 主体展开）。"""
    if isinstance(request.user, UnauthenticatedUser):
        return UserContext(user_id='', namespace=current_namespace, dept_id=None, roles=[])
    roles = [str(r.id) for r in (getattr(request.user, 'roles', None) or [])]
    return UserContext(
        user_id=str(request.user.id),
        namespace=current_namespace,
        dept_id=getattr(request.user, 'dept_id', None),
        roles=roles,
    )


CurrentKbUser = Annotated[UserContext, Depends(get_user_context)]


async def get_retrieval_scope(
    request: Request,
    db: CurrentSession,
    current_namespace: CurrentNamespace,
) -> Scope:
    """构建检索范围（ACL 过滤），供检索/聊天路由注入。

    scope 构建在服务端，客户端不可传入任何过滤语义。dept_id/roles 从
    request.user 获取（HTTP 路径）；MCP 路径在 mcp/service._build_scope 中
    自行构建。
    """
    return await build_retrieval_scope(
        db, user=get_user_context(request, current_namespace), namespace=current_namespace
    )


CurrentScope = Annotated[Scope, Depends(get_retrieval_scope)]
