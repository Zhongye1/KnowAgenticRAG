from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

import pytest
import ars.services.run_queue_service as run_queue_service


class _FakeStreamRedis:
    def __init__(self):
        self.streams: dict[str, list[tuple[str, dict[str, str]]]] = {}
        self.expire_calls: list[tuple[str, int]] = []

    async def xadd(self, key: str, fields: dict[str, str], **kwargs):
        del kwargs
        stream = self.streams.setdefault(key, [])
        event_id = f"{1700000000000 + len(stream)}-0"
        stream.append((event_id, dict(fields)))
        return event_id

    async def expire(self, key: str, ttl: int):
        self.expire_calls.append((key, ttl))

    async def xrange(self, key: str, min: str, max: str, count: int):
        del max
        rows = list(self.streams.get(key, []))
        if min.startswith("("):
            cursor = min[1:]
            rows = [(event_id, fields) for event_id, fields in rows if event_id > cursor]
        elif min == "-":
            rows = list(rows)
        return rows[:count]

    async def xrevrange(self, key: str, max: str, min: str, count: int):
        del max, min
        rows = list(reversed(self.streams.get(key, [])))
        return rows[:count]


@pytest.mark.asyncio
async def test_run_stream_event_roundtrip(monkeypatch: pytest.MonkeyPatch):
    fake_redis = _FakeStreamRedis()

    async def fake_get_async_redis_client():
        return fake_redis

    monkeypatch.setattr(run_queue_service, "get_async_redis_client", fake_get_async_redis_client)

    run_id = "run-1"
    seq1 = await run_queue_service.append_run_stream_event(run_id, "messages", {"items": [1]})
    seq2 = await run_queue_service.append_run_stream_event(
        run_id,
        "end",
        {"status": "completed", "chunk": {"status": "finished", "thread_id": "child-thread"}},
    )

    assert seq1 < seq2

    events = await run_queue_service.list_run_stream_events(run_id, after_seq="0-0", limit=100)
    assert [item["event_type"] for item in events] == ["messages", "end"]
    assert events[0]["payload"]["schema_version"] == 1
    assert events[0]["payload"]["run_id"] == run_id
    assert events[0]["payload"]["payload"] == {"items": [1]}
    assert events[1]["payload"]["thread_id"] == "child-thread"

    next_events = await run_queue_service.list_run_stream_events(run_id, after_seq=seq1, limit=100)
    assert len(next_events) == 1
    assert next_events[0]["seq"] == seq2

    last_seq = await run_queue_service.get_last_run_stream_seq(run_id)
    assert last_seq == seq2

    recent_events = await run_queue_service.list_recent_run_stream_events(run_id, limit=2)
    assert [item["seq"] for item in recent_events] == [seq2, seq1]
    assert [item["event_type"] for item in recent_events] == ["end", "messages"]


def test_normalize_after_seq_stream_id_only():
    assert run_queue_service.normalize_after_seq(None) == "0-0"
    assert run_queue_service.normalize_after_seq("1700000000000-3") == "1700000000000-3"
    assert run_queue_service.normalize_after_seq("12") == "0-0"
    assert run_queue_service.normalize_after_seq("bad-value") == "0-0"


@pytest.mark.asyncio
async def test_cancel_live_signal_client_failure_is_best_effort(monkeypatch: pytest.MonkeyPatch):
    """Redis 客户端获取失败不能改变 PostgreSQL 取消与终态事实。"""

    async def unavailable_client():
        raise ConnectionError("redis unavailable")

    monkeypatch.setattr(run_queue_service, "get_redis_client", unavailable_client)

    await run_queue_service.publish_cancel_signal("run-1")
    assert await run_queue_service.has_cancel_signal("run-1") is False
    await run_queue_service.clear_cancel_signal("run-1")


@pytest.mark.asyncio
async def test_cancel_wait_connection_failure_respects_poll_interval(monkeypatch: pytest.MonkeyPatch):
    """Redis 持续连接失败时按间隔重试且只记录一次每类故障。"""
    sleep_delays: list[float] = []
    warnings: list[str] = []

    async def unavailable_client():
        raise ConnectionError("redis unavailable")

    async def record_sleep(delay: float):
        sleep_delays.append(delay)
        if len(sleep_delays) == 5:
            raise asyncio.CancelledError

    monkeypatch.setattr(run_queue_service, "get_redis_client", unavailable_client)
    monkeypatch.setattr(run_queue_service.asyncio, "sleep", record_sleep)
    monkeypatch.setattr(run_queue_service.logger, "warning", warnings.append)

    with pytest.raises(asyncio.CancelledError):
        await run_queue_service.wait_for_cancel_signal("run-1", poll_timeout_seconds=1.0)

    assert len(sleep_delays) == 5
    assert all(delay > 0.9 for delay in sleep_delays)
    assert len(warnings) == 2


