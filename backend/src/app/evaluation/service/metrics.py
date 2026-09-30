"""评估指标（RAG 清单 Phase 4 / D61：Yuxi ``knowledge/eval/metrics.py`` 迁移）。

**与 Yuxi 的一处结构性偏差**：Yuxi 把 LLM Judge（``AnswerMetrics.judge_correctness``）
放在本模块，而它是 async + 网络 IO。这里只保留**纯函数**，Judge 移到 ``judge.py``。
理由是纯函数能零 mock 单测；混在一起会让「指标算错了」与「模型调不通」在同一条
测试里纠缠。

@K 的语义按定义：**分母是 K 而非命中数**，且只有前 K 条参与计算。无召回或无标注
时返回**空 dict** 而不是 0——调用方据此区分「没算」与「算出来是 0」，否则聚合会把
「算不了」当成「得零分」拉低总分。
"""

from __future__ import annotations

from typing import Any

__all__ = [
    'DEFAULT_K_VALUES',
    'aggregate_metrics',
    'calculate_retrieval_metrics',
    'f1_at_k',
    'overall_score',
    'precision_at_k',
    'recall_at_k',
]

DEFAULT_K_VALUES: tuple[int, ...] = (1, 3, 5, 10)


def precision_at_k(retrieved_ids: list[str], relevant_ids: list[str], k: int) -> float:
    """Precision@K：前 K 条里的命中比例，分母取 K。"""
    top = [str(item) for item in retrieved_ids[:k]]
    if not top:
        return 0.0
    return len(set(top) & {str(item) for item in relevant_ids}) / k


def recall_at_k(retrieved_ids: list[str], relevant_ids: list[str], k: int) -> float:
    """Recall@K：召回到的相关条目占全部相关条目的比例。"""
    relevant = {str(item) for item in relevant_ids}
    if not relevant:
        return 0.0
    return len(set(str(item) for item in retrieved_ids[:k]) & relevant) / len(relevant)


def f1_at_k(retrieved_ids: list[str], relevant_ids: list[str], k: int) -> float:
    """F1@K：P 与 R 的调和平均（两者皆 0 时返回 0，不做除零）。"""
    precision = precision_at_k(retrieved_ids, relevant_ids, k)
    recall = recall_at_k(retrieved_ids, relevant_ids, k)
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def calculate_retrieval_metrics(
    *,
    retrieved_ids: list[str],
    gold_ids: list[str],
    k_values: tuple[int, ...] = DEFAULT_K_VALUES,
) -> dict[str, float]:
    """逐题的检索指标（P/R/F1 三个系列 × 各 K）；无召回或无标注返回空 dict。"""
    if not retrieved_ids or not gold_ids:
        return {}
    metrics: dict[str, float] = {}
    for k in k_values:
        metrics[f'precision@{k}'] = precision_at_k(retrieved_ids, gold_ids, k)
        metrics[f'recall@{k}'] = recall_at_k(retrieved_ids, gold_ids, k)
        metrics[f'f1@{k}'] = f1_at_k(retrieved_ids, gold_ids, k)
    return metrics


def aggregate_metrics(per_item: list[dict[str, Any]]) -> dict[str, float]:
    """逐题指标 → 数据集级均值。

    **只对"有该指标"的题取均值**：某题缺某项（如只有检索指标没有 Judge 分）时，
    不应把它当 0 拉低整体。非数值项（如 Judge 的 ``reasoning`` 文本）一律跳过。
    """
    totals: dict[str, float] = {}
    counts: dict[str, int] = {}
    for item in per_item:
        for name, value in (item or {}).items():
            if isinstance(value, bool) or not isinstance(value, int | float):
                continue
            totals[name] = totals.get(name, 0.0) + float(value)
            counts[name] = counts.get(name, 0) + 1
    return {name: totals[name] / counts[name] for name in totals if counts[name]}


def overall_score(per_item: list[dict[str, Any]]) -> float | None:
    """综合得分：有 Judge 分则用答案正确率，否则退回 ``recall@10``（纯检索评估）。"""
    judge_scores = [float(item['score']) for item in per_item if isinstance(item.get('score'), int | float)]
    if judge_scores:
        return sum(judge_scores) / len(judge_scores)
    recalls = [float(item['recall@10']) for item in per_item if isinstance(item.get('recall@10'), int | float)]
    if recalls:
        return sum(recalls) / len(recalls)
    return None
