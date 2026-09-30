"""图谱服务测试（D62）：子图 BFS 的边界与写入幂等。

这是替代 Neo4j 的核心模块，两条最要紧的性质：

- **BFS 必须有界**：图检索是召回的一部分，无界扩展会把一次查询拖成分钟级；
- **写入必须幂等**：实体/三元组 ID 内容派生，重复抽取同一文本要 upsert 而不是新增行
  ——否则图谱每重建一次就膨胀一轮。
"""

from __future__ import annotations

import asyncio

from typing import Any

import pytest

from backend.src.app.graph.service import graph_service


class _Triple:
    def __init__(self, triple_id: str, source: str, target: str) -> None:
        self.triple_id = triple_id
        self.source_entity_id = source
        self.target_entity_id = target


class _Entity:
    def __init__(self, entity_id: str, name: str = 'x', label: str = 'E') -> None:
        self.entity_id = entity_id
        self.name = name
        self.label = label


class _Mention:
    def __init__(self, chunk_id: str, entity_id: str) -> None:
        self.chunk_id = chunk_id
        self.entity_id = entity_id


class _FakeGraphDao:
    """按 hop 返回预设邻接的替身；记录每次 expand 的 frontier 以便断言 BFS 形状。"""

    def __init__(self, adjacency: dict[str, list[_Triple]] | None = None) -> None:
        self.adjacency = adjacency or {}
        self.frontiers: list[list[str]] = []
        self.writes: dict[str, list[dict]] = {'entities': [], 'triples': [], 'mentions': []}

    async def expand_triples(self, db: Any, *, kb_name: str, frontier: list[str], **kwargs: Any) -> list[_Triple]:
        self.frontiers.append(sorted(frontier))
        rows: list[_Triple] = []
        for entity_id in frontier:
            rows.extend(self.adjacency.get(entity_id, []))
        return rows

    async def list_entities(self, db: Any, entity_ids: list[str], **kwargs: Any) -> list[_Entity]:
        return [_Entity(entity_id) for entity_id in entity_ids if entity_id.startswith('e')]

    async def list_mentions(self, db: Any, entity_ids: list[str], **kwargs: Any) -> list[_Mention]:
        return [_Mention(f'chunk-{entity_id}', entity_id) for entity_id in entity_ids]

    async def upsert_entities(self, db: Any, *, entities: list[dict], **kwargs: Any) -> int:
        self.writes['entities'].extend(entities)
        return len(entities)

    async def upsert_triples(self, db: Any, *, triples: list[dict], **kwargs: Any) -> int:
        self.writes['triples'].extend(triples)
        return len(triples)

    async def upsert_mentions(self, db: Any, *, mentions: list[dict], **kwargs: Any) -> int:
        self.writes['mentions'].extend(mentions)
        return len(mentions)


@pytest.fixture
def fake_dao(monkeypatch: pytest.MonkeyPatch) -> _FakeGraphDao:
    dao = _FakeGraphDao()
    monkeypatch.setattr(graph_service, 'graph_dao', dao)
    return dao


def _no_db() -> Any:
    """db 以 Any 传入：服务形参声明为 AsyncSession，替身无需真的满足它。"""
    return None


def _subgraph(fake_dao: _FakeGraphDao, seeds: list[str], **kwargs: Any) -> dict[str, Any]:
    return asyncio.run(graph_service.build_subgraph(_no_db(), kb_name='dev', seed_entity_ids=seeds, **kwargs))


# ------------------------------------------------------------------ 子图扩展
def test_no_seed_returns_empty(fake_dao: _FakeGraphDao) -> None:
    assert _subgraph(fake_dao, []) == {'nodes': [], 'edges': []}
    assert fake_dao.frontiers == []


def test_expands_one_hop_and_collects_neighbors(fake_dao: _FakeGraphDao) -> None:
    fake_dao.adjacency = {'e1': [_Triple('t1', 'e1', 'e2')]}
    subgraph = _subgraph(fake_dao, ['e1'], hops=1)
    entity_ids = {node['properties']['entity_id'] for node in subgraph['nodes'] if node['type'] == 'Entity'}
    assert entity_ids == {'e1', 'e2'}
    assert fake_dao.frontiers == [['e1']]


def test_expands_multiple_hops(fake_dao: _FakeGraphDao) -> None:
    fake_dao.adjacency = {'e1': [_Triple('t1', 'e1', 'e2')], 'e2': [_Triple('t2', 'e2', 'e3')]}
    subgraph = _subgraph(fake_dao, ['e1'], hops=2)
    entity_ids = {node['properties']['entity_id'] for node in subgraph['nodes'] if node['type'] == 'Entity'}
    assert entity_ids == {'e1', 'e2', 'e3'}
    assert fake_dao.frontiers == [['e1'], ['e2']]


def test_hops_zero_keeps_only_seeds(fake_dao: _FakeGraphDao) -> None:
    fake_dao.adjacency = {'e1': [_Triple('t1', 'e1', 'e2')]}
    subgraph = _subgraph(fake_dao, ['e1'], hops=0)
    assert fake_dao.frontiers == []
    entity_ids = {node['properties']['entity_id'] for node in subgraph['nodes'] if node['type'] == 'Entity'}
    assert entity_ids == {'e1'}


def test_entity_cap_stops_expansion(fake_dao: _FakeGraphDao) -> None:
    """上限必须在扩展中就生效——否则大图上一跳就能把整个连通分量拉进来。"""
    fake_dao.adjacency = {'e1': [_Triple(f't{i}', 'e1', f'e{i}') for i in range(2, 50)]}
    subgraph = _subgraph(fake_dao, ['e1'], hops=2, max_entities=5)
    entity_ids = {node['properties']['entity_id'] for node in subgraph['nodes'] if node['type'] == 'Entity'}
    assert len(entity_ids) <= 5


