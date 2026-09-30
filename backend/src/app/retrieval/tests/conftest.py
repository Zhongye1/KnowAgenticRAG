"""retrieval 单测的隔离前置。

D63 检索召回缓存**出厂默认关闭**（opt-in），这里仍显式锁定为关：一旦将来改动默认
值，真实 Redis 在场时第二次运行会命中缓存并跳过策略调用，断言（ctx 捕获、embedding
批次）会静默失真。缓存专项用例在自己的 fixture 里显式打开并注入假 Redis。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from backend.src.core.config import settings

if TYPE_CHECKING:
    from collections.abc import Iterator


@pytest.fixture(autouse=True)
def _disable_retrieval_cache(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """默认关闭检索缓存（缓存用例自行覆盖为 True）。"""
    monkeypatch.setattr(settings, 'RAGF_RETRIEVAL_CACHE_ENABLED', False)
    yield
