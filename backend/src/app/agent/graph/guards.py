"""失败护栏（agent 层设计 §4.2 / D92 配套）。

现状只有三重预算（``recursion_limit`` / 墙钟 / ``max_rewrites``）——它们管的是
「跑多久」，不管「跑得对不对」。WeKnora 的生产常量暴露了四类预算管不到的失败：

1. **空转**：模型返回空内容且自然停止（thinking-only 循环）——预算不烧，但用户拿到空答案；
2. **卡死**：连续多轮回复逐字相同且无工具调用（上游 finish_reason 未处理时最典型）；
3. **截断循环**：连续多轮被 completion cap 截断——模型被告知重发，于是发出更长的调用，
   再次被截断，直到烧完整轮预算；
4. **截断的工具调用**：被 cap 截断的那一批 tool_call 参数是半截的，执行它等于让工具
   收到残参数（检索到错误的库、写入不完整的内容）。

本模块是**纯函数**：输入一轮的结果特征，输出「继续 / 重试 / 终止」的决策，
不依赖图、模型或 IO——因此可以单测覆盖全部分支，节点只负责把决策落到状态里。

第 5 类（``stall ≠ total``）不在这里：它需要观察**流式输出间隔**，属于流式层
（见 ``stream_bridge``）而非轮次层，故由流式侧单独实现。
"""

from __future__ import annotations

import json

from dataclasses import dataclass, field
from typing import Literal

__all__ = [
    'GuardAction',
    'GuardDecision',
    'RoundSignals',
    'RoundTracker',
    'is_complete_tool_args',
]

#: 护栏的三种处置
GuardAction = Literal['continue', 'retry', 'abort']


@dataclass(frozen=True)
class RoundSignals:
    """一轮结束时的可观测特征（由节点从模型响应里提取）。"""

    #: 本轮产出的正文（空字符串 = 模型没给内容）
    answer: str
    #: 供应商返回的结束原因（``length`` 表示被 completion cap 截断）
    finish_reason: str | None = None
    #: 本轮发出的工具调用数（>0 表示这轮不是「终结轮」）
    tool_call_count: int = 0

    @property
    def truncated(self) -> bool:
        return (self.finish_reason or '').lower() == 'length'


@dataclass
class RoundTracker:
    """跨轮累计的护栏计数（挂在图状态上，随 Run 结束丢弃）。

    三个计数器各自独立：一轮可以同时是「截断」且「与上轮同文」，
    分别累加才能让阈值语义清晰（截断看连续轮数，重复看相邻两轮）。
    """

    #: 允许的空回复重试次数（WeKnora 取 2：每次重试约 2s 延迟，换掉「空答案」很值）
    empty_retries: int = 2
    #: 连续同文轮数的阈值（含当前轮）
    repeat_rounds: int = 2
    #: 连续截断轮数的阈值
    length_rounds: int = 3

    #: --- 运行时计数 ---
    empty_retry_used: int = 0
    consecutive_repeat: int = 0
    consecutive_length: int = 0
    #: 上一轮正文（判「同文」用；None = 尚无上一轮）
    last_answer: str | None = None

    #: 已触发过的护栏原因（供 done 元数据与审计）
    triggers: list[str] = field(default_factory=list)

    def observe(self, signals: RoundSignals) -> GuardDecision:
        """观察一轮结果并给出处置；**会就地更新计数**（节点按返回值行动即可）。"""
        # 有工具调用的轮次是「进行中」的轮次：内容为空属正常（模型在调工具），
        # 也不参与同文/截断判定——否则正常的工具循环会被误判成空转
        if signals.tool_call_count > 0:
            self.consecutive_repeat = 0
            if not signals.truncated:
                self.consecutive_length = 0
            return GuardDecision(action='continue', reason='tool_calls')

        stripped = signals.answer.strip()

        # 截断优先：被 cap 截断的轮次即使有内容也不是完整答案
        if signals.truncated:
            self.consecutive_length += 1
            self.consecutive_repeat = 0
            if self.consecutive_length >= self.length_rounds:
                return self._abort('length_loop')
            return GuardDecision(action='retry', reason='truncated')
        self.consecutive_length = 0

        # 同文重复：连续 N 轮逐字相同（含「连续两轮都空」这种最直白的卡死）
        if self.last_answer is not None and stripped == self.last_answer:
            self.consecutive_repeat += 1
        else:
            self.consecutive_repeat = 1
        self.last_answer = stripped
        if self.consecutive_repeat >= self.repeat_rounds and stripped:
            return self._abort('repeated_answer')

        # 空回复：给有限次重试，用尽后终止（不再空转）
        if not stripped:
            if self.empty_retry_used >= self.empty_retries:
                return self._abort('empty_answer')
            self.empty_retry_used += 1
            return GuardDecision(action='retry', reason='empty_answer')

        return GuardDecision(action='continue', reason='ok')

    def _abort(self, reason: str) -> GuardDecision:
        self.triggers.append(reason)
        return GuardDecision(action='abort', reason=reason)


@dataclass(frozen=True)
class GuardDecision:
    """护栏处置：``retry`` = 重发本轮请求；``abort`` = 终止并用兜底话术收尾。"""

    action: GuardAction
    reason: str


def is_complete_tool_args(raw: str) -> bool:
    """工具调用参数是否完整（第 4 类护栏）。

    被 completion cap 截断的 tool_call，其 ``arguments`` 是半截 JSON
    （``{"query": "abc``）——解析失败即判定不完整，调用方应**整批拒绝执行**
    并回灌结构化错误，而不是把残参数交给工具。
    """
    text = (raw or '').strip()
    if not text or not text.startswith('{') or not text.endswith('}'):
        return False
    try:
        parsed = json.loads(text)
    except (ValueError, TypeError):
        return False
    return isinstance(parsed, dict)