def test_duplicate_triples_are_deduped(fake_dao: _FakeGraphDao) -> None:
    """两个端点都在 frontier 时同一条边会被取到两次，必须去重。"""
    fake_dao.adjacency = {'e1': [_Triple('t1', 'e1', 'e2')], 'e2': [_Triple('t1', 'e1', 'e2')]}
    subgraph = _subgraph(fake_dao, ['e1', 'e2'], hops=2)
    relation_edges = [e for e in subgraph['edges'] if e['source_id'].startswith('entity:')]
    assert len(relation_edges) == 1


def test_chunk_nodes_are_deduped(fake_dao: _FakeGraphDao) -> None:
    """一个 chunk 提及多个实体时只应出现一次节点。"""
    fake_dao.adjacency = {'e1': [_Triple('t1', 'e1', 'e2')]}
    subgraph = _subgraph(fake_dao, ['e1'], hops=1)
    chunk_nodes = [n for n in subgraph['nodes'] if n['type'] == 'Chunk']
    assert len(chunk_nodes) == len({n['properties']['chunk_id'] for n in chunk_nodes})


def test_mention_edges_connect_chunk_to_entity(fake_dao: _FakeGraphDao) -> None:
    """提及边是 PPR 把实体种子质量传导到 chunk 的唯一通道，方向不能反。"""
    fake_dao.adjacency = {'e1': []}
    subgraph = _subgraph(fake_dao, ['e1'], hops=1)
    mention_edges = [e for e in subgraph['edges'] if e['source_id'].startswith('chunk:')]
    assert mention_edges
    assert all(e['target_id'].startswith('entity:') for e in mention_edges)


def test_subgraph_feeds_ppr_end_to_end(fake_dao: _FakeGraphDao) -> None:
    """子图 → PPR 的接缝：种子实体相邻的 chunk 必须拿到正分。"""
    from backend.src.app.graph.service.ppr import rank_chunks_by_ppr

    fake_dao.adjacency = {'e1': [_Triple('t1', 'e1', 'e2')]}
    subgraph = _subgraph(fake_dao, ['e1'], hops=1)
    ranked = rank_chunks_by_ppr(subgraph, {'e1': 1.0}, top_k=10)
    assert ranked
    assert all(score > 0 for _, score in ranked)


# ------------------------------------------------------------------ 写入幂等
def _result() -> dict[str, Any]:
    return {
        'entities': [{'text': 'Transformer', 'label': '模型'}, {'text': 'Attention', 'label': '机制'}],
        'relations': [
            {
                'source': {'text': 'Transformer', 'label': '模型'},
                'target': {'text': 'Attention', 'label': '机制'},
                'text': 'USES',
                'label': 'USES',
            }
        ],
        'metadata': {'extractor_type': 'llm'},
    }


def test_write_reports_counts(fake_dao: _FakeGraphDao) -> None:
    counts = asyncio.run(
        graph_service.write_chunk_graph(
            _no_db(),
            kb_name='dev',
            document_id='d1',
            chunk_id='d1:1:0',
            normalized_result=_result(),
        )
    )
    assert counts == {'entities': 2, 'triples': 1, 'mentions': 2}


def test_write_is_idempotent_for_same_content(fake_dao: _FakeGraphDao) -> None:
    """同一内容写两次必须得到同样的 ID——否则图谱每重建一轮就膨胀一次。"""
    for _ in range(2):
        asyncio.run(
            graph_service.write_chunk_graph(
                None,  # type: ignore[arg-type]
                kb_name='dev',
                document_id='d1',
                chunk_id='d1:1:0',
                normalized_result=_result(),
            )
        )
    entity_ids = [row['entity_id'] for row in fake_dao.writes['entities']]
    triple_ids = [row['triple_id'] for row in fake_dao.writes['triples']]
    assert entity_ids[:2] == entity_ids[2:]
    assert triple_ids[0] == triple_ids[1]


def test_write_namespaces_ids_by_target(fake_dao: _FakeGraphDao) -> None:
    """换一个 KB 必须得到不同的 ID：否则跨库图谱会互相污染。"""
    asyncio.run(
        graph_service.write_chunk_graph(
            _no_db(),
            kb_name='dev',
            document_id='d1',
            chunk_id='c',
            normalized_result=_result(),
        )
    )
    dev_ids = {row['entity_id'] for row in fake_dao.writes['entities']}
    fake_dao.writes['entities'].clear()
    asyncio.run(
        graph_service.write_chunk_graph(
            _no_db(),
            kb_name='ops',
            document_id='d1',
            chunk_id='c',
            normalized_result=_result(),
        )
    )
    ops_ids = {row['entity_id'] for row in fake_dao.writes['entities']}
    assert dev_ids.isdisjoint(ops_ids)


def test_write_uses_normalized_name_for_dedupe_key(fake_dao: _FakeGraphDao) -> None:
    """归一名称是去重键：大小写/空白差异不应产生两个实体。"""
    result = {
        'entities': [{'text': ' Transformer ', 'label': '模型'}],
        'relations': [],
        'metadata': {},
    }
    asyncio.run(
        graph_service.write_chunk_graph(
            _no_db(),
            kb_name='dev',
            document_id='d1',
            chunk_id='c',
            normalized_result=result,  # type: ignore[arg-type]
        )
    )
    assert fake_dao.writes['entities'][0]['normalized_name'] == 'transformer'
    assert fake_dao.writes['entities'][0]['name'] == 'Transformer'
