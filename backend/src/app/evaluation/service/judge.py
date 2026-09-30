"""LLM Judge（RAG 清单 Phase 4 / D61：Yuxi ``AnswerMetrics.judge_correctness`` 迁移）。

判据是「生成答案在**事实层面**是否与参考答案一致」，忽略措辞/标点/格式差异；只做
二元判定（1.0 / 0.0），不做连续打分——避免把「打分尺度」变成新的调参对象。

与 Yuxi 的三处差异：

1. **判分模型由调用方注入**，不在此处查 provider：便于单测，也支持按评估请求指定
   不同的 Judge 模型；
2. **判分失败不伪装成 0 分**。Yuxi 的 ``except Exception`` 会把"判分器坏了"写成
   ``score=0.0``，于是它与"答案全错"在聚合里不可区分。这里返回 ``score=None``
   （``judged=False``），由聚合侧排除出分母；
3. 中间分按阈值二元化，守住"只做二元判定"的契约。
"""

from __future__ import annotations

import textwrap

from typing import Any

import json_repair

from backend.src.common.log import log

__all__ = ['JUDGE_POSITIVE_THRESHOLD', 'build_judge_prompt', 'judge_correctness']

# 模型偶尔给中间分（0.7/0.2 之类）；>= 阈值视为一致
JUDGE_POSITIVE_THRESHOLD = 0.5


def build_judge_prompt(*, query: str, generated_answer: str, gold_answer: str) -> str:
    """构造判定提示词（迁移 Yuxi 的措辞，保留"忽略措辞差异"的判据）。"""
    return textwrap.dedent(f"""你是一个公正的评判者，请评估 AI 生成的答案相对于标准答案的准确性。

        问题：{query}

        标准答案：
        {gold_answer}

        AI 生成的答案：
        {generated_answer}

        请判断 AI 生成的答案是否在事实层面与标准答案一致。
        忽略措辞、标点符号或格式上的细微差异。
        只关注核心事实是否准确包含。

        请返回以下 JSON 格式的结果（不要包含其他文本、Markdown 或注释）：
        {{
            "score": 1.0,
            "reasoning": "简要说明判定理由"
        }}
        score 只能是 1.0 或 0.0。
        """)


def _strip_code_fence(content: str) -> str:
    """剥掉模型惯用的 ```json 围栏（json_repair 能修内容，但围栏要先去掉）。"""
    text = content.strip()
    if text.startswith('```'):
        text = text.split('\n', 1)[1] if '\n' in text else ''
        if text.rstrip().endswith('```'):
            text = text.rstrip()[:-3]
    return text.strip()


def _not_judged(reason: str) -> dict[str, Any]:
    """未能判定：``score=None`` 让聚合侧把它排除出分母，而不是当成 0 分。"""
    return {'score': None, 'reasoning': reason, 'judged': False}


def _binary_score(raw: Any) -> float:
    """中间分按阈值二元化；无法转换时抛 ValueError 交给调用方按"未判定"处理。"""
    value = float(raw)
    return 1.0 if value >= JUDGE_POSITIVE_THRESHOLD else 0.0


async def judge_correctness(
    *,
    query: str,
    generated_answer: str,
    gold_answer: str,
    judge_model: Any,
) -> dict[str, Any]:
    """二元判定生成答案是否与参考答案事实一致。

    返回 ``{'score': 1.0|0.0|None, 'reasoning': str, 'judged': bool}``。
    调用不抛异常：逐题判分失败在评估语义里是正常的，应记为该题未判定而非终止整次评估。
    """
    if not str(generated_answer or '').strip():
        return _not_judged('未生成答案')
    if not str(gold_answer or '').strip():
        return _not_judged('无参考答案')

    prompt = build_judge_prompt(query=query, generated_answer=generated_answer, gold_answer=gold_answer)
    try:
        content, _usage = await judge_model.achat([{'role': 'user', 'content': prompt}])
    except Exception as exc:
        log.warning('LLM 判分调用失败（该题记为未判定）: {}', exc)
        return _not_judged(f'判分调用失败: {type(exc).__name__}')

    try:
        parsed = json_repair.loads(_strip_code_fence(str(content or '')))
        if not isinstance(parsed, dict) or 'score' not in parsed:
            raise ValueError(f'判分回复缺少 score 字段: {str(content)[:120]}')
        return {
            'score': _binary_score(parsed['score']),
            'reasoning': str(parsed.get('reasoning') or ''),
            'judged': True,
        }
    except Exception as exc:
        log.warning('LLM 判分回复无法解析（该题记为未判定）: {}', exc)
        return _not_judged(f'判分回复无法解析: {type(exc).__name__}')
