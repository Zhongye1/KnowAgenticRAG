"""MCP 多凭证鉴权归一（agent-layer spec §5.5/D22/D31-D33）。

三类凭证收敛在中间件：自家 host 走 fba 签发 JWT 直通（HS256 本地校验，aud
同域放宽、不引入新 IdP，D31-A）；Codex PAT 经桥接进程 env 注入（服务端与
``RAGF_MCP_PAT`` 常量时间比对）；Claude Code OAuth 2.1 待 Keycloak DCR 就绪后
作为 IdP 通道接入（示例中的 RS256/JWKS 仅供参考，不是实现要求）。

归一产物为 ``UserContext(sub/tenant/scp)``；``scp`` 优先取 JWT ``scp`` claim，
缺省回退 ``RAGF_MCP_DEFAULT_SCOPES``（读面工具集）——权限点映射既有 RBAC，
不发明第二套权限模型。
"""

from __future__ import annotations

import hmac

from typing import Annotated, Any

from fastapi import Depends, Header
from jose import JWTError, jwt

from backend.src.app.kb.deps import get_current_tenant
from backend.src.app.mcp.schemas import READ_SCOPES, UserContext
from backend.src.common.exception import errors
from backend.src.core.config import settings

__all__ = [
    'McpUserContext',
    'UserContext',
    'authenticate_bearer',
    'default_scopes',
    'filter_tools',
    'normalize_scopes',
    'require_perms',
]


def default_scopes() -> frozenset[str]:
    """默认读面权限点（无 scp claim 的 JWT 直通与 PAT 通道共用）。"""
    raw = str(settings.RAGF_MCP_DEFAULT_SCOPES or '').strip()
    return frozenset({item.strip() for item in raw.split(',') if item.strip()}) if raw else READ_SCOPES


def normalize_scopes(value: Any) -> frozenset[str]:
    """JWT ``scp`` claim 归一：逗号字符串 / 列表均可。"""
    if isinstance(value, str):
        return frozenset({item.strip() for item in value.split(',') if item.strip()})
    if isinstance(value, list):
        return frozenset({str(item).strip() for item in value if str(item).strip()})
    return frozenset()


def _jwt_user_context(claims: dict[str, Any], tenant: str) -> UserContext | None:
    sub = str(claims.get('sub') or '').strip()
    if not sub:
        return None
    claimed = str(claims.get('tenant') or '').strip()
    scp = normalize_scopes(claims.get('scp')) or default_scopes()
    return UserContext(sub=f'user:{sub}', tenant=claimed or tenant, scp=scp)


def authenticate_bearer(token: str, tenant: str) -> UserContext | None:
    """Bearer token → UserContext；PAT 优先，其次 fba JWT 直通（HS256 白名单）。"""
    pat = str(settings.RAGF_MCP_PAT or '')
    if pat and hmac.compare_digest(token, pat):
        return UserContext(sub='pat', tenant=tenant, scp=default_scopes())
    try:
        claims = jwt.decode(
            token,
            settings.TOKEN_SECRET_KEY,
            algorithms=[settings.TOKEN_ALGORITHM],  # 算法白名单防 alg 混淆
            options={'verify_aud': False, 'verify_iss': False},  # D31-A：同信任域直通，aud/iss 放宽
        )
    except JWTError:
        return None
    return _jwt_user_context(claims, tenant)


def require_perms(ctx: UserContext, required: frozenset[str]) -> None:
    """tool handler 内强制权限检查（D33；缺失抛 ForbiddenError → JSON-RPC PERMISSION_DENIED）。"""
    if not ctx.has_perms(required):
        raise errors.ForbiddenError(msg=f'缺少权限点: {", ".join(sorted(required))}')


def filter_tools(ctx: UserContext, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """tools/list 按调用方权限动态过滤（缩小 LLM 可见工具面 = 注入防线，D33）。"""
    return [item for item in tools if ctx.has_perms(frozenset(item.get('required_permissions') or []))]


def _mcp_user_context(
    authorization: Annotated[str | None, Header(alias='Authorization')],
    tenant: Annotated[str, Depends(get_current_tenant)],
) -> UserContext:
    """FastAPI 依赖：解析 bearer 凭证 → UserContext；失败 401。"""
    if not authorization:
        raise errors.TokenError(msg='缺少 Authorization: Bearer <token>')
    scheme, _, token = authorization.partition(' ')
    if scheme.lower() != 'bearer' or not token.strip():
        raise errors.TokenError(msg='Authorization 必须是 Bearer 凭证')
    ctx = authenticate_bearer(token.strip(), tenant)
    if ctx is None:
        raise errors.TokenError(msg='凭证无效（fba JWT 或 RAGF_MCP_PAT）')
    return ctx


McpUserContext = Annotated[UserContext, Depends(_mcp_user_context)]
