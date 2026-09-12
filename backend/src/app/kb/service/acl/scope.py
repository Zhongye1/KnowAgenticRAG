"""检索/授权范围构建（kb-ownership-and-acl-v2 spec §5.1/§5.3、§6.1）。

build_retrieval_scope() 是 KB 级 ACL 的查询期统一入口（自 retrieval 下沉，D46）：
1. namespace 校验（header 只能"选"，不能"越"）
2. 主体展开（principals.py）+ default deny 批量求值（resolver.py，D45）
3. kb_names 与 allowed_kbs 求交（防 IDOR；批量检索语义保留 403）

Scope 供 to_milvus_expr()（retrieval 域）生成召回内过滤表达式。
"""

from dataclasses import dataclass, field

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.service.acl.principals import expand_principals
from backend.src.app.kb.service.acl.resolver import resolve_visible_kbs

__all__ = ['Scope', 'UserContext', 'build_retrieval_scope']


@dataclass(frozen=True)
class UserContext:
    """用户上下文：求值与主体展开所需的最小身份信息。

    HTTP 路由从 ``request.user`` 构造；MCP 从 JWT claims 构造。``roles`` 供
    role 主体展开：HTTP 传 JWT 已加载的角色 ID 列表；MCP 传 None 时由
    principals.expand_principals 查库补全（只读 SQL）。
    """

    user_id: str
    namespace: str
    dept_id: int | None = None
    roles: list[str] | None = None


@dataclass(frozen=True)
class Scope:
    """检索范围：用户主体组、允许的 KB 列表等上下文。

    ``groups`` 为文档级 Milvus 镜像可匹配的主体 ID（user_id + 部门祖先链），
    role/group 主体无召回内下推通道，不进入该列表。
    """

    namespace: str
    user_id: str
    groups: list[str] = field(default_factory=list)
    allowed_kbs: list[str] = field(default_factory=list)


async def build_retrieval_scope(
    db: AsyncSession,
    *,
    user: UserContext,
    namespace: str,
    kb_names: list[str] | None = None,
) -> Scope:
    """构建检索范围（scope 构建在服务端，客户端不可传入任何过滤语义）。"""
    # 1. namespace 校验
    if user.namespace and namespace != user.namespace:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f'namespace 不匹配: {namespace}',
        )

    # 2. 主体展开（user/role/dept 祖先链；MCP 路径 dept/roles 缺省时查库补全）
    principals = await expand_principals(db, user_id=user.user_id, dept_id=user.dept_id, roles=user.roles)
    groups = [user.user_id] if user.user_id else []
    groups.extend(p.id for p in principals if p.type == 'dept' and p.id not in groups)

    # 3. default deny 批量求值（移除 v1"ACL 表为空=全放开"回退，D45）
    allowed_kbs = await resolve_visible_kbs(
        db,
        user_id=user.user_id,
        dept_id=user.dept_id,
        roles=user.roles,
    )

    # 4. kb_names 求交校验（防 IDOR；批量检索的显式越权保留 403 诊断语义，D50）
    if kb_names:
        denied = set(kb_names) - set(allowed_kbs)
        if denied:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f'无权访问以下知识库: {sorted(denied)}',
            )
        allowed_kbs = [kb for kb in allowed_kbs if kb in set(kb_names)]

    return Scope(
        namespace=namespace,
        user_id=user.user_id,
        groups=groups,
        allowed_kbs=allowed_kbs,
    )
