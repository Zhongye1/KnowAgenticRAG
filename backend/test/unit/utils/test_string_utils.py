import pytest

from ars.utils.string_utils import truncate_utf8

pytestmark = pytest.mark.unit


def test_truncate_utf8_preserves_multibyte_boundary_and_budget():
    result, truncated = truncate_utf8("记" * 20, 32)

    assert truncated is True
    assert result.endswith("\n[内容已截断]")
    assert len(result.encode("utf-8")) <= 32
    assert "�" not in result


def test_truncate_utf8_returns_empty_when_marker_exceeds_budget():
    result, truncated = truncate_utf8("内容", 4)

    assert result == ""
    assert truncated is True


def test_truncate_utf8_keeps_content_within_budget_unchanged():
    result, truncated = truncate_utf8("完整内容", 32)

    assert result == "完整内容"
    assert truncated is False