@pytest.mark.asyncio
async def test_cancel_wait_get_message_failure_logs_once_across_retries(monkeypatch: pytest.MonkeyPatch):
    """PubSub 读取持续失败时不会按每个重连周期重复刷 warning。"""
    sleep_delays: list[float] = []
    warnings: list[str] = []

    class FailingPubSub:
        async def subscribe(self, _channel: str):
            return None

        async def get_message(self, **_kwargs):
            raise ConnectionError("pubsub read failed")

        async def unsubscribe(self, _channel: str):
            return None

        async def close(self):
            return None

    class FakeRedis:
        def pubsub(self):
            return FailingPubSub()

        async def get(self, _key: str):
            return None

    async def fake_client():
        return FakeRedis()

    async def record_sleep(delay: float):
        sleep_delays.append(delay)
        if len(sleep_delays) == 4:
            raise asyncio.CancelledError

    monkeypatch.setattr(run_queue_service, "get_redis_client", fake_client)
    monkeypatch.setattr(run_queue_service.asyncio, "sleep", record_sleep)
    monkeypatch.setattr(run_queue_service.logger, "warning", warnings.append)

    with pytest.raises(asyncio.CancelledError):
        await run_queue_service.wait_for_cancel_signal("run-1", poll_timeout_seconds=1.0)

    assert len(sleep_delays) == 4
    assert len(warnings) == 1


@pytest.mark.asyncio
async def test_redis_pubsub_closes_when_subscribe_fails(monkeypatch: pytest.MonkeyPatch):
    """订阅失败也必须关闭已创建的 PubSub 连接。"""
    calls: list[str] = []

    class FailingSubscribePubSub:
        async def subscribe(self, _channel: str):
            raise ConnectionError("subscribe failed")

        async def close(self):
            calls.append("close")

    class FakeRedis:
        def pubsub(self):
            return FailingSubscribePubSub()

    async def fake_client():
        return FakeRedis()

    monkeypatch.setattr(run_queue_service, "get_redis_client", fake_client)

    with pytest.raises(ConnectionError, match="subscribe failed"):
        async with run_queue_service.redis_pubsub("run:cancel:ch"):
            raise AssertionError("subscribe should fail before yielding")

    assert calls == ["close"]


@pytest.mark.asyncio
async def test_redis_pubsub_cleanup_does_not_swallow_task_cancellation(monkeypatch: pytest.MonkeyPatch):
    """取消等待任务时，清理异常不能替换或吞掉 CancelledError。"""
    started = asyncio.Event()
    cleanup_calls: list[str] = []
    blocked = asyncio.Event()

    class CleanupFailurePubSub:
        async def subscribe(self, _channel: str):
            return None

        async def get_message(self, **_kwargs):
            started.set()
            await blocked.wait()
            return None

        async def unsubscribe(self, _channel: str):
            cleanup_calls.append("unsubscribe")
            raise RuntimeError("unsubscribe failed")

        async def close(self):
            cleanup_calls.append("close")
            raise RuntimeError("close failed")

    class FakeRedis:
        def pubsub(self):
            return CleanupFailurePubSub()

        async def get(self, _key: str):
            return None

    async def fake_client():
        return FakeRedis()

    monkeypatch.setattr(run_queue_service, "get_redis_client", fake_client)
    task = asyncio.create_task(run_queue_service.wait_for_cancel_signal("run-1", poll_timeout_seconds=0.01))
    try:
        await asyncio.wait_for(started.wait(), timeout=1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(asyncio.shield(task), timeout=0.2)
    finally:
        if not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    assert cleanup_calls == ["unsubscribe", "close"]


@pytest.mark.asyncio
async def test_cancel_wait_returns_immediately_for_pubsub_signal(monkeypatch: pytest.MonkeyPatch):
    """命中实时取消消息时不等待轮询间隔。"""
    sleep_delays: list[float] = []

    class FakePubSub:
        async def get_message(self, **_kwargs):
            return {"data": "run-1"}

    async def no_existing_signal(_run_id: str):
        return False

    @asynccontextmanager
    async def fake_pubsub(_channel: str):
        yield FakePubSub()

    async def record_sleep(delay: float):
        sleep_delays.append(delay)

    monkeypatch.setattr(run_queue_service, "has_cancel_signal", no_existing_signal)
    monkeypatch.setattr(run_queue_service, "redis_pubsub", fake_pubsub)
    monkeypatch.setattr(run_queue_service.asyncio, "sleep", record_sleep)

    assert await run_queue_service.wait_for_cancel_signal("run-1", poll_timeout_seconds=1.0) is True
    assert sleep_delays == []
