from typing import Any

from fastapi import Request, Response
from fastapi.security.utils import get_authorization_scheme_param
from starlette.authentication import AuthCredentials, AuthenticationBackend
from starlette.authentication import AuthenticationError as StarletteAuthenticationError
from starlette.requests import HTTPConnection

from backend.src.app.admin.schema.user import GetUserInfoWithRelationDetail
from backend.src.common.context import ctx
from backend.src.common.exception.errors import TokenError
from backend.src.common.log import log
from backend.src.common.security.jwt import jwt_authentication
from backend.src.core.config import settings
from backend.src.utils.serializers import MsgSpecJSONResponse
from backend.src.utils.trace_id import get_request_trace_id


class AuthenticationError(StarletteAuthenticationError):
    """重写内部认证错误类"""

    def __init__(
        self,
        *,
        code: int | None = None,
        msg: str | None = None,
        headers: dict[str, Any] | None = None,
    ) -> None:
        """
        初始化认证错误类

        :param code: 错误码
        :param msg: 错误信息
        :param headers: 响应头
        :return:
        """
        self.code = code
        self.msg = msg
        self.headers = headers


class JwtAuthMiddleware(AuthenticationBackend):
    """JWT 认证中间件"""

    @staticmethod
    def auth_exception_handler(conn: HTTPConnection, exc: AuthenticationError) -> Response:
        """
        覆盖内部认证错误处理

        :param conn: HTTP 连接对象
        :param exc: 认证错误对象
        :return:
        """
        # msg 恒为字符串（ResponseSchemaModel 契约）：AuthenticationError.msg 允许为 None，
        # 直接出口会让信封出现 msg: null，前端按文本渲染时只能吃兜底文案
        content = {'code': exc.code, 'msg': exc.msg or '', 'data': None}
        # 统一错误信封包含 trace_id（其余出口由 exception_handler 补齐）；鉴权失败是最常见的
        # 错误，缺 trace_id 会让客户端与日志无法对齐，故这里与其它出口保持一致。
        content.update(trace_id=get_request_trace_id())
        ctx.__request_authentication_exception__ = content
        return MsgSpecJSONResponse(content=content, status_code=exc.code or 401)

    @staticmethod
    def extract_token(request: Request) -> str | None:
        """
        从请求中提取 Bearer Token

        :param request: FastAPI 请求对象
        :return:
        """
        authorization = request.headers.get('Authorization')
        if not authorization:
            return None

        path = request.url.path
        if path in settings.TOKEN_REQUEST_PATH_EXCLUDE:
            return None
        for pattern in settings.TOKEN_REQUEST_PATH_EXCLUDE_PATTERN:
            if pattern.match(path):
                return None
        # MCP 端点白名单（agent-layer spec §10/D20）：/mcp 自带多凭证鉴权（JWT 直通 /
        # PAT / OAuth，auth.py），全局 JWT 中间件放行，避免 PAT header 被提前 401 拦截
        # 或统一响应包装改写 JSON-RPC 帧。路径前缀与 mcp 路由同源（RAGF_MCP_HTTP_PATH）。
        mcp_base = str(getattr(settings, 'RAGF_MCP_HTTP_PATH', '') or '').strip().rstrip('/')
        if mcp_base and (path == mcp_base or path.startswith(mcp_base + '/')):
            return None

        scheme, token = get_authorization_scheme_param(authorization)
        if scheme.lower() != 'bearer':
            return None

        return token

    async def authenticate(self, request: Request) -> tuple[AuthCredentials, GetUserInfoWithRelationDetail] | None:
        """
        认证请求

        :param request: FastAPI 请求对象
        :return:
        """
        token = self.extract_token(request)
        if token is None:
            return None

        try:
            user = await jwt_authentication(token)
        except TokenError as exc:
            if settings.TOKEN_REQUEST_UNDERLYING_SECURITY:
                raise AuthenticationError(
                    code=exc.code,
                    msg=exc.detail,
                    headers=dict(exc.headers) if exc.headers else None,
                )
            ctx.__request_jwt_authentication_exception__ = exc
            return None
        except Exception as e:
            log.exception(f'JWT 授权异常：{e}')
            raise AuthenticationError(
                code=getattr(e, 'code', 500),
                msg=getattr(e, 'msg', 'Internal Server Error'),
            )

        # TODO 注意这个返回使用非标准模式，所以在认证通过时，将丢失某些标准特性
        # 标准返回模式看：https://www.starlette.io/authentication/
        return AuthCredentials(['authenticated']), user
