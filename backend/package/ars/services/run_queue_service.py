"""Run queue/redis helpers."""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime

from ars.services.run_event_models import RUN_EVENT_MODELS, RUN_EVENT_SCHEMA_VERSION
from ars.storage.redis import close_async_redis_client, create_arq_redis_pool, get_async_redis_client
from ars.utils.logging_config import logger

RUN_CANCEL_KEY_TTL_SECONDS = int(os.getenv("RUN_CANCEL_KEY_TTL_SECONDS", "1800"))
RUN_EVENTS_STREAM_TTL_SECONDS = int(os.getenv("RUN_EVENTS_STREAM_TTL_SECONDS", "7200"))
RUN_EVENTS_STREAM_MAXLEN = int(os.getenv("RUN_EVENTS_STREAM_MAXLEN", "0"))
RUN_CANCEL_CHANNEL = os.getenv("RUN_CANCEL_CHANNEL", "run:cancel:ch")
WORKER_HEALTH_CONTRACT = "agent-run-v1"
WORKER_HEALTH_KEY = f"ars:worker:health:{WORKER_HEALTH_CONTRACT}"
WORKER_HEALTH_INTERVAL_SECONDS = float(os.getenv("WORKER_HEALTH_INTERVAL_SECONDS", "5"))
if not 0 < WORKER_HEALTH_INTERVAL_SECONDS <= 10:
    raise ValueError("WORKER_HEALTH_INTERVAL_SECONDS 必须大于 0 且不超过 10")
WORKER_HEALTH_MAX_TTL_MS = int((WORKER_HEALTH_INTERVAL_SECONDS + 1) * 1000)
RUN_RECONCILIATION_SECONDS = 30
WORKER_RECONCILIATION_HEALTH_KEY = f"{WORKER_HEALTH_KEY}:lease-reconciliation"
WORKER_RECONCILIATION_HEALTH_TTL_SECONDS = RUN_RECONCILIATION_SECONDS * 2 + 5

_arq_pool = None


def _cancel_key(run_id: str) -> str:
    return f"run:cancel:{run_id}"


def _event_stream_key(run_id: str) -> str:
    return f"run:events:{run_id}"


def _is_valid_stream_seq(value: str) -> bool:
    major, sep, minor = value.partition("-")
    if sep != "-":
        return False
    return major.isdigit() and minor.isdigit()


def normalize_after_seq(after_seq: str | None) -> str:
    """Normalize after_seq cursor to redis stream id format."""
    if after_seq is None:
        return "0-0"

    text = str(after_seq).strip()
    if not text:
        return "0-0"

    if _is_valid_stream_seq(text):
        return text
    return "0-0"


def build_run_event_envelope(
    *,
    run_id: str,
    event_type: str,
    payload: dict | None = None,
    thread_id: str | None = None,
    created_at: str | None = None,
) -> dict:
    """构造并校验 run 事件信封；形状由 ``run_event_models`` 拥有。"""

    model = RUN_EVENT_MODELS.get(event_type)
    if model is None:
        raise ValueError(f"未知的 Run 事件名：{event_type}")

    # 信封字段全部显式传入，dump 时它们一定出现（含为 null 的 thread_id，以及走默认值的
    # `event`）；`exclude_unset` 只让 producer 没有赋值的载荷字段保持缺席，
    # 输出形状因此与建模前一致。
    envelope = model(
        schema_version=RUN_EVENT_SCHEMA_VERSION,
        run_id=run_id,
        event=event_type,
        thread_id=thread_id,
        created_at=created_at or datetime.now(tz=UTC).isoformat(),
        payload=payload or {},
    )
    return envelope.model_dump(exclude_unset=True)


def _payload_thread_id(payload: dict | None) -> str | None:
    chunk = payload.get("chunk") if isinstance(payload, dict) else None
    if not isinstance(chunk, dict):
        return None
    thread_id = chunk.get("thread_id")
    return thread_id.strip() if isinstance(thread_id, str) and thread_id.strip() else None


async def get_redis_client():
    return await get_async_redis_client()


async def get_arq_pool():
    global _arq_pool
    if _arq_pool is not None:
        return _arq_pool

    _arq_pool = await create_arq_redis_pool()
    return _arq_pool


@asynccontextmanager
async def redis_pubsub(channel: str):
    redis = await get_redis_client()
    pubsub = redis.pubsub()
    try:
        await pubsub.subscribe(channel)
        try:
            yield pubsub
        finally:
            with suppress(Exception):
                await pubsub.unsubscribe(channel)
    finally:
        with suppress(Exception):
            await pubsub.close()


async def publish_cancel_signal(run_id: str) -> None:
    try:
        redis = await get_redis_client()
        key = _cancel_key(run_id)
        await redis.set(key, "1", ex=RUN_CANCEL_KEY_TTL_SECONDS)
        await redis.publish(RUN_CANCEL_CHANNEL, run_id)
    except Exception as e:
        logger.warning(f"Failed to publish cancel signal for run {run_id}: {e}")


async def _read_cancel_signal(run_id: str) -> bool:
    redis = await get_redis_client()
    return bool(await redis.get(_cancel_key(run_id)))


async def has_cancel_signal(run_id: str) -> bool:
    try:
        return await _read_cancel_signal(run_id)
    except Exception as e:
        logger.warning(f"Failed to read cancel signal for run {run_id}: {e}")
        return False


