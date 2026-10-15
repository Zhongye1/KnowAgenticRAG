"""登录失败的 IP 级限速。

账号级锁定（User.login_failed_count）只按账号累计失败，攻击者知道用户名后
可以反复用错误密码把该账号持续锁死。本模块在 Redis 中按「IP+账号」与
「IP 全局」两个维度做滑动窗口失败计数，与账号级锁定叠加；计数跨 worker、
跨重启生效。middleware 中的内存级每 IP 尝试节流保留作为快速防线。

信任前提：客户端 IP 优先取 X-Forwarded-For 首段（与访问日志一致），生产
部署需由反向代理覆盖/剥离客户端自带的 XFF，否则攻击者可伪造 XFF 绕过限速。
"""

from __future__ import annotations

import hashlib
import time
from uuid import uuid4

from ars.storage.redis import get_async_redis_client

# 滑动窗口与阈值：单 IP+账号组合 10 次失败、单 IP 全局 30 次失败（10 分钟内）。
# 组合阈值高于账号锁定阈值（5 次），保证正常用户先触发账号锁定提示而非 IP 限速。
LOGIN_FAILURE_WINDOW_SECONDS = 600
LOGIN_FAILURE_IP_ACCOUNT_MAX = 10
LOGIN_FAILURE_IP_MAX = 30

_IP_KEY_PREFIX = "ars:login-failure:ip:"
_IP_ACCOUNT_KEY_PREFIX = "ars:login-failure:ipacct:"


def _ip_key(ip: str) -> str:
    return f"{_IP_KEY_PREFIX}{ip}"


def _ip_account_key(ip: str, identifier: str) -> str:
    digest = hashlib.sha1(f"{ip}|{identifier}".encode()).hexdigest()
    return f"{_IP_ACCOUNT_KEY_PREFIX}{digest}"


def extract_client_ip(request) -> str:
    """提取客户端 IP，与访问日志一致优先信任 X-Forwarded-For 首段。"""
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


async def check_login_rate_limit(ip: str, identifier: str) -> tuple[bool, int]:
    """检查登录是否被限速。

    返回 (allowed, retry_after_seconds)；被限速时 retry_after 为需要等待的秒数。
    """
    redis = await get_async_redis_client()
    now = time.time()
    window = LOGIN_FAILURE_WINDOW_SECONDS
    limits = (
        (_ip_account_key(ip, identifier), LOGIN_FAILURE_IP_ACCOUNT_MAX),
        (_ip_key(ip), LOGIN_FAILURE_IP_MAX),
    )
    for key, max_failures in limits:
        await redis.zremrangebyscore(key, 0, now - window)
        if await redis.zcard(key) < max_failures:
            continue
        oldest = await redis.zrange(key, 0, 0, withscores=True)
        if not oldest:
            continue
        retry_after = int(oldest[0][1] + window - now) + 1
        return False, max(1, min(window, retry_after))
    return True, 0


async def record_login_failure(ip: str, identifier: str) -> None:
    """记录一次登录失败到两个维度的滑动窗口。"""
    redis = await get_async_redis_client()
    now = time.time()
    window = LOGIN_FAILURE_WINDOW_SECONDS
    member = f"{now}-{uuid4().hex[:8]}"
    for key in (_ip_account_key(ip, identifier), _ip_key(ip)):
        await redis.zremrangebyscore(key, 0, now - window)
        await redis.zadd(key, {member: now})
        await redis.expire(key, window)


async def clear_login_failures(ip: str, identifier: str) -> None:
    """登录成功后清除 IP+账号维度的失败计数；IP 维度保留其他账号的记录。"""
    redis = await get_async_redis_client()
    await redis.delete(_ip_account_key(ip, identifier))
