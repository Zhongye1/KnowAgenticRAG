"""Shared helpers and timing settings for server-sent event streams."""

from __future__ import annotations

import json
import os

SSE_HEARTBEAT_SECONDS = int(os.getenv("RUN_SSE_HEARTBEAT_SECONDS", "15"))
# Compose limits development-server graceful shutdown separately, so a live
# stream cannot block hot reload for this full connection lifetime.
SSE_MAX_CONNECTION_MINUTES = int(os.getenv("RUN_SSE_MAX_CONNECTION_MINUTES", "30"))
SSE_POLL_INTERVAL_SECONDS = float(os.getenv("RUN_SSE_POLL_INTERVAL_SECONDS", "1.0"))


def format_sse(data: dict, event: str, event_id: str | None = None) -> str:
    lines = [f"event: {event}", f"data: {json.dumps(data, ensure_ascii=False)}"]
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append("")
    return "\n".join(lines) + "\n"


def format_heartbeat() -> str:
    return ": heartbeat\n\n"
