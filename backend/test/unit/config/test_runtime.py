"""进程级运行能力配置测试。"""

from __future__ import annotations

import pytest

from ars.config.runtime import knowledge_capability_enabled, lite_mode_enabled

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("value", [" true ", "\tTRUE\n", " 1 "])
def test_lite_mode_owner_normalizes_supported_values(monkeypatch, value: str) -> None:
    """所有调用方共享的 Owner 必须统一处理大小写与边界空白。"""

    monkeypatch.setenv("LITE_MODE", value)

    assert lite_mode_enabled() is True
    assert knowledge_capability_enabled() is False


@pytest.mark.parametrize("value", ["", " false ", "0", "unexpected"])
def test_lite_mode_owner_rejects_other_values(monkeypatch, value: str) -> None:
    """非约定真值不能意外开启 LITE 能力边界。"""

    monkeypatch.setenv("LITE_MODE", value)

    assert lite_mode_enabled() is False
    assert knowledge_capability_enabled() is True
