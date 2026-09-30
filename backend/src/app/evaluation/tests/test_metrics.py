"""评估指标测试（D61）：P/R/F1@K 的边界与聚合语义。

指标是纯函数（无 IO），边界比主路径更重要：``k`` 超过命中数、空召回、空标注、
重复命中——这些在真实评估里都会出现，且很容易把"没算出来"伪装成"算出来是 0"。
"""

from __future__ import annotations

import pytest

from backend.src.app.evaluation.service.metrics import (
    aggregate_metrics,
    calculate_retrieval_metrics,
    f1_at_k,
    overall_score,
    precision_at_k,
    recall_at_k,
)


# ------------------------------------------------------------------ P/R/F1 基本语义
def test_precision_recall_f1_on_full_hit() -> None:
    retrieved = ['a', 'b', 'c']
    relevant = ['a', 'b', 'c']
    assert precision_at_k(retrieved, relevant, 3) == pytest.approx(1.0)
    assert recall_at_k(retrieved, relevant, 3) == pytest.approx(1.0)
    assert f1_at_k(retrieved, relevant, 3) == pytest.approx(1.0)


def test_precision_denominator_is_k_not_hit_count() -> None:
    """Precision@K 的分母是 K：K=5 只召回 1 条且命中，截断到 k 前精度 1/1，
    但按 K 的定义应为 1/5——这是 K 的语义，不是 bug。"""
    assert precision_at_k(['a'], ['a'], 5) == pytest.approx(0.2)


def test_k_larger_than_hits_is_handled() -> None:
    """k > 命中数：不能越界、也不能把缺失位算成命中。"""
    assert precision_at_k(['a', 'b'], ['a', 'b', 'z'], 10) == pytest.approx(0.2)
    assert recall_at_k(['a', 'b'], ['a', 'b', 'z'], 10) == pytest.approx(2 / 3)


def test_empty_inputs_return_zero() -> None:
    assert precision_at_k([], ['a'], 5) == pytest.approx(0.0)
    assert recall_at_k(['a'], [], 5) == pytest.approx(0.0)
    assert f1_at_k([], [], 5) == pytest.approx(0.0)


def test_duplicate_hits_count_once() -> None:
    """重复命中按集合去重：同一 chunk 被召回两次不应虚增指标。"""
    assert recall_at_k(['a', 'a', 'b'], ['a', 'b'], 3) == pytest.approx(1.0)
    assert precision_at_k(['a', 'a'], ['a'], 2) == pytest.approx(0.5)


def test_ranking_beyond_k_is_ignored() -> None:
    """只有前 k 条参与计算（这是 @K 的全部意义）。"""
    assert recall_at_k(['z', 'y', 'a'], ['a'], 2) == pytest.approx(0.0)
    assert recall_at_k(['z', 'y', 'a'], ['a'], 3) == pytest.approx(1.0)


# ------------------------------------------------------------------ 批量与聚合
def test_calculate_retrieval_metrics_reports_multiple_k() -> None:
    metrics = calculate_retrieval_metrics(retrieved_ids=['a', 'b'], gold_ids=['a', 'b'], k_values=(1, 2))
    # k=1：分母为 K=1，命中 'a' → P=1.0；相关集有 2 条 → R=0.5
    assert metrics['precision@1'] == pytest.approx(1.0)
    assert metrics['recall@1'] == pytest.approx(0.5)
    assert metrics['f1@1'] == pytest.approx(2 * 1.0 * 0.5 / (1.0 + 0.5))
    assert metrics['recall@2'] == pytest.approx(1.0)
    assert metrics['f1@2'] == pytest.approx(1.0)


def test_calculate_retrieval_metrics_returns_empty_without_input() -> None:
    """无召回或无标注时返回空 dict——调用方据此区分「未算」与「算出来是 0」。"""
    assert calculate_retrieval_metrics(retrieved_ids=[], gold_ids=['a']) == {}
    assert calculate_retrieval_metrics(retrieved_ids=['a'], gold_ids=[]) == {}


def test_aggregate_metrics_averages_across_items() -> None:
    per_item = [
        {'recall@10': 1.0, 'f1@10': 0.8, 'score': 1.0},
        {'recall@10': 0.0, 'f1@10': 0.0, 'score': 0.0},
    ]
    aggregated = aggregate_metrics(per_item)
    assert aggregated['recall@10'] == pytest.approx(0.5)
    assert aggregated['f1@10'] == pytest.approx(0.4)
    assert aggregated['score'] == pytest.approx(0.5)


def test_aggregate_metrics_skips_items_missing_a_metric() -> None:
    """逐题缺某个指标时，该指标只对"有值的题"取均值，不被当 0 拉低。"""
    per_item = [{'recall@10': 1.0, 'score': 1.0}, {'score': 1.0}]
    aggregated = aggregate_metrics(per_item)
    assert aggregated['recall@10'] == pytest.approx(1.0)
    assert aggregated['score'] == pytest.approx(1.0)


def test_aggregate_metrics_empty_input() -> None:
    assert aggregate_metrics([]) == {}


def test_aggregate_metrics_skips_non_numeric_values() -> None:
    """Judge 的 reasoning 是文本，混在逐题指标里——聚合必须跳过而非报错或算进去。"""
    per_item = [{'score': 1.0, 'reasoning': '答案一致'}, {'score': 0.0, 'reasoning': '缺少关键事实'}]
    aggregated = aggregate_metrics(per_item)
    assert aggregated == {'score': pytest.approx(0.5)}


def test_overall_score_prefers_judge_then_falls_back_to_recall() -> None:
    """有 Judge 分则用 Judge（答案正确率），否则退回 recall@10（纯检索评估）。"""
    with_judge = [{'score': 1.0}, {'score': 0.0}]
    assert overall_score(with_judge) == pytest.approx(0.5)
    without_judge: list[dict[str, float]] = [{'recall@10': 0.4}, {'recall@10': 0.6}]
    assert overall_score(without_judge) == pytest.approx(0.5)
    assert overall_score([]) is None
