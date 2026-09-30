"""失败护栏测试（agent 层设计 §4.2）。

四类护栏是「预算管不到」的失败：空转、卡死、截断循环、截断的工具调用。
这里逐类覆盖分支，并钉住三条容易被改坏的不变量：

1. **带工具调用的轮次不算空**——正常工具循环不能被误判成空转；
2. **阈值语义**：空回复「重试 N 次后终止」、同文「连续 N 轮终止」、截断「连续 N 轮终止」；
3. **截断优先于内容**——被 cap 截断的轮次即使有内容也不是完整答案。
"""

from __future__ import annotations

import pytest

from backend.src.app.agent.graph.guards import RoundSignals, RoundTracker, is_complete_tool_args


def _tracker() -> RoundTracker:
    return RoundTracker(empty_retries=2, repeat_rounds=2, length_rounds=3)


def test_normal_round_continues() -> None:
    decision = _tracker().observe(RoundSignals(answer='一份完整的回答', finish_reason='stop'))
    assert decision.action == 'continue'
    assert decision.reason == 'ok'


def test_tool_call_round_is_not_treated_as_empty() -> None:
    """带工具调用的轮次内容为空属正常——不得计入空回复重试。"""
    tracker = _tracker()
    for _ in range(5):
        decision = tracker.observe(RoundSignals(answer='', tool_call_count=2))
        assert decision.action == 'continue'
    assert tracker.empty_retry_used == 0
    assert tracker.triggers == []


def test_empty_answer_retries_then_aborts() -> None:
    """空回复：重试 2 次（共 3 轮）后终止，不再空转烧预算。"""
    tracker = _tracker()
    assert tracker.observe(RoundSignals(answer='')).action == 'retry'
    assert tracker.observe(RoundSignals(answer='   ')).action == 'retry'
    third = tracker.observe(RoundSignals(answer=''))
    assert third.action == 'abort'
    assert third.reason == 'empty_answer'
    assert tracker.triggers == ['empty_answer']


def test_repeated_answer_aborts_on_second_identical_round() -> None:
    """同文重复：连续 2 轮逐字相同即终止（阈值 repeat_rounds=2）。"""
    tracker = _tracker()
    assert tracker.observe(RoundSignals(answer='一样的回答')).action == 'continue'
    second = tracker.observe(RoundSignals(answer='一样的回答'))
    assert second.action == 'abort'
    assert second.reason == 'repeated_answer'


def test_repeated_answer_counter_resets_on_change() -> None:
    tracker = _tracker()
    tracker.observe(RoundSignals(answer='A'))
    tracker.observe(RoundSignals(answer='B'))
    decision = tracker.observe(RoundSignals(answer='B'))
    assert decision.action == 'abort'  # 第 2、3 轮同为 B


def test_consecutive_truncation_aborts_after_threshold() -> None:
    """连续截断：前 N-1 轮重试，第 N 轮终止。"""
    tracker = _tracker()
    assert tracker.observe(RoundSignals(answer='半截', finish_reason='length')).action == 'retry'
    assert tracker.observe(RoundSignals(answer='半截', finish_reason='length')).action == 'retry'
    third = tracker.observe(RoundSignals(answer='半截', finish_reason='length'))
    assert third.action == 'abort'
    assert third.reason == 'length_loop'


def test_truncation_streak_resets_after_normal_round() -> None:
    """截断必须是**连续**的——中间夹一轮正常就重新计数。"""
    tracker = _tracker()
    tracker.observe(RoundSignals(answer='a', finish_reason='length'))
    tracker.observe(RoundSignals(answer='b', finish_reason='length'))
    tracker.observe(RoundSignals(answer='正常回答', finish_reason='stop'))
    assert tracker.observe(RoundSignals(answer='c', finish_reason='length')).action == 'retry'


def test_truncation_wins_over_content() -> None:
    """被截断的轮次即使有内容也不算完成——不能当成正常答案收工。"""
    decision = _tracker().observe(RoundSignals(answer='看起来完整的开头', finish_reason='length'))
    assert decision.action == 'retry'


@pytest.mark.parametrize(
    'raw',
    [
        '{"query": "abc"}',
        '  {"query": "abc", "top_k": 5}  ',
        '{}',
    ],
)
def test_complete_tool_args_accepts_valid_json_object(raw: str) -> None:
    assert is_complete_tool_args(raw) is True


@pytest.mark.parametrize(
    'raw',
    [
        '',  # 空参数
        '{"query": "abc',  # 被 cap 截断的半截 JSON
        '{"query": "abc"',  # 括号不配对
        'not json at all',
        '["a", "b"]',  # 顶层不是对象
        '{"query": }',
    ],
)
def test_incomplete_tool_args_are_rejected(raw: str) -> None:
    """半截参数一律判不完整——调用方据此整批拒绝执行。"""
    assert is_complete_tool_args(raw) is False
