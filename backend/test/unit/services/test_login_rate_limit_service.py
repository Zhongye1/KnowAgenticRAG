"""登录 IP 级限速服务的单元测试。"""

from __future__ import annotations

import pytest

import ars.services.login_rate_limit_service as limiter

WINDOW = limiter.LOGIN_FAILURE_WINDOW_SECONDS


class FakeZSetRedis:
    """覆盖限速服务用到的 ZSET 与删除命令的最小 Redis 仿造。"""

    def __init__(self):
        self.data: dict[str, dict[str, float]] = {}
        self.expires: dict[str, int] = {}

    async def zremrangebyscore(self, key: str, min_score: float, max_score: float) -> int:
        entries = self.data.get(key, {})
        removed = [member for member, score in entries.items() if min_score <= score <= max_score]
        for member in removed:
            entries.pop(member, None)
        return len(removed)

    async def zadd(self, key: str, mapping: dict[str, float]) -> int:
        entries = self.data.setdefault(key, {})
        entries.update(mapping)
        return len(mapping)

    async def zcard(self, key: str) -> int:
        return len(self.data.get(key, {}))

    async def zrange(self, key: str, start: int, end: int, withscores: bool = False):
        entries = sorted(self.data.get(key, {}).items(), key=lambda item: item[1])
        if end == -1:
            selected = entries[start:]
        else:
            selected = entries[start : end + 1]
        if withscores:
            return [(member, score) for member, score in selected]
        return [member for member, _ in selected]

    async def expire(self, key: str, ttl: int) -> bool:
        self.expires[key] = ttl
        return True

    async def delete(self, key: str) -> int:
        existed = key in self.data
        self.data.pop(key, None)
        return int(existed)


@pytest.fixture
def fake_redis(monkeypatch: pytest.MonkeyPatch):
    fake = FakeZSetRedis()

    async def fake_get_async_redis_client():
        return fake

    monkeypatch.setattr(limiter, "get_async_redis_client", fake_get_async_redis_client)
    return fake


@pytest.fixture
def fixed_time(monkeypatch: pytest.MonkeyPatch):
    current = 1_800_000_000.0

    def fake_time():
        return current

    def advance(seconds: float):
        nonlocal current
        current += seconds

    monkeypatch.setattr(limiter.time, "time", fake_time)
    return advance


async def test_below_threshold_is_allowed(fake_redis, fixed_time):
    for _ in range(limiter.LOGIN_FAILURE_IP_ACCOUNT_MAX - 1):
        await limiter.record_login_failure("1.2.3.4", "alice")

    allowed, retry_after = await limiter.check_login_rate_limit("1.2.3.4", "alice")
    assert allowed is True
    assert retry_after == 0


async def test_ip_account_failures_block_only_that_combination(fake_redis, fixed_time):
    for _ in range(limiter.LOGIN_FAILURE_IP_ACCOUNT_MAX):
        await limiter.record_login_failure("1.2.3.4", "alice")

    allowed, retry_after = await limiter.check_login_rate_limit("1.2.3.4", "alice")
    assert allowed is False
    assert 1 <= retry_after <= WINDOW

    # 同 IP 的其他账号未达阈值，仍可尝试
    other_allowed, _ = await limiter.check_login_rate_limit("1.2.3.4", "bob")
    assert other_allowed is True


async def test_ip_global_failures_block_all_identifiers(fake_redis, fixed_time):
    # 用多个不同账号分散失败，单独组合不触发阈值，但 IP 全局达到阈值
    for index in range(limiter.LOGIN_FAILURE_IP_MAX):
        await limiter.record_login_failure("1.2.3.4", f"user-{index}")

    allowed, retry_after = await limiter.check_login_rate_limit("1.2.3.4", "anyone")
    assert allowed is False
    assert 1 <= retry_after <= WINDOW

    # 其他 IP 不受影响
    other_ip_allowed, _ = await limiter.check_login_rate_limit("5.6.7.8", "anyone")
    assert other_ip_allowed is True


async def test_sliding_window_expires_old_failures(fake_redis, fixed_time):
    for _ in range(limiter.LOGIN_FAILURE_IP_ACCOUNT_MAX):
        await limiter.record_login_failure("1.2.3.4", "alice")

    # 窗口滑过后最早一批失败过期，限速解除
    fixed_time(WINDOW + 1)
    allowed, _ = await limiter.check_login_rate_limit("1.2.3.4", "alice")
    assert allowed is True


async def test_clear_login_failures_resets_combination_only(fake_redis, fixed_time):
    for _ in range(limiter.LOGIN_FAILURE_IP_ACCOUNT_MAX):
        await limiter.record_login_failure("1.2.3.4", "alice")

    await limiter.clear_login_failures("1.2.3.4", "alice")

    allowed, _ = await limiter.check_login_rate_limit("1.2.3.4", "alice")
    assert allowed is True
    # IP 维度计数保留
    assert await fake_redis.zcard(limiter._ip_key("1.2.3.4")) == limiter.LOGIN_FAILURE_IP_ACCOUNT_MAX


async def test_record_sets_window_expire(fake_redis, fixed_time):
    await limiter.record_login_failure("1.2.3.4", "alice")

    assert fake_redis.expires.get(limiter._ip_key("1.2.3.4")) == WINDOW
    assert fake_redis.expires.get(limiter._ip_account_key("1.2.3.4", "alice")) == WINDOW


def test_extract_client_ip_prefers_forwarded_for():
    class FakeRequest:
        headers = {"x-forwarded-for": "9.9.9.9, 10.0.0.1"}
        client = type("Client", (), {"host": "172.17.0.1"})

    assert limiter.extract_client_ip(FakeRequest()) == "9.9.9.9"

    class DirectRequest:
        headers = {}
        client = type("Client", (), {"host": "192.168.1.5"})

    assert limiter.extract_client_ip(DirectRequest()) == "192.168.1.5"

    class NoClientRequest:
        headers = {}
        client = None

    assert limiter.extract_client_ip(NoClientRequest()) == "unknown"
