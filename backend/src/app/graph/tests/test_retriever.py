"""图检索测试（D62）：种子定位的空查询陷阱、无命中的空结果、端到端接缝。

最要紧的一条是**空查询**：``strpos(x, '')`` 恒为 1，若不显式短路会把**全部实体**当
种子——那不是"没有结果"，而是"个性化被关掉"，PPR 会退化成全图均匀分布并给出一堆
看似合理的噪声分数。这类缺陷在正常输入下永远不暴露。
"""

from __future__ import annotations

import asyncio

from typing import Any

import pytest

from backend.src.app.graph.service import retriever


class _Entity:
    def __init__(self, entity_id: str) -> None:
        self.entity_id = entity_id


class _FakeDao:
    def __init__(self, entities: list[_Entity] | None = None) -> None:
        self.entities = entities or []
        self.calls: list[dict[str, Any]] = []

    async def search_entities_in_text(self, db: Any, **kwargs: Any) -> list[_Entity]:
        self.calls.append(kwargs)
        return self.entities


@pytest.fixture
def fake_dao(monkeypatch: pytest.MonkeyPatch) -> _FakeDao:
    dao = _FakeDao()
    monkeypatch.setattr(retriever, 'graph_dao', dao)
    return dao


# ------------------------------------------------------------------ 种子定位
def test_blank_query_does_not_seed_everything(fake_dao: _FakeDao) -> None:
    """空/纯空白查询必须短路，不能把全部实体当种子。"""
    seeds = asyncio.run(retriever.locate_seed_entities(None, query_text='   ', kb_name='dev'))  # type: ignore[arg-type]
    assert seeds == []
    assert fake_dao.calls == [], '空查询不应触达数据库'


def test_query_is_normalized_before_matching(fake_dao: _FakeDao) -> None:
    fake_dao.entities = [_Entity('e1')]
    asyncio.run(retriever.locate_seed_entities(None, query_text='  Transformer  架构 ', kb_name='dev'))  # type: ignore[arg-type]
    assert fake_dao.calls[0]['normalized_text'] == 'transformer 架构'


def test_seed_limit_is_applied(fake_dao: _FakeDao) -> None:
    fake_dao.entities = [_Entity('e1')]
    asyncio.run(retriever.locate_seed_entities(None, query_text='q', kb_name='dev', limit=5))  # type: ignore[arg-type]
    assert fake_dao.calls[0]['limit'] == 5


# ------------------------------------------------------------------ 端到端链路
def _patch_chain(monkeypatch: pytest.MonkeyPatch, *, subgraph: dict[str, Any], seeds: list[_Entity]) -> None:
    monkeypatch.setattr(retriever, 'graph_dao', _FakeDao(seeds))

    async def fake_build(  # ruff: ignore[unused-async]
        db: Any, **kwargs: Any
    ) -> dict[str, Any]:
        return subgraph

    monkeypatch.setattr(retriever, 'build_subgraph', fake_build)


def test_no_seed_yields_empty_without_building_subgraph(monkeypatch: pytest.MonkeyPatch) -> None:
    built: list[int] = []

    async def fake_build(  # ruff: ignore[unused-async]
        db: Any, **kwargs: Any
    ) -> dict[str, Any]:
        built.append(1)
        return {'nodes': [], 'edges': []}

    monkeypatch.setattr(retriever, 'graph_dao', _FakeDao([]))
    monkeypatch.setattr(retriever, 'build_subgraph', fake_build)
    assert asyncio.run(retriever.retrieve_graph_chunks(None, query_text='q', kb_name='dev')) == []  # type: ignore[arg-type]
    assert built == [], '无种子时不该进入子图构建'


def test_retrieval_ranks_seed_adjacent_chunk(monkeypatch: pytest.MonkeyPatch) -> None:
    subgraph = {
        'nodes': [
            {'id': 'entity:e1', 'type': 'Entity', 'properties': {'entity_id': 'e1'}},
            {'id': 'chunk:c1', 'type': 'Chunk', 'properties': {'chunk_id': 'c1'}},
        ],
        'edges': [{'source_id': 'chunk:c1', 'target_id': 'entity:e1'}],
    }
    _patch_chain(monkeypatch, subgraph=subgraph, seeds=[_Entity('e1')])
    hits = asyncio.run(retriever.retrieve_graph_chunks(None, query_text='q', kb_name='dev'))  # type: ignore[arg-type]
    assert [hit['chunk_id'] for hit in hits] == ['c1']
    assert hits[0]['score'] > 0


def test_empty_subgraph_yields_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_chain(monkeypatch, subgraph={'nodes': [], 'edges': []}, seeds=[_Entity('e1')])
    assert asyncio.run(retriever.retrieve_graph_chunks(None, query_text='q', kb_name='dev')) == []  # type: ignore[arg-type]


def test_seed_weights_are_uniform(monkeypatch: pytest.MonkeyPatch) -> None:
    """名称种子等权：名称匹配没有天然的强弱信号，编一个启发式不如等权诚实。"""
    captured: dict[str, Any] = {}

    subgraph = {
        'nodes': [
            {'id': 'entity:e1', 'type': 'Entity', 'properties': {'entity_id': 'e1'}},
            {'id': 'entity:e2', 'type': 'Entity', 'properties': {'entity_id': 'e2'}},
            {'id': 'chunk:c1', 'type': 'Chunk', 'properties': {'chunk_id': 'c1'}},
            {'id': 'chunk:c2', 'type': 'Chunk', 'properties': {'chunk_id': 'c2'}},
        ],
        'edges': [
            {'source_id': 'chunk:c1', 'target_id': 'entity:e1'},
            {'source_id': 'chunk:c2', 'target_id': 'entity:e2'},
        ],
    }
    _patch_chain(monkeypatch, subgraph=subgraph, seeds=[_Entity('e1'), _Entity('e2')])

    def fake_ppr(subgraph: dict[str, Any], weights: dict[str, float], **kwargs: Any) -> list[tuple[str, float]]:
        captured['weights'] = weights
        return [('c1', 0.5), ('c2', 0.5)]

    monkeypatch.setattr(retriever, 'rank_chunks_by_ppr', fake_ppr)
    asyncio.run(retriever.retrieve_graph_chunks(None, query_text='q', kb_name='dev'))  # type: ignore[arg-type]
    assert captured['weights'] == {'e1': 1.0, 'e2': 1.0}


def test_graph_chunk_scores_returns_mapping(monkeypatch: pytest.MonkeyPatch) -> None:
    subgraph = {
        'nodes': [
            {'id': 'entity:e1', 'type': 'Entity', 'properties': {'entity_id': 'e1'}},
            {'id': 'chunk:c1', 'type': 'Chunk', 'properties': {'chunk_id': 'c1'}},
        ],
        'edges': [{'source_id': 'chunk:c1', 'target_id': 'entity:e1'}],
    }
    _patch_chain(monkeypatch, subgraph=subgraph, seeds=[_Entity('e1')])
    scores = asyncio.run(retriever.graph_chunk_scores(None, query_text='q', kb_name='dev'))  # type: ignore[arg-type]
    assert set(scores) == {'c1'}
    assert isinstance(scores['c1'], float)
