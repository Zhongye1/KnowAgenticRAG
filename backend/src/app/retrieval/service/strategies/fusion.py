"""多查询召回融合（agentic-rag spec D41 / ragf-design §A.3）。

RRF（Reciprocal Rank Fusion）在本仓库复用两层：

1. ``hybrid`` 策略内的 dense + BM25 双路融合（Milvus 内建，策略只传 ``rrf_k``）；
2. 本模块的**跨子查询**融合：子查询是同一问题的互补表述，融合只做秩分合并与按
   ``chunk_id`` 去重，精排与 ``final_top_k`` 仍由门面对融合结果执行**一次**——
   这正是 D41 「融合下沉检索层、不在 agent 层做 N 次精排」的落点。
"""

from __future__ import annotations

import operator

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Sequence

__all__ = ['fuse_rrf', 'query_pairs']


def query_pairs(ctx: dict[str, Any]) -> list[tuple[str, list[float]]]:
    """ctx → ``[(查询文本, 查询向量)]``（兼容仅带单查询字段的既有 ctx）。

    ``query_texts`` 为空时回退 ``query_text`` / ``query_embedding``，使既有调用方
    与自定义策略零改动（向后兼容，spec 2.2a 验收）。
    """
    vectors = [list(item or []) for item in (ctx.get('query_embeddings') or [])]
    # 空白项按位跳过（不做过滤后重排），保证文本与向量始终同序对齐
    pairs: list[tuple[str, list[float]]] = []
    for index, item in enumerate(ctx.get('query_texts') or []):
        text = str(item or '').strip()
        if not text:
            continue
        pairs.append((text, vectors[index] if index < len(vectors) else []))
    if not pairs:
        return [(str(ctx.get('query_text') or ''), list(ctx.get('query_embedding') or []))]
    return pairs


def fuse_rrf(hit_lists: Sequence[list[dict[str, Any]]], *, k: int) -> list[dict[str, Any]]:
    """多路命中 RRF 融合：按 ``chunk_id`` 去重、秩分累加、降序返回。

    去重保留**首次出现**的命中对象，并把累加后的 ``rrf_score`` 写回；单路输入
    原样返回（调用方应先判长度，避免无意义的重排）。
    """
    if len(hit_lists) == 1:
        return list(hit_lists[0])
    scores: dict[str, float] = {}
    ordered: dict[str, dict[str, Any]] = {}
    for list_index, hits in enumerate(hit_lists):
        for rank, hit in enumerate(hits, start=1):
            # 无 chunk_id 无法跨路去重：用「路内位置」生成占位键，保证命中不丢
            chunk_id = str(hit.get('chunk_id') or '') or f'__anon__{list_index}:{rank}'
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (float(k) + rank)
            ordered.setdefault(chunk_id, hit)
    return [
        {**ordered[chunk_id], 'rrf_score': score}
        for chunk_id, score in sorted(scores.items(), key=operator.itemgetter(1), reverse=True)
    ]
