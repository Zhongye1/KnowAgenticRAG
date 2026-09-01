"""多租户域解析守卫测试。"""

import pytest

from backend.src.app.kb.utils.namespace import resolve_namespace
from backend.src.common.exception import errors
from backend.src.core.config import settings


def test_resolve_namespace_default() -> None:
    """未显式传入时使用实例默认域。"""
    assert resolve_namespace(None) == settings.PLUGIN_NAMESPACE
    assert resolve_namespace('') == settings.PLUGIN_NAMESPACE


def test_resolve_namespace_match() -> None:
    """显式传入与实例一致时放行。"""
    assert resolve_namespace(settings.PLUGIN_NAMESPACE) == settings.PLUGIN_NAMESPACE


def test_resolve_namespace_mismatch_raises_403() -> None:
    """显式传入与实例不一致时抛 403（override 仅测试用）。"""
    if settings.ALLOW_NAMESPACE_OVERRIDE:
        pytest.skip('ALLOW_NAMESPACE_OVERRIDE 已开启，跳过 403 用例')
    with pytest.raises(errors.ForbiddenError):
        resolve_namespace('other-domain')


def test_resolve_namespace_override() -> None:
    """测试环境开启 override 时允许任意域。"""
    if not settings.ALLOW_NAMESPACE_OVERRIDE:
        pytest.skip('ALLOW_NAMESPACE_OVERRIDE 未开启，跳过 override 用例')
    assert resolve_namespace('other-domain') == 'other-domain'
