"""LLM Judge 测试（D61）：二元判定、脏 JSON 解析、以及**判分失败不伪装成 0 分**。

最后一条是本模块与 Yuxi 的关键差异：Yuxi 的 ``except Exception`` 把"判分器出错"
也写成 ``score=0.0``，于是"判分器坏了"和"答案全错"在聚合里不可区分。这里用
``score=None`` 表示**未能判定**，由聚合侧排除出分母。
"""

from __future__ import annotations

import asyncio

from typing import Any

import pytest

from backend.src.app.evaluation.service.judge import build_judge_prompt, judge_correctness


class _FakeJudgeModel:
    """可编排回复的判分模型替身（记录收到的 prompt 便于断言）。"""

    def __init__(self, reply: str = '', *, raises: Exception | None = None) -> None:
        self.reply = reply
        self.raises = raises
        self.prompts: list[str] = []

    async def achat(self, messages: list[dict[str, Any]], **_: Any) -> tuple[str, dict[str, Any]]:
        self.prompts.append(str(messages[-1]['content']))
        if self.raises is not None:
            raise self.raises
        return self.reply, {'total_tokens': 7}


def _judge(reply: str = '', *, raises: Exception | None = None, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        'query': '模型有多少层？',
        'generated_answer': '12 层',
        'gold_answer': '十二层',
    }
    payload.update(overrides)
    return asyncio.run(judge_correctness(judge_model=_FakeJudgeModel(reply, raises=raises), **payload))


# ------------------------------------------------------------------ 提示词
def test_prompt_carries_all_three_inputs() -> None:
    prompt = build_judge_prompt(query='Q', generated_answer='A', gold_answer='G')
    assert 'Q' in prompt and 'A' in prompt and 'G' in prompt
    assert '1.0' in prompt and '0.0' in prompt  # 二元判定的取值必须写明


# ------------------------------------------------------------------ 正常判定
def test_judge_accepts_consistent_answer() -> None:
    verdict = _judge('{"score": 1.0, "reasoning": "核心事实一致"}')
    assert verdict['score'] == pytest.approx(1.0)
    assert verdict['reasoning'] == '核心事实一致'
    assert verdict['judged'] is True


def test_judge_rejects_inconsistent_answer() -> None:
    verdict = _judge('{"score": 0.0, "reasoning": "层数不符"}')
    assert verdict['score'] == pytest.approx(0.0)
    assert verdict['judged'] is True


def test_judge_strips_markdown_fence() -> None:
    """模型常把 JSON 包在 ```json 围栏里——必须剥掉而不是判为解析失败。"""
    verdict = _judge('```json\n{"score": 1.0, "reasoning": "一致"}\n```')
    assert verdict['score'] == pytest.approx(1.0)


def test_judge_repairs_malformed_json() -> None:
    """尾逗号/缺引号等脏 JSON 由 json_repair 兜底（决策 2 选它的理由）。"""
    verdict = _judge('{"score": 1.0, "reasoning": "一致",}')
    assert verdict['score'] == pytest.approx(1.0)


def test_judge_clamps_non_binary_score() -> None:
    """模型给出 0.7 这类中间分时按阈值二元化，保持"只做二元判定"的契约。"""
    assert _judge('{"score": 0.9, "reasoning": "基本一致"}')['score'] == pytest.approx(1.0)
    assert _judge('{"score": 0.2, "reasoning": "偏差较大"}')['score'] == pytest.approx(0.0)


# ------------------------------------------------------------------ 未能判定：一律 None
def test_missing_generated_answer_is_not_judged() -> None:
    verdict = _judge('{"score": 1.0}', generated_answer='')
    assert verdict['score'] is None
    assert verdict['judged'] is False


def test_missing_gold_answer_is_not_judged() -> None:
    verdict = _judge('{"score": 1.0}', gold_answer='')
    assert verdict['score'] is None
    assert verdict['judged'] is False


def test_unparsable_reply_is_not_judged_rather_than_zero() -> None:
    """解析不出分数 → None（不伪装 0），否则聚合会把判分器故障算成答案全错。"""
    verdict = _judge('抱歉，我无法判断。')
    assert verdict['score'] is None
    assert verdict['judged'] is False
    assert verdict['reasoning']


def test_model_error_is_not_judged_rather_than_zero() -> None:
    verdict = _judge(raises=RuntimeError('judge model 不可用'))
    assert verdict['score'] is None
    assert verdict['judged'] is False


def test_model_error_does_not_raise() -> None:
    """判分失败不应炸掉整次评估——逐题失败在评估语义里是正常的。"""
    verdict = _judge(raises=TimeoutError('超时'))
    assert verdict['judged'] is False
