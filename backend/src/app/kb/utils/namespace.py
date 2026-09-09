"""多租户域解析守卫（EagleRAG db/namespace.py 迁移）。

实例绑定一个 ``plugin_namespace``；请求显式传入且与实例不一致时返回 403，
防止误跨域操作。``ALLOW_NAMESPACE_OVERRIDE`` 仅供测试使用。
"""

from backend.src.common.exception import errors
from backend.src.core.config import settings

__all__ = ['instance_namespace', 'resolve_namespace']


def resolve_namespace(requested: str | None = None) -> str:
    """返回实例生效的 plugin_namespace，显式不匹配时抛 403。"""
    default = settings.PLUGIN_NAMESPACE
    if not requested:
        return default
    if settings.ALLOW_NAMESPACE_OVERRIDE:
        return requested
    if requested != default:
        raise errors.ForbiddenError(msg=f'plugin_namespace {requested!r} 与实例 {default!r} 不一致')
    return default


def instance_namespace(requested: str | None = None) -> str:
    """仓库层统一入口。"""
    return resolve_namespace(requested)
