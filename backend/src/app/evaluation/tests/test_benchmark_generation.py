"""数据集生成测试（D61）：提示词、防标注污染、分批并发与失败隔离。

最关键的一条是**防标注污染**：模型编造的 ``chunk_id`` 若被写进标注，该题的
P/R/F1 会恒为 0，且从结果上看不出是标注坏了还是检索坏了。
"""

from __future__ import annotations

import asyncio

from typing import TYPE_CHECKING, Any

from backend.src.app.evaluation.service.benchmark_generation import (
    GENERATION_BATCH_SIZE,
    build_generation_prompt,
    generate_items,
    parse_generated_items,
)

if TYPE_CHECKING:
    import pytest


class _FakeModel:
    """按批返回固定回复的生成模型替身；记录收到的提示词以断言分批。"""

    def __init__(self, reply_for: Any = None, *, raises: Exception | None = None) -> None:
        self.prompts: list[str] = []
        self.reply_for = reply_for
        self.raises = raises

    async def achat(self, messages: list[dict[str, Any]], **_: Any) -> tuple[str, dict[str, Any]]:
        prompt = str(messages[-1]['content'])
        self.prompts.append(prompt)
        if self.raises is not None:
            raise self.raises
        reply = str(self.reply_for(prompt)) if callable(self.reply_for) else str(self.reply_for or '[]')
        return reply, {}


async def _loader(  # ruff: ignore[unused-async]
    db: Any, *, kb_name: str, sample_size: int, plugin_namespace: str | None
) -> list[tuple[str, str]]:
    return [(f'c{i}', f'内容 {i}') for i in range(sample_size)]


def _generate(model: _FakeModel, *, target: int = 10, sample: int = 5, concurrency: int = 4) -> list[dict]:
    return asyncio.run(
        generate_items(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            target_count=target,
            sample_size=sample,
            chat_model=model,
            chunk_loader=_loader,
            concurrency=concurrency,
        )
    )


# ------------------------------------------------------------------ 提示词
def test_prompt_lists_chunk_ids_and_asks_for_json_array() -> None:
    prompt = build_generation_prompt([('c1', '甲'), ('c2', '乙')])
    assert 'chunk_id=c1' in prompt and 'chunk_id=c2' in prompt
    assert '"chunk_id"' in prompt and '"question"' in prompt


def test_prompt_truncates_long_content() -> None:
    prompt = build_generation_prompt([('c1', 'x' * 5000)])
    assert len(prompt) < 5000


# ------------------------------------------------------------------ 解析与防污染
def test_parse_keeps_items_with_known_chunk_id() -> None:
    reply = '[{"chunk_id": "c1", "question": "问", "answer": "答"}]'
    assert parse_generated_items(reply, ['c1']) == [{'query_text': '问', 'gold_chunk_ids': ['c1'], 'gold_answer': '答'}]


def test_parse_drops_items_with_hallucinated_chunk_id() -> None:
    """编造的 chunk_id 必须丢弃：否则该题指标恒为 0 且病因不可辨。"""
    reply = '[{"chunk_id": "ghost", "question": "问", "answer": "答"}]'
    assert parse_generated_items(reply, ['c1']) == []


def test_parse_drops_items_without_question() -> None:
    reply = '[{"chunk_id": "c1", "answer": "答"}, {"chunk_id": "c1", "question": "  "}]'
    assert parse_generated_items(reply, ['c1']) == []


def test_parse_accepts_bare_answer_as_none() -> None:
    """只出问题不出答案也接受——该题只算检索指标，不算 Judge。"""
    items = parse_generated_items('[{"chunk_id": "c1", "question": "问"}]', ['c1'])
    assert items[0]['gold_answer'] is None


def test_parse_handles_markdown_fence_and_bad_json() -> None:
    fenced = '```json\n[{"chunk_id": "c1", "question": "问", "answer": "答"},]\n```'
    assert len(parse_generated_items(fenced, ['c1'])) == 1
    assert parse_generated_items('模型说它不想生成', ['c1']) == []


def test_parse_accepts_object_wrapper() -> None:
    reply = '{"items": [{"chunk_id": "c1", "question": "问", "answer": "答"}]}'
    assert len(parse_generated_items(reply, ['c1'])) == 1


# ------------------------------------------------------------------ 分批、并发与上限
def test_generates_in_batches_and_respects_target() -> None:
    """12 条分块按批喂；产出不超过 target。"""
    model = _FakeModel(lambda prompt: '[{"chunk_id": "c0", "question": "问", "answer": "答"}]')
    items = _generate(model, target=2, sample=12)
    assert len(items) <= 2
    assert len(model.prompts) >= 1


def test_batch_size_is_applied() -> None:
    model = _FakeModel('[]')
    _generate(model, target=50, sample=GENERATION_BATCH_SIZE * 3)
    assert len(model.prompts) == 3


def test_empty_sample_short_circuits_without_calling_model() -> None:
    model = _FakeModel('[]')
    assert _generate(model, target=5, sample=0) == []
    assert model.prompts == []


def test_one_batch_failure_does_not_kill_generation(monkeypatch: pytest.MonkeyPatch) -> None:
    """单批失败只丢这一批：生成是可选能力，不该因一批超时全废。"""
    calls = {'n': 0}

    class _Flaky(_FakeModel):
        async def achat(self, messages: list[dict[str, Any]], **_: Any) -> tuple[str, dict[str, Any]]:
            calls['n'] += 1
            if calls['n'] == 1:
                raise TimeoutError('first batch')
            return '[{"chunk_id": "c5", "question": "问", "answer": "答"}]', {}

    items = _generate(_Flaky(), target=10, sample=GENERATION_BATCH_SIZE * 2)
    assert len(items) == 1
