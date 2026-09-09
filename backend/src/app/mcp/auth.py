"""MCP 多凭证鉴权归一（agent-layer spec §5.5/D22/D31-D33）。

三类凭证收敛在中间件：自家 host 走 fba 签发 JWT 直通（HS256 本地校验 + Redis
会话存活校验，aud 同域放宽、不引入新 IdP，D31-A）；Codex PAT 经桥接进程 env
注入（服务端与 ``RAGF_MCP_PAT`` 常量时间比对，免会话）；Claude Code OAuth 2.1
待 Keycloak DCR 就绪后作为 IdP 通道接入。

归一产物为 ``UserContext(sub/tenant/scp)``；``scp`` 优先取 JWT ``scp`` claim，
缺省回退 ``RAGF_MCP_DEFAULT_SCOPES``（读面工具集）——权限点映射既有 RBAC，
不发明第二套权限模型。

安全语义：
- JWT 会话存活校验与 fba ``jwt_authentication`` 同源键（``TOKEN_REDIS_PREFIX``）：
  logout / 踢人 / 改密即时失效；refresh token 落在 ``TOKEN_REFRESH_REDIS_PREFIX``
  前缀，查 access 键即可区分——refresh token 不可用作 MCP 凭证（防 token 混用，
  access TTL 不再是唯一边界）。
- JWT ``tenant`` claim 只做一致性交叉校验：与请求租户不一致 → 拒绝；租户以
  服务端解析的 ``X-Plugin-Namespace`` 为准（防 claim 覆盖穿越）。
- Redis 异常 fail-closed（返回 None → 401），与 fba 平台自身对 Redis 的依赖一致。
"""

from __future__ import annotations

import hmac

from typing import Annotated, Any

from fastapi import Depends, Header
from jose import JWTError, jwt

from backend.src.app.kb.deps import get_current_tenant
from backend.src.app.mcp.schemas import READ_SCOPES, UserContext
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.redis import redis_client

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
    """JWT claims → UserContext（sub 为原始用户 ID，供 scope 构建/owner 匹配）。

    ``tenant`` claim 仅做一致性交叉校验：与请求租户（服务端解析）不一致 → 拒绝。
    """
    sub = str(claims.get('sub') or '').strip()
    if not sub:
        return None
    claimed = str(claims.get('tenant') or '').strip()
    if claimed and claimed != tenant:
        return None
    scp = normalize_scopes(claims.get('scp')) or default_scopes()
    return UserContext(sub=sub, tenant=tenant, scp=scp)


async def _session_alive(user_id: str, session_uuid: str) -> bool:
    """fba 会话键存在性（与 ``jwt_authentication`` 同源键；异常 fail-closed）。"""
    key = f'{settings.TOKEN_REDIS_PREFIX}:{user_id}:{session_uuid}'
    try:
        return bool(await redis_client.get(key))
    except Exception as exc:
        log.warning('MCP 会话校验 Redis 异常（fail-closed）user={}: {}', user_id, exc)
        return False


async def authenticate_bearer(token: str, tenant: str) -> UserContext | None:
    """Bearer token → UserContext；PAT 免会话，JWT 需会话存活（撤销即时生效）。"""
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
    ctx = _jwt_user_context(claims, tenant)
    if ctx is None:
        return None
    session_uuid = str(claims.get('session_uuid') or '').strip()
    if not session_uuid or not await _session_alive(ctx.sub, session_uuid):
        return None
    return ctx


def require_perms(ctx: UserContext, required: frozenset[str]) -> None:
    """tool handler 内强制权限检查（D33；缺失抛 ForbiddenError → JSON-RPC PERMISSION_DENIED）。"""
    if not ctx.has_perms(required):
        raise errors.ForbiddenError(msg=f'缺少权限点: {", ".join(sorted(required))}')


def filter_tools(ctx: UserContext, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """tools/list 按调用方权限动态过滤（缩小 LLM 可见工具面 = 注入防线，D33）。"""
    return [item for item in tools if ctx.has_perms(frozenset(item.get('required_permissions') or []))]


async def _mcp_user_context(
    authorization: Annotated[str | None, Header(alias='Authorization')],
    tenant: Annotated[str, Depends(get_current_tenant)],
) -> UserContext:
    """FastAPI 依赖：解析 bearer 凭证 → UserContext；失败 401。"""
    if not authorization:
        raise errors.TokenError(msg='缺少 Authorization: Bearer <token>')
    scheme, _, token = authorization.partition(' ')
    if scheme.lower() != 'bearer' or not token.strip():
        raise errors.TokenError(msg='Authorization 必须是 Bearer 凭证')
    ctx = await authenticate_bearer(token.strip(), tenant)
    if ctx is None:
        raise errors.TokenError(msg='凭证无效（fba JWT 或 RAGF_MCP_PAT）')
    return ctx


McpUserContext = Annotated[UserContext, Depends(_mcp_user_context)]
