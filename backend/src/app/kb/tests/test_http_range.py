"""HTTP Range 解析纯函数测试（D55.1 / RFC 7233 单区间）。

这些用例锁的是 PDF.js 的**真实取块行为**：非线性的 PDF 其 xref 在文件尾部，首个
请求常常不是 `0-`，所以「任意 offset 都支持」与「后缀区间正确」是硬要求。
"""

import pytest

from backend.src.app.kb.utils.http_range import RangeNotSatisfiableError, parse_single_range

SIZE = 1000


def test_no_header_means_full_object() -> None:
    assert parse_single_range(None, SIZE) is None
    assert parse_single_range('', SIZE) is None


def test_closed_range() -> None:
    assert parse_single_range('bytes=0-99', SIZE) == (0, 99)
    assert parse_single_range('bytes=500-599', SIZE) == (500, 599)


def test_open_ended_range_reads_to_eof() -> None:
    assert parse_single_range('bytes=900-', SIZE) == (900, 999)


def test_suffix_range_reads_tail() -> None:
    """尾部窗口：PDF.js 取 xref 走的就是这条路径。"""
    assert parse_single_range('bytes=-100', SIZE) == (900, 999)
    assert parse_single_range('bytes=-2000', SIZE) == (0, 999)


def test_end_beyond_size_is_clamped() -> None:
    assert parse_single_range('bytes=900-5000', SIZE) == (900, 999)


def test_start_beyond_size_is_unsatisfiable() -> None:
    with pytest.raises(RangeNotSatisfiableError):
        parse_single_range('bytes=1000-', SIZE)
    with pytest.raises(RangeNotSatisfiableError):
        parse_single_range('bytes=2000-3000', SIZE)


def test_zero_size_object_is_unsatisfiable() -> None:
    with pytest.raises(RangeNotSatisfiableError):
        parse_single_range('bytes=0-10', 0)


def test_reversed_range_is_unsatisfiable() -> None:
    with pytest.raises(RangeNotSatisfiableError):
        parse_single_range('bytes=500-100', SIZE)


def test_zero_suffix_is_unsatisfiable() -> None:
    with pytest.raises(RangeNotSatisfiableError):
        parse_single_range('bytes=-0', SIZE)


def test_multi_range_is_ignored_not_416() -> None:
    """本项目不做 multipart/byteranges：多区间按「忽略」处理回全量，比 416 更安全。"""
    assert parse_single_range('bytes=0-99,200-299', SIZE) is None


def test_malformed_headers_are_ignored() -> None:
    for raw in ('items=0-10', 'bytes', 'bytes=', 'bytes=abc-def', 'bytes=abc-', 'bytes=0-abc'):
        assert parse_single_range(raw, SIZE) is None, raw


def test_unit_is_case_insensitive_and_whitespace_tolerated() -> None:
    assert parse_single_range('BYTES=0-9', SIZE) == (0, 9)
    assert parse_single_range('  bytes=0-9  ', SIZE) == (0, 9)
