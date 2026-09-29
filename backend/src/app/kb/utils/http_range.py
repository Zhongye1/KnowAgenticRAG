"""HTTP Range 解析（kb-落地改造清单 Phase 3 / D55.1，RFC 7233 单区间）。

PDF.js 靠字节区间按需取块，故 Range 语义必须精确：**非线性的 PDF 其 xref 在文件
尾部**，客户端的首个请求常常不是 `0-`，任何「只支持从头读」的实现都会让它拿不到
交叉引用表。纯函数、无 IO，单测直覆盖。
"""

from __future__ import annotations

__all__ = ['RangeNotSatisfiableError', 'parse_single_range']

_UNIT = 'bytes='


class RangeNotSatisfiableError(Exception):
    """区间不可满足 → 响应 416 并带 ``Content-Range: bytes */<size>``。"""


def _parse_suffix(spec: str, size: int) -> tuple[int, int] | None:
    """``bytes=-N``：取末尾 N 字节。"""
    if not spec.isdigit():
        return None
    suffix = int(spec)
    if suffix <= 0:
        raise RangeNotSatisfiableError
    return max(0, size - suffix), size - 1


def _parse_span(start_text: str, end_text: str, size: int) -> tuple[int, int] | None:
    """``bytes=N-`` / ``bytes=N-M``。"""
    if not start_text.isdigit():
        return None
    start = int(start_text)
    if start >= size:
        raise RangeNotSatisfiableError
    if not end_text:
        return start, size - 1
    if not end_text.isdigit():
        return None
    end = int(end_text)
    if end < start:
        raise RangeNotSatisfiableError
    return start, min(end, size - 1)


def parse_single_range(header: str | None, size: int) -> tuple[int, int] | None:
    """解析单区间 Range，返回闭区间 ``(start, end)``；无 Range 返回 None（全量）。

    按 RFC 7233 的容错取向：

    - 语法非法、单位不是 `bytes`、**多区间**（含逗号）→ 返回 None（忽略，按 200 全量）；
      本项目不需要 multipart/byteranges，回全量比回 416 更安全。
    - `bytes=-N`（后缀区间）→ 取末尾 N 字节；`bytes=N-`（开区间）→ N 到文件末尾。
    - 起点越界、或 `size == 0` 时的任何区间 → 抛 `RangeNotSatisfiableError`（416）。
    """
    if header is None:
        return None
    raw = header.strip()
    if not raw or not raw.lower().startswith(_UNIT):
        return None
    spec = raw[len(_UNIT) :].strip()
    if not spec or ',' in spec or '-' not in spec:
        return None
    if size <= 0:
        raise RangeNotSatisfiableError
    start_text, _, end_text = spec.partition('-')
    start_text, end_text = start_text.strip(), end_text.strip()
    if not start_text:
        return _parse_suffix(end_text, size)
    return _parse_span(start_text, end_text, size)
