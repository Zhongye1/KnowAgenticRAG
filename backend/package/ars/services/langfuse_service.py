from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any
from urllib.parse import urlparse

from ars.utils.logging_config import logger

try:
    from langfuse import Langfuse
    from langfuse.langchain import CallbackHandler
except Exception:  # pragma: no cover - optional dependency during local test collection
    Langfuse = None  # type: ignore[assignment]
    CallbackHandler = None  # type: ignore[assignment]


_FALSE_VALUES = {"0", "false", "no", "off"}
_DEFAULT_LANGFUSE_BASE_URL = "https://cloud.langfuse.com"


@dataclass(slots=True)
class LangfuseRunContext:
    callbacks: list[Any] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)
    trace_id: str | None = None


def is_langfuse_enabled() -> bool:
    enabled_raw = (os.getenv("LANGFUSE_ENABLED") or "true").strip().lower()
    if enabled_raw in _FALSE_VALUES:
        return False

    if Langfuse is None or CallbackHandler is None:
        return False

    return bool(os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"))


@lru_cache(maxsize=1)
def get_langfuse_client() -> Langfuse | None:
    if not is_langfuse_enabled():
        return None

    kwargs: dict[str, Any] = {
        "public_key": os.getenv("LANGFUSE_PUBLIC_KEY"),
        "secret_key": os.getenv("LANGFUSE_SECRET_KEY"),
    }
    host = os.getenv("LANGFUSE_BASE_URL")
    if host:
        kwargs["host"] = host

    try:
        return Langfuse(**kwargs)
    except Exception as exc:
        logger.warning(f"初始化 Langfuse 客户端失败，将跳过 tracing: {exc}")
        return None


def build_trace_metadata(
    *,
    user_id: str,
    thread_id: str,
    agent_id: str,
    request_id: str,
    operation: str,
    backend_id: str | None = None,
    message_type: str | None = None,
    username: str | None = None,
    login_user_id: str | None = None,
    department_id: int | str | None = None,
    extra_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "langfuse_user_id": user_id,
        "langfuse_session_id": thread_id,
        "request_id": request_id,
        "thread_id": thread_id,
        "agent_id": agent_id,
        "operation": operation,
        "source": "ars",
        "feature": "chat",
    }

    if backend_id:
        metadata["backend_id"] = backend_id
    if message_type:
        metadata["message_type"] = message_type
    if username:
        metadata["username"] = username
    if login_user_id:
        metadata["login_user_id"] = login_user_id
    if department_id is not None:
        metadata["department_id"] = str(department_id)
    if extra_metadata:
        metadata.update(extra_metadata)

    return metadata


def build_trace_tags(
    *,
    agent_id: str,
    operation: str,
    message_type: str | None = None,
    extra_tags: list[str] | None = None,
) -> list[str]:
    tags = ["ars", "chat", operation, f"agent:{agent_id}"]
    if message_type:
        tags.append(f"message_type:{message_type}")
    for tag in extra_tags or []:
        if tag and tag not in tags:
            tags.append(tag)
    return tags


def build_run_context(
    *,
    user_id: str,
    thread_id: str,
    agent_id: str,
    request_id: str,
    operation: str,
    backend_id: str | None = None,
    message_type: str | None = None,
    username: str | None = None,
    login_user_id: str | None = None,
    department_id: int | str | None = None,
    extra_metadata: dict[str, Any] | None = None,
    extra_tags: list[str] | None = None,
) -> LangfuseRunContext:
    metadata = build_trace_metadata(
        user_id=user_id,
        thread_id=thread_id,
        agent_id=agent_id,
        request_id=request_id,
        operation=operation,
        backend_id=backend_id,
        message_type=message_type,
        username=username,
        login_user_id=login_user_id,
        department_id=department_id,
        extra_metadata=extra_metadata,
    )
    tags = build_trace_tags(
        agent_id=agent_id,
        operation=operation,
        message_type=message_type,
        extra_tags=extra_tags,
    )

    client = get_langfuse_client()
    if client is None or CallbackHandler is None:
        return LangfuseRunContext(metadata=metadata, tags=tags)

    trace_id = client.create_trace_id(seed=request_id)
    handler = CallbackHandler(trace_context={"trace_id": trace_id})
    return LangfuseRunContext(callbacks=[handler], metadata=metadata, tags=tags, trace_id=trace_id)


def get_trace_info(run_context: LangfuseRunContext | None) -> dict[str, Any]:
    if run_context is None:
        return {}

    metadata = run_context.metadata or {}
    trace_id = run_context.trace_id
    if run_context.callbacks:
        last_trace_id = getattr(run_context.callbacks[0], "last_trace_id", None)
        if last_trace_id:
            trace_id = last_trace_id

    if not trace_id:
        return {}

    trace_info = {
        "langfuse_trace_id": trace_id,
        "langfuse_user_id": metadata.get("langfuse_user_id"),
        "langfuse_session_id": metadata.get("langfuse_session_id"),
    }

    # Do not fetch trace_url on the request critical path. Langfuse resolves the
    # project id via a remote API call, which can add noticeable latency when the
    # base URL is slow or unreachable. If a trace URL is still needed, fetch it
    # later via get_trace_url_async() and patch message metadata asynchronously.
    return trace_info


def submit_user_feedback_score(
    *,
    trace_id: str,
    feedback_id: int,
    message_id: int,
    conversation_id: int,
    uid: str,
    rating: str,
    reason: str | None = None,
) -> bool:
    client = get_langfuse_client()
    if client is None:
        return False

    value = 1 if rating == "like" else 0
    try:
        client.create_score(
            trace_id=trace_id,
            score_id=f"ars-message-feedback-{feedback_id}",
            name="user-feedback",
            value=value,
            data_type="BOOLEAN",
            comment=reason,
            metadata={
                "source": "ars",
                "feedback_id": feedback_id,
                "message_id": message_id,
                "conversation_id": conversation_id,
                "uid": uid,
                "rating": rating,
            },
        )
        client.flush()
        return True
    except Exception as exc:
        logger.warning(f"提交 Langfuse 用户反馈评分失败，将保留本地反馈: {exc}")
        return False


def _http_origin(url: str) -> tuple[str, str, int] | None:
    try:
        parsed_url = urlparse(url.strip())
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.hostname:
            return None
        default_port = 443 if parsed_url.scheme == "https" else 80
        return parsed_url.scheme, parsed_url.hostname.casefold(), parsed_url.port or default_port
    except ValueError:
        return None


async def get_trace_url_by_id_async(trace_id: str, *, timeout: float = 5.0) -> str | None:
    """按 trace ID 惰性解析已配置 Langfuse 源站的页面 URL。"""
    trace_id = str(trace_id or "").strip()
    if not trace_id:
        return None

    client = get_langfuse_client()
    if client is None:
        return None

    try:
        trace_url = await asyncio.wait_for(
            asyncio.to_thread(client.get_trace_url, trace_id=trace_id),
            timeout=timeout,
        )
    except Exception as exc:
        logger.warning(f"解析 Langfuse trace URL 失败: {type(exc).__name__}")
        return None

    if not isinstance(trace_url, str):
        return None

    trace_url = trace_url.strip()
    configured_origin = _http_origin(os.getenv("LANGFUSE_BASE_URL") or _DEFAULT_LANGFUSE_BASE_URL)
    if configured_origin is None or _http_origin(trace_url) != configured_origin:
        logger.warning("Langfuse 返回了非配置源站的 trace URL，已拒绝")
        return None
    return trace_url


async def get_trace_url_async(
    run_context: LangfuseRunContext | None,
    *,
    timeout: float = 5.0,
) -> str | None:
    """解析当前运行上下文的 Langfuse 页面 URL。"""
    if run_context is None:
        return None

    trace_id = run_context.trace_id
    if run_context.callbacks:
        last_trace_id = getattr(run_context.callbacks[0], "last_trace_id", None)
        if last_trace_id:
            trace_id = last_trace_id

    if not trace_id:
        return None
    return await get_trace_url_by_id_async(trace_id, timeout=timeout)


def flush_langfuse() -> None:
    client = get_langfuse_client()
    if client is None:
        return

    try:
        client.flush()
    except Exception as exc:
        logger.warning(f"刷新 Langfuse 事件失败: {exc}")
