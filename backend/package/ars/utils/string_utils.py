"""通用字符串处理工具。"""

TRUNCATION_MARKER = "\n[内容已截断]"


def truncate_utf8(value: object, max_bytes: int) -> tuple[str, bool]:
    """在 UTF-8 字节预算内截断文本并返回是否发生截断。"""
    text_value = str(value or "")
    encoded = text_value.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text_value, False

    marker_bytes = TRUNCATION_MARKER.encode("utf-8")
    if max_bytes < len(marker_bytes):
        return "", True

    prefix = encoded[: max_bytes - len(marker_bytes)].decode("utf-8", errors="ignore")
    if not prefix:
        return TRUNCATION_MARKER.strip(), True
    return f"{prefix}{TRUNCATION_MARKER}", True
