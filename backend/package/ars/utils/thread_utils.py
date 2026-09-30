from __future__ import annotations

from collections.abc import Mapping


def extract_thread_id(value: object, fallback: str | None = None) -> str | None:
    """从规范化事件结构中提取 thread_id。

    只读取当前对象和一层稳定容器字段，避免递归扫描把未规范化的内部结构误判为路由依据。
    """
    if not isinstance(value, Mapping):
        return fallback

    for source in (
        value,
        value.get("configurable"),
        value.get("metadata"),
        value.get("stream_event"),
        value.get("meta"),
    ):
        if not isinstance(source, Mapping):
            continue
        thread_id = source.get("thread_id")
        if isinstance(thread_id, str) and thread_id.strip():
            return thread_id.strip()

    return fallback
