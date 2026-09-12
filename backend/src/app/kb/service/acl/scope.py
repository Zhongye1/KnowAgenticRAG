"""检索/授权共用的用户上下文（kb-ownership-and-acl-v2 spec §5.1）。

HTTP 路由从 ``request.user`` 构造；MCP 从 JWT claims 构造。``roles`` 供
role 主体展开：HTTP 传 JWT 已加载的角色 ID 列表；MCP 传 None 时由
principals.expand_principals 查库补全（只读 SQL）。
"""

from dataclasses import dataclass

__all__ = ['UserContext']


@dataclass(frozen=True)
class UserContext:
    """用户上下文：求值与主体展开所需的最小身份信息。"""

    user_id: str
    namespace: str
    dept_id: int | None = None
    roles: list[str] | None = None
