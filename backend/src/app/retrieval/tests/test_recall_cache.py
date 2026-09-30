"""检索召回缓存测试（D63）：键的失效条件 + 命中时跳过编码与召回。

两段覆盖：

1. **键构造（纯函数）**：ACL 表达式 / 内容信号 / 检索参数 / 查询任一变化都换键——
   这就是 key-versioning 取代显式失效的全部依据；
2. **编排集成**：命中时不再调用 ``aencode``、不再走策略；未命中时写回；关闭缓存时
   行为与改造前一致（同样的输入跑两次 = 两次编码）。

本目录 conftest 默认关闭缓存，本文件的用例自行打开并注入假 Redis。
"""

from __future__ import annotations

import asyncio
import json

from typing import Any

import pytest

from backend.src.app.retrieval.service import cache as cache_mod
from backend.src.app.retrieval.service.cache import build_recall_cache_key
from backend.src.app.retrieval.service.retrieval_service import RetrievalService
from backend.src.app.retrieval.tests.test_retrieval_service import (
    FakeChunkSource,
    FakeDocDao,
    FakeKb,
    FakeKbDao,
    FakeProvider,
)
from backend.src.core.config import settings


def _key(**overrides: Any) -> str:
    base: dict[str, Any] = {
        'namespace': 'core',
        'query_texts': ['甲'],
        'kb_exprs': [('dev', 'namespace == "core"')],
        'content_signals': [('dev', '3:2026-01-01T00:00:00')],
        'params': {'mode': 'hybrid', 'recall_top_k': 20},
    }
    base.update(overrides)
    return build_recall_cache_key(**base)


# ------------------------------------------------------------------ 键失效条件
def test_key_is_stable_for_identical_inputs() -> None:
    assert _key() == _key()


def test_key_changes_when_acl_expression_changes() -> None:
    """ACL 变更 → 表达式变 → 键变（无需显式失效）。"""
    baseline = _key()
    assert _key(kb_exprs=[('dev', 'namespace == "core" and owner_id == "u2"')]) != baseline


def test_key_changes_when_content_signal_changes() -> None:
    """内容变更 → 信号变 → 键变（重摄取后旧缓存不再命中）。"""
    baseline = _key()
    assert _key(content_signals=[('dev', '4:2026-01-02T00:00:00')]) != baseline


def test_key_changes_when_params_change() -> None:
    baseline = _key()
    assert _key(params={'mode': 'keyword', 'recall_top_k': 20}) != baseline
    assert _key(params={'mode': 'hybrid', 'recall_top_k': 50}) != baseline


def test_key_changes_when_query_changes() -> None:
    assert _key(query_texts=['乙']) != _key()


def test_key_ignores_kb_ordering() -> None:
    """KB 顺序不影响键（多 KB 聚合与请求顺序无关）。"""
    left = _key(
        kb_exprs=[('dev', 'e1'), ('ops', 'e2')],
        content_signals=[('dev', 's1'), ('ops', 's2')],
    )
    right = _key(
        kb_exprs=[('ops', 'e2'), ('dev', 'e1')],
        content_signals=[('ops', 's2'), ('dev', 's1')],
    )
    assert left == right


# ------------------------------------------------------------------ 编排集成
class _FakeRedis:
    """内存假 Redis：记录 get/set 与 TTL。"""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.gets: list[str] = []
        self.sets: list[tuple[str, int | None]] = []

    async def get(self, key: str) -> str | None:
        self.gets.append(key)
        return self.store.get(key)

    async def set(self, key: str, value: str, *, ex: int | None = None) -> None:
        self.sets.append((key, ex))
        self.store[key] = value


class _SignalDocDao(FakeDocDao):
    """带内容信号的文档 DAO 替身。"""

    def __init__(self, signals: dict[str, str] | None = None) -> None:
        super().__init__({})
        self.signals = signals or {'dev': '1:2026-01-01T00:00:00'}

    async def content_signal_by_kb(self, db: Any, kb_name: str, *, plugin_namespace: str | None = None) -> str:
        return self.signals.get(kb_name, '0:')


class _CountingStrategies:
    def __init__(self) -> None:
        self.calls = 0

    def build(self) -> dict[str, Any]:
        async def strategy(ctx: dict[str, Any]) -> list[dict[str, Any]]:  # ruff: ignore[unused-async]
            self.calls += 1
            return [{'chunk_id': f'{ctx["kb_name"]}:1', 'document_id': 'd1', 'score': 0.5, 'content': 'x'}]

        return {'vector': strategy, 'hybrid': strategy, 'keyword': strategy}


