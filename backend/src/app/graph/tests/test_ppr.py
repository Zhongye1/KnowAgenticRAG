"""PPR 测试（D62）：三条易错语义 + 结果契约。

PPR 是**自实现**（Yuxi 用 networkx，本项目不引图库），所以正确性靠性质断言而非
"和库对拍"：概率守恒、对称图均匀、种子邻近优先、dangling 按种子分布再分配。
最后一条是这里最容易写错、也最影响结果的一条。
"""

from __future__ import annotations

from typing import Any

import pytest

from backend.src.app.graph.service.ppr import rank_chunks_by_ppr


def _chunk(node_id: str, chunk_id: str) -> dict[str, Any]:
    return {'id': node_id, 'type': 'Chunk', 'properties': {'chunk_id': chunk_id}}


def _entity(node_id: str, entity_id: str) -> dict[str, Any]:
    return {'id': node_id, 'type': 'Entity', 'properties': {'entity_id': entity_id}}


def _edge(source: str, target: str) -> dict[str, str]:
    return {'source_id': source, 'target_id': target}


# ------------------------------------------------------------------ 基本契约
def test_empty_subgraph_returns_empty() -> None:
    assert rank_chunks_by_ppr({'nodes': [], 'edges': []}, {'e1': 1.0}, top_k=5) == []


def test_no_seed_weight_returns_empty() -> None:
    """没有种子（或种子权重全 0）时不打分——否则会给出一堆无意义的均匀分。"""
    subgraph = {'nodes': [_chunk('c1', 'chunk-1'), _entity('n1', 'e1')], 'edges': [_edge('c1', 'n1')]}
    assert rank_chunks_by_ppr(subgraph, {'other': 1.0}, top_k=5) == []
    assert rank_chunks_by_ppr(subgraph, {'e1': 0.0}, top_k=5) == []


def test_no_chunk_nodes_returns_empty() -> None:
    """只有实体节点时无结果：实体是中间量，对外不输出。"""
    subgraph = {'nodes': [_entity('n1', 'e1')], 'edges': []}
    assert rank_chunks_by_ppr(subgraph, {'e1': 1.0}, top_k=5) == []


def test_chunk_scores_are_a_strict_subset_of_the_mass() -> None:
    """对外只给 chunk 分数，而实体节点也持有质量——所以 chunk 之和 **≤ 1** 且 > 0。

    取等只在"图上没有实体节点"时成立，而那种子权重无从匹配、会直接返回空。
    """
    subgraph = {
        'nodes': [_chunk('c1', 'chunk-1'), _chunk('c2', 'chunk-2'), _entity('n1', 'e1')],
        'edges': [_edge('c1', 'n1'), _edge('c2', 'n1')],
    }
    ranked = rank_chunks_by_ppr(subgraph, {'e1': 1.0}, top_k=10)
    total = sum(score for _, score in ranked)
    assert 0.0 < total < 1.0
    assert all(0.0 <= score <= 1.0 for _, score in ranked)


def test_power_iteration_conserves_probability() -> None:
    """守恒在数值核上直接校验：全部节点的分数和恰为 1。"""
    from backend.src.app.graph.service.ppr import _power_iteration

    neighbors = [[1], [0, 2], [1]]  # 链 0-1-2
    scores = _power_iteration(neighbors, [0.5, 0.5, 0.0], alpha=0.85)
    assert sum(scores) == pytest.approx(1.0, abs=1e-6)


def test_power_iteration_handles_all_dangling() -> None:
    """全孤立时幂迭代必须收敛到种子分布本身（不产生 NaN / 不发散）。"""
    from backend.src.app.graph.service.ppr import _power_iteration

    scores = _power_iteration([[], []], [0.25, 0.75], alpha=0.85)
    assert scores == pytest.approx([0.25, 0.75], abs=1e-9)


def test_top_k_truncates_and_orders_desc() -> None:
    subgraph = {
        'nodes': [_chunk(f'c{i}', f'chunk-{i}') for i in range(5)] + [_entity('n1', 'e1')],
        'edges': [_edge('c0', 'n1')] + [_edge(f'c{i}', 'c0') for i in range(1, 5)],
    }
    ranked = rank_chunks_by_ppr(subgraph, {'e1': 1.0}, top_k=2)
    assert len(ranked) == 2
    assert ranked[0][1] >= ranked[1][1]


