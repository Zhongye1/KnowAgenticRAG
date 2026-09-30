"""逐题评估测试（D61）：走线上链路的答案来源、指标组装、逐题失败不炸整次评估。

答案来源是本模块与 Yuxi 的核心差异（决策 4），所以有一条用例专门断言**答案与引用
都来自 ChatService**，而不是自建 prompt 的产出。
"""

from __future__ import annotations

import asyncio

from typing import TYPE_CHECKING, Any

import pytest

from backend.src.app.evaluation.service.evaluator import build_chat_param, evaluate_item

if TYPE_CHECKING:
    from backend.src.app.chat.schema.chat import ChatParam


class _FakeChat:
    """线上问答链路替身：记录收到的 ChatParam，返回可编排的载荷。"""

    def __init__(self, payload: dict[str, Any] | None = None, *, raises: Exception | None = None) -> None:
        self.payload = payload or {}
        self.raises = raises
        self.params: list[ChatParam] = []

    async def acomplete_multi(
        self,
        db: Any,
        *,
        kb_names: list[str],
        param: ChatParam,
        plugin_namespace: str | None = None,
        scope: Any = None,
    ) -> dict[str, Any]:
        self.params.append(param)
        if self.raises is not None:
            raise self.raises
        return self.payload


class _FakeJudge:
    def __init__(self, reply: str = '{"score": 1.0, "reasoning": "一致"}') -> None:
        self.reply = reply

    async def achat(self, messages: list[dict[str, Any]], **_: Any) -> tuple[str, dict[str, Any]]:
        return self.reply, {}


def _item(**overrides: Any) -> dict[str, Any]:
    item: dict[str, Any] = {
        'query_text': '模型有多少层？',
        'gold_chunk_ids': ['d1:1:0', 'd1:1:1'],
        'gold_answer': '十二层',
    }
    item.update(overrides)
    return item


def _evaluate(chat: _FakeChat, *, judge: Any = None, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        'db': None,
        'kb_name': 'dev',
        'item': _item(),
        'retrieval_config': {},
        'judge_model': judge,
        'chat': chat,
    }
    payload.update(overrides)
    return asyncio.run(evaluate_item(**payload))


# ------------------------------------------------------------------ ChatParam 投影
def test_build_chat_param_projects_only_retrieval_keys() -> None:
    """未知键静默忽略：retrieval_config 由调用方给出，报 422 对用户没有行动价值。"""
    param = build_chat_param(
        query_text='q',
        retrieval_config={'search_mode': 'keyword', 'fusion_mode': 'weighted', 'bogus': 1, 'final_top_k': None},
    )
    assert param.search_mode == 'keyword'
    assert param.fusion_mode == 'weighted'
    assert param.final_top_k is None  # None 不覆盖


def test_build_chat_param_carries_fusion_weights() -> None:
    """D57 的旋钮必须能从评估配置下发——否则评估无从度量融合权重。"""
    param = build_chat_param(query_text='q', retrieval_config={'vector_weight': 0.6, 'bm25_weight': 0.4})
    assert param.vector_weight == pytest.approx(0.6)
    assert param.bm25_weight == pytest.approx(0.4)


# ------------------------------------------------------------------ 正常一题
def test_answer_and_citations_come_from_chat_service() -> None:
    """核心契约：答案与引用取自线上链路，检索指标由同一次调用的引用得出。"""
    chat = _FakeChat({
        'answer': '十二层',
        'citations': [{'chunk_id': 'd1:1:0'}, {'chunk_id': 'd2:1:0'}],
        'usage': {'total_tokens': 42},
    })
    result = _evaluate(chat)
    assert result['generated_answer'] == '十二层'
    assert result['retrieved_chunk_ids'] == ['d1:1:0', 'd2:1:0']
    assert result['usage'] == {'total_tokens': 42}
    assert result['error_message'] is None


def test_retrieval_metrics_use_citation_order() -> None:
    """检索指标按引用顺序取前 K：召回 1/2 条标注 → recall@10 = 0.5。"""
    chat = _FakeChat({'answer': 'a', 'citations': [{'chunk_id': 'd1:1:0'}, {'chunk_id': 'zz:1:0'}]})
    result = _evaluate(chat)
    assert result['metrics']['recall@10'] == pytest.approx(0.5)
    assert result['metrics']['precision@10'] == pytest.approx(0.1)


def test_judge_runs_only_when_gold_answer_and_model_present() -> None:
    chat = _FakeChat({'answer': '十二层', 'citations': [{'chunk_id': 'd1:1:0'}]})
    with_judge = _evaluate(chat, judge=_FakeJudge())
    assert with_judge['metrics']['score'] == pytest.approx(1.0)
    assert with_judge['metrics']['judged'] is True

    without_judge = _evaluate(chat)
    assert 'score' not in without_judge['metrics']


def test_no_gold_annotations_yields_empty_metrics() -> None:
    """未标注的数据集只产出答案，不产出指标——不能把"没标注"算成"得零分"。"""
    chat = _FakeChat({'answer': 'a', 'citations': [{'chunk_id': 'd1:1:0'}]})
    result = _evaluate(chat, item=_item(gold_chunk_ids=[], gold_answer=None))
    assert result['metrics'] == {}


def test_retrieval_config_is_forwarded_to_chat() -> None:
    chat = _FakeChat({'answer': 'a', 'citations': []})
    _evaluate(chat, retrieval_config={'search_mode': 'keyword', 'recall_top_k': 30})
    assert chat.params[0].search_mode == 'keyword'
    assert chat.params[0].recall_top_k == 30


# ------------------------------------------------------------------ 逐题失败
def test_chat_failure_is_recorded_not_raised() -> None:
    """逐题失败记为该题错误并继续：一次评估不该因一道题而全废。"""
    result = _evaluate(_FakeChat(raises=RuntimeError('模型不可用')))
    assert result['error_message'] is not None
    assert 'RuntimeError' in result['error_message']
    assert result['metrics'] == {}
    assert result['generated_answer'] is None


def test_failed_item_does_not_contribute_to_average() -> None:
    """失败题 metrics 为空 → 聚合不会把它当 0 分拉低整体（与 judge 未判定的口径一致）。"""
    from backend.src.app.evaluation.service.metrics import aggregate_metrics

    ok = _evaluate(_FakeChat({'answer': 'a', 'citations': [{'chunk_id': 'd1:1:0'}, {'chunk_id': 'd1:1:1'}]}))
    failed = _evaluate(_FakeChat(raises=RuntimeError('boom')))
    aggregated = aggregate_metrics([ok['metrics'], failed['metrics']])
    assert aggregated['recall@10'] == pytest.approx(1.0)