def _service(
    *,
    doc_dao: _SignalDocDao | None = None,
    provider: FakeProvider | None = None,
) -> tuple[RetrievalService, _CountingStrategies, FakeProvider]:
    strategies = _CountingStrategies()
    embed = provider or FakeProvider()
    service = RetrievalService(
        chunk_source=FakeChunkSource({}),
        kb_dao=FakeKbDao([FakeKb('dev')]),
        doc_dao=doc_dao or _SignalDocDao(),
        provider=embed,
        strategies=strategies.build(),
    )
    return service, strategies, embed


def _search(service: RetrievalService) -> Any:
    return asyncio.run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='甲',
            param={'use_reranker': False},
        )
    )


@pytest.fixture
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> _FakeRedis:
    """打开缓存并注入假 Redis（本目录 conftest 默认关闭）。"""
    monkeypatch.setattr(settings, 'RAGF_RETRIEVAL_CACHE_ENABLED', True)
    fake = _FakeRedis()
    monkeypatch.setattr(cache_mod, 'redis_client', fake)
    return fake


def test_second_identical_search_hits_cache_and_skips_encode_and_recall(fake_redis: _FakeRedis) -> None:
    """命中：不再编码、不再走策略（D63 的核心收益）。"""
    service, strategies, provider = _service()
    _search(service)
    first_batches = list(provider.embedding.batches)
    assert strategies.calls == 1
    assert fake_redis.sets and fake_redis.sets[0][1] == 300  # TTL 来自 settings

    _search(service)
    assert strategies.calls == 1, '命中缓存后不应再走召回策略'
    assert provider.embedding.batches == first_batches, '命中缓存后不应再编码'


def test_content_signal_change_invalidates_cache(fake_redis: _FakeRedis) -> None:
    """内容信号变化 → 换键 → 重新召回。"""
    doc_dao = _SignalDocDao({'dev': '1:2026-01-01T00:00:00'})
    service, strategies, _ = _service(doc_dao=doc_dao)
    _search(service)
    assert strategies.calls == 1

    doc_dao.signals['dev'] = '2:2026-01-02T00:00:00'
    _search(service)
    assert strategies.calls == 2, '内容信号变化后应重新召回'


def test_cached_hits_are_returned_to_caller(fake_redis: _FakeRedis) -> None:
    """命中路径返回的仍是完整召回结果（含 kb_name 归属）。"""
    service, _, _ = _service()
    first = _search(service)
    second = _search(service)
    assert [hit['chunk_id'] for hit in second['results']] == [hit['chunk_id'] for hit in first['results']]
    assert second['hit_count'] == first['hit_count']


def test_cache_disabled_keeps_pre_change_behaviour(monkeypatch: pytest.MonkeyPatch) -> None:
    """关闭缓存：同样输入跑两次 = 两次编码两次召回，且不碰 Redis。"""
    monkeypatch.setattr(settings, 'RAGF_RETRIEVAL_CACHE_ENABLED', False)
    fake = _FakeRedis()
    monkeypatch.setattr(cache_mod, 'redis_client', fake)

    service, strategies, _ = _service()
    _search(service)
    _search(service)
    assert strategies.calls == 2
    assert fake.gets == [] and fake.sets == []


def test_corrupt_cache_payload_falls_back_to_miss(monkeypatch: pytest.MonkeyPatch) -> None:
    """缓存内容非法 JSON → 按未命中处理，不影响检索。"""
    monkeypatch.setattr(settings, 'RAGF_RETRIEVAL_CACHE_ENABLED', True)
    fake = _FakeRedis()
    monkeypatch.setattr(cache_mod, 'redis_client', fake)

    service, strategies, _ = _service()
    _search(service)
    key = next(iter(fake.store))
    fake.store[key] = '{not json'
    _search(service)
    assert strategies.calls == 2


def test_cache_read_failure_degrades_to_miss(monkeypatch: pytest.MonkeyPatch) -> None:
    """Redis 读异常 → 降级为未命中（缓存是可选能力，不阻塞检索）。"""
    monkeypatch.setattr(settings, 'RAGF_RETRIEVAL_CACHE_ENABLED', True)

    class _BrokenRedis(_FakeRedis):
        async def get(self, key: str) -> str | None:
            raise ConnectionError('redis down')

    monkeypatch.setattr(cache_mod, 'redis_client', _BrokenRedis())
    service, strategies, _ = _service()
    _search(service)
    assert strategies.calls == 1


def test_stored_payload_is_json_roundtrippable(fake_redis: _FakeRedis) -> None:
    """落库载荷是合法 JSON 且含 hits（召回命中是纯 dict，无需额外序列化）。"""
    service, _, _ = _service()
    _search(service)
    _, raw = next(iter(fake_redis.store.items()))
    payload = json.loads(raw)
    assert isinstance(payload['hits'], list) and payload['hits']