# ------------------------------------------------------------------ 语义
def test_seed_adjacent_chunk_outranks_distant_one() -> None:
    """种子实体直接相连的 chunk 应高于隔了一跳的 chunk——这就是"图检索"的意义。"""
    subgraph = {
        'nodes': [_chunk('near', 'chunk-near'), _chunk('far', 'chunk-far'), _entity('n1', 'e1'), _entity('n2', 'e2')],
        'edges': [_edge('near', 'n1'), _edge('n1', 'n2'), _edge('n2', 'far')],
    }
    ranked = dict(rank_chunks_by_ppr(subgraph, {'e1': 1.0}, top_k=10))
    assert ranked['chunk-near'] > ranked['chunk-far']


def test_symmetric_graph_with_uniform_seed_is_uniform() -> None:
    """对称结构 + 均匀种子 ⇒ 均匀分数（幂迭代对称性的直接推论）。"""
    subgraph = {
        'nodes': [_chunk('c1', 'chunk-1'), _chunk('c2', 'chunk-2'), _entity('n1', 'e1'), _entity('n2', 'e2')],
        'edges': [_edge('c1', 'n1'), _edge('c2', 'n2'), _edge('n1', 'n2')],
    }
    ranked = dict(rank_chunks_by_ppr(subgraph, {'e1': 1.0, 'e2': 1.0}, top_k=10))
    assert ranked['chunk-1'] == pytest.approx(ranked['chunk-2'], abs=1e-9)


def test_isolated_node_dangles_to_seed_distribution() -> None:
    """孤立节点持有的质量按**种子分布**再分配，不平摊。

    构造：种子只压在 e1 上，另有一个与任何节点都不连的孤立 chunk。
    若 dangling 用均匀分布（写错），孤立 chunk 会拿到可观分数；用种子分布则它拿 0。
    """
    subgraph = {
        'nodes': [_chunk('c1', 'chunk-linked'), _chunk('c9', 'chunk-isolated'), _entity('n1', 'e1')],
        'edges': [_edge('c1', 'n1')],
    }
    ranked = dict(rank_chunks_by_ppr(subgraph, {'e1': 1.0}, top_k=10))
    assert ranked['chunk-isolated'] == pytest.approx(0.0, abs=1e-9)
    assert ranked['chunk-linked'] > 0.0


def test_seed_weight_magnitude_matters() -> None:
    """多个种子时按权重分配：权重高的那侧 chunk 得分更高。"""
    subgraph = {
        'nodes': [_chunk('c1', 'chunk-1'), _chunk('c2', 'chunk-2'), _entity('n1', 'e1'), _entity('n2', 'e2')],
        'edges': [_edge('c1', 'n1'), _edge('c2', 'n2')],
    }
    ranked = dict(rank_chunks_by_ppr(subgraph, {'e1': 3.0, 'e2': 1.0}, top_k=10))
    assert ranked['chunk-1'] > ranked['chunk-2']


def test_unknown_edges_are_ignored() -> None:
    """指向不存在节点的边直接忽略，不报错（子图抽取可能带截断边界）。"""
    subgraph = {
        'nodes': [_chunk('c1', 'chunk-1'), _entity('n1', 'e1')],
        'edges': [_edge('c1', 'n1'), _edge('c1', 'ghost'), _edge('ghost', 'n1')],
    }
    ranked = rank_chunks_by_ppr(subgraph, {'e1': 1.0}, top_k=10)
    assert ranked[0][0] == 'chunk-1'


def test_self_loop_is_ignored() -> None:
    subgraph = {
        'nodes': [_chunk('c1', 'chunk-1'), _entity('n1', 'e1')],
        'edges': [_edge('c1', 'c1'), _edge('c1', 'n1')],
    }
    assert rank_chunks_by_ppr(subgraph, {'e1': 1.0}, top_k=10)[0][0] == 'chunk-1'


@pytest.mark.parametrize('damping', [0.1, 0.85, 0.99])
def test_damping_is_clamped_and_result_stays_valid(damping: float) -> None:
    subgraph = {'nodes': [_chunk('c1', 'chunk-1'), _entity('n1', 'e1')], 'edges': [_edge('c1', 'n1')]}
    ranked = rank_chunks_by_ppr(subgraph, {'e1': 1.0}, top_k=5, damping=damping)
    assert len(ranked) == 1
    assert 0.0 < ranked[0][1] < 1.0
