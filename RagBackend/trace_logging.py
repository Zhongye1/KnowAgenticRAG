"""
trace_logging.py — 结构化日志 TraceID 中间件

每个 HTTP 请求自动生成唯一 trace_id，贯穿整个请求生命周期：
  - 请求进入时写入 contextvars.ContextVar
  - 所有日志自动携带 trace_id
  - 响应头返回 X-Trace-Id，方便前端/排查关联

使用方式：
    from trace_logging import TraceMiddleware, get_trace_id
    app.add_middleware(TraceMiddleware)

    # trace_id
    tid = get_trace_id()
    logger.info(f"trace_id={tid} 处理上传任务")
"""

from __future__ import annotations

import logging
import time
import uuid
from contextvars import ContextVar
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# - ContextVar/ trace_id -
_trace_id_var: ContextVar[str] = ContextVar("trace_id", default="-")


def get_trace_id() -> str:
    """获取当前请求的 trace_id（在任意代码中均可调用）"""
    return _trace_id_var.get()


# - trace_id -
class TraceIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.trace_id = get_trace_id()
        return True


def setup_trace_logging(level: int = logging.INFO):
    """
    配置全局结构化日志格式（含 trace_id）。
    在 main.py 顶部调用一次即可。
    """
    fmt = (
        "%(asctime)s | %(levelname)-8s | trace=%(trace_id)s | "
        "%(name)s:%(lineno)d | %(message)s"
    )
    handler = logging.StreamHandler()
    handler.addFilter(TraceIdFilter())
    handler.setFormatter(logging.Formatter(fmt))

    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    if not any(
        isinstance(h, logging.StreamHandler) and isinstance(h.filters[0], TraceIdFilter)
        for h in root_logger.handlers
        if h.filters
    ):
        root_logger.handlers.clear()
        root_logger.addHandler(handler)


# ── FastAPI Middleware ─────────────────────────────────────────────────
class TraceMiddleware(BaseHTTPMiddleware):
    """
    每个请求注入唯一 trace_id，并在响应头中返回，方便前端/日志关联。

    日志格式示例：
        2026-03-27 17:30:01 | INFO     | trace=a3f8c1d2 | doc_upload:215 | 文件合并成功
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # trace_id
        trace_id = request.headers.get("X-Trace-Id") or uuid.uuid4().hex[:8]
        token = _trace_id_var.set(trace_id)

        start = time.perf_counter()
        try:
            response = await call_next(request)
            elapsed_ms = (time.perf_counter() - start) * 1000
            # Write to response header
            response.headers["X-Trace-Id"] = trace_id
            logging.getLogger("access").info(
                "%s %s %d %.1fms",
                request.method,
                request.url.path,
                response.status_code,
                elapsed_ms,
            )
            return response
        except Exception as exc:
            elapsed_ms = (time.perf_counter() - start) * 1000
            logging.getLogger("access").error(
                "%s %s ERROR %.1fms — %s",
                request.method,
                request.url.path,
                elapsed_ms,
                exc,
            )
            raise
        finally:
            _trace_id_var.reset(token)
