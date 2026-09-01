"""KB 模块公共依赖：JWT 之外的租户域解析。"""

from typing import Annotated

from fastapi import Depends, Header

from backend.src.app.kb.service.namespace import resolve_namespace

__all__ = ['CurrentNamespace', 'get_current_tenant']


def get_current_tenant(
    x_plugin_namespace: Annotated[str | None, Header(alias='X-Plugin-Namespace')] = None,
) -> str:
    """解析实例域；显式传入且与实例不一致时 403。"""
    return resolve_namespace(x_plugin_namespace)


CurrentNamespace = Annotated[str, Depends(get_current_tenant)]