async def wait_for_cancel_signal(run_id: str, poll_timeout_seconds: float = 1.0) -> bool:
    poll_timeout_seconds = max(0.0, float(poll_timeout_seconds))
    loop = asyncio.get_running_loop()
    key_failure_logged = False
    pubsub_failure_logged = False

    while True:
        attempt_started_at = loop.time()
        try:
            try:
                if await _read_cancel_signal(run_id):
                    return True
            except asyncio.CancelledError:
                raise
            except Exception as e:
                if not key_failure_logged:
                    logger.warning(f"Failed to read cancel signal for run {run_id}: {e}")
                    key_failure_logged = True
            else:
                key_failure_logged = False

            async with redis_pubsub(RUN_CANCEL_CHANNEL) as pubsub:
                while True:
                    poll_started_at = loop.time()
                    msg = await pubsub.get_message(
                        ignore_subscribe_messages=True,
                        timeout=poll_timeout_seconds,
                    )
                    pubsub_failure_logged = False
                    if msg and str(msg.get("data")) == run_id:
                        return True
                    try:
                        if await _read_cancel_signal(run_id):
                            return True
                    except asyncio.CancelledError:
                        raise
                    except Exception as e:
                        if not key_failure_logged:
                            logger.warning(f"Failed to read cancel signal for run {run_id}: {e}")
                            key_failure_logged = True
                    else:
                        key_failure_logged = False
                    remaining = poll_timeout_seconds - (loop.time() - poll_started_at)
                    if remaining > 0:
                        await asyncio.sleep(remaining)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            if not pubsub_failure_logged:
                logger.warning(f"Failed to wait cancel signal for run {run_id}: {e}")
                pubsub_failure_logged = True
            remaining = poll_timeout_seconds - (loop.time() - attempt_started_at)
            if remaining > 0:
                await asyncio.sleep(remaining)


async def clear_cancel_signal(run_id: str) -> None:
    try:
        redis = await get_redis_client()
        key = _cancel_key(run_id)
        await redis.delete(key)
    except Exception as e:
        logger.warning(f"Failed to clear cancel signal for run {run_id}: {e}")


async def append_run_stream_event(run_id: str, event_type: str, payload: dict, *, thread_id: str | None = None) -> str:
    redis = await get_redis_client()
    key = _event_stream_key(run_id)
    now = datetime.now(tz=UTC)
    now_ms = int(now.timestamp() * 1000)
    event_thread_id = thread_id or _payload_thread_id(payload)
    envelope = build_run_event_envelope(
        run_id=run_id,
        event_type=event_type,
        payload=payload or {},
        thread_id=event_thread_id,
        created_at=now.isoformat(),
    )
    fields = {
        "event_type": event_type,
        "payload": json.dumps(envelope, ensure_ascii=False),
        "ts": str(now_ms),
    }

    kwargs = {}
    if RUN_EVENTS_STREAM_MAXLEN > 0:
        kwargs["maxlen"] = RUN_EVENTS_STREAM_MAXLEN
        kwargs["approximate"] = True

    event_id = await redis.xadd(key, fields, **kwargs)
    await redis.expire(key, RUN_EVENTS_STREAM_TTL_SECONDS)
    return str(event_id)


async def list_run_stream_events(
    run_id: str,
    *,
    after_seq: str = "0-0",
    limit: int = 200,
) -> list[dict]:
    redis = await get_redis_client()
    key = _event_stream_key(run_id)
    start = "-" if after_seq in {"0-0", ""} else f"({after_seq}"
    rows = await redis.xrange(key, min=start, max="+", count=limit)
    events = []

    for event_id, fields in rows:
        payload_raw = fields.get("payload") or "{}"
        try:
            payload = json.loads(payload_raw)
        except Exception:
            payload = {}

        event_type = fields.get("event_type") or "message"
        if not isinstance(payload, dict) or payload.get("schema_version") != 1:
            payload = {
                "schema_version": 1,
                "run_id": run_id,
                "thread_id": None,
                "event": event_type,
                "payload": payload if isinstance(payload, dict) else {},
                "created_at": None,
            }

        ts_value = fields.get("ts")
        events.append(
            {
                "seq": str(event_id),
                "event_type": event_type,
                "payload": payload,
                "ts": int(ts_value) if ts_value else None,
            }
        )
    return events


async def list_recent_run_stream_events(run_id: str, *, limit: int = 100) -> list[dict]:
    """从 Redis Stream 反向读取最近的 run events，返回顺序为新到旧。"""
    redis = await get_redis_client()
    key = _event_stream_key(run_id)
    rows = await redis.xrevrange(key, max="+", min="-", count=limit)
    events = []

    for event_id, fields in rows:
        payload_raw = fields.get("payload") or "{}"
        try:
            payload = json.loads(payload_raw)
        except Exception:
            payload = {}

        event_type = fields.get("event_type") or "message"
        if not isinstance(payload, dict) or payload.get("schema_version") != 1:
            payload = {
                "schema_version": 1,
                "run_id": run_id,
                "thread_id": None,
                "event": event_type,
                "payload": payload if isinstance(payload, dict) else {},
                "created_at": None,
            }

        ts_value = fields.get("ts")
        events.append(
            {
                "seq": str(event_id),
                "event_type": event_type,
                "payload": payload,
                "ts": int(ts_value) if ts_value else None,
            }
        )
    return events


async def get_last_run_stream_seq(run_id: str) -> str:
    redis = await get_redis_client()
    key = _event_stream_key(run_id)
    rows = await redis.xrevrange(key, max="+", min="-", count=1)
    if not rows:
        return "0-0"
    event_id, _ = rows[0]
    return str(event_id)


async def close_queue_clients() -> None:
    global _arq_pool
    if _arq_pool is not None:
        try:
            await _arq_pool.close()
        except Exception:
            pass
        _arq_pool = None
    await close_async_redis_client()
