"""个性化 PageRank（RAG 清单 Phase 5 / D62：Yuxi ``rank_chunks_by_ppr`` 迁移）。

**与 Yuxi 的差异：不引 networkx。** Yuxi 用 `nx.pagerank` 算，但那是它引入图库的**唯一**
用途；本项目要的是"给定子图 + 种子权重，给 chunk 节点打分"这一件事，幂迭代本身约 40 行。
为一个函数拉进整个图库不划算（也是 AGENTS.md「最小实现」的口径）。

语义逐条对齐 Yuxi，三条容易漏的：

1. **无向图**：``source_id → target_id`` 与反向等价（`nx.Graph()` 语义）；
2. **种子归一**：reset 向量各分量除以其总和后才作为 personalization；
3. **dangling 分布用 personalization 而非均匀分布**（Yuxi 注释里点明"与 igraph 的 reset
   语义一致"）——孤立节点持有的概率质量按种子分布重新分配，而不是平摊给所有节点。这一条
   直接决定"只有种子实体邻近的 chunk 得分高"，写错会让无关 chunk 得到虚假分数。

只输出 Chunk 节点：实体节点是中间量，对外无意义。
"""

from __future__ import annotations

import operator

from typing import Any

__all__ = ['DEFAULT_DAMPING', 'PAGERANK_MAX_ITER', 'PAGERANK_TOL', 'rank_chunks_by_ppr']

DEFAULT_DAMPING = 0.85
PAGERANK_MAX_ITER = 100
PAGERANK_TOL = 1e-6


def rank_chunks_by_ppr(
    subgraph: dict[str, Any],
    seed_weights: dict[str, float],
    *,
    top_k: int,
    damping: float = DEFAULT_DAMPING,
) -> list[tuple[str, float]]:
    """子图 + 种子实体权重 → ``[(chunk_id, score)]``（降序，截断 top_k）。

    ``subgraph`` 形如 ``{'nodes': [{'id', 'type', 'properties'}], 'edges': [{'source_id','target_id'}]}``；
    种子权重按 ``properties.entity_id`` 匹配实体节点；chunk 节点按 ``properties.chunk_id``
    进入结果。
    """
    nodes = list(subgraph.get('nodes') or [])
    if not nodes:
        return []

    index_by_id = {str(node.get('id')): index for index, node in enumerate(nodes)}
    # 无向邻接：两端各登记一次（对齐 nx.Graph()）
    neighbors: list[list[int]] = [[] for _ in nodes]
    for edge in subgraph.get('edges') or []:
        source = index_by_id.get(str(edge.get('source_id')))
        target = index_by_id.get(str(edge.get('target_id')))
        if source is None or target is None or source == target:
            continue
        neighbors[source].append(target)
        neighbors[target].append(source)

    chunk_indexes: list[tuple[int, str]] = []
    reset = [0.0] * len(nodes)
    for index, node in enumerate(nodes):
        properties = node.get('properties') or {}
        if node.get('type') == 'Chunk' and properties.get('chunk_id'):
            chunk_indexes.append((index, str(properties['chunk_id'])))
            continue
        entity_id = properties.get('entity_id')
        if entity_id is not None and str(entity_id) in seed_weights:
            reset[index] = float(seed_weights[str(entity_id)] or 0.0)

    total = sum(reset)
    if total <= 0 or not chunk_indexes:
        return []
    personalization = [value / total for value in reset]

    scores = _power_iteration(neighbors, personalization, alpha=min(max(damping, 0.1), 0.99))
    ranked = sorted(
        ((chunk_id, scores[index]) for index, chunk_id in chunk_indexes),
        key=operator.itemgetter(1),
        reverse=True,
    )
    return ranked[: max(int(top_k), 1)]


def _power_iteration(neighbors: list[list[int]], personalization: list[float], *, alpha: float) -> list[float]:
    """幂迭代求 personalized PageRank（dangling 质量按 personalization 再分配）。"""
    size = len(personalization)
    ranks = list(personalization)
    for _ in range(PAGERANK_MAX_ITER):
        updated = [(1.0 - alpha) * value for value in personalization]
        dangling = 0.0
        for index, degree in enumerate(neighbors):
            if degree:
                share = alpha * ranks[index] / len(degree)
                for target in degree:
                    updated[target] += share
            else:
                dangling += ranks[index]
        if dangling:
            for index in range(size):
                updated[index] += alpha * dangling * personalization[index]
        delta = sum(abs(updated[index] - ranks[index]) for index in range(size))
        ranks = updated
        if delta < PAGERANK_TOL:
            break
    return ranks
