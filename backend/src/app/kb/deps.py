"""KB 模块公共依赖：JWT 之外的租户域解析与检索范围构建。"""

from typing import Annotated

from fastapi import Depends, Header, Request

from backend.src.app.kb.utils.namespace import resolve_namespace
from backend.src.app.retrieval.service.scope import Scope, UserContext, build_retrieval_scope
from backend.src.database.db import CurrentSession

__all__ = ['CurrentNamespace', 'CurrentScope', 'get_current_tenant', 'get_retrieval_scope']


def get_current_tenant(
    x_plugin_namespace: Annotated[str | None, Header(alias='X-Plugin-Namespace')] = None,
) -> str:
    """解析实例域；显式传入且与实例不一致时 403。"""
    return resolve_namespace(x_plugin_namespace)


CurrentNamespace = Annotated[str, Depends(get_current_tenant)]


async def get_retrieval_scope(
    request: Request,
    db: CurrentSession,
    current_namespace: CurrentNamespace,
) -> Scope:
    """构建检索范围（ACL 过滤），供检索/聊天路由注入。

    scope 构建在服务端，客户端不可传入任何过滤语义。dept_id 从 request.user
    获取（HTTP 路径）；MCP 路径在 mcp/service._build_scope 中自行构建。
    """
    return await build_retrieval_scope(
        db,
        user=UserContext(
            user_id=str(request.user.id),
            namespace=current_namespace,
            dept_id=request.user.dept_id,
        ),
        namespace=current_namespace,
    )


CurrentScope = Annotated[Scope, Depends(get_retrieval_scope)]
