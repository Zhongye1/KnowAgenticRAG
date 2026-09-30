"""抽取器与结果归一测试（D62）：信任边界校验、端点引用解析、脏 JSON 容错。

归一逻辑是**信任边界**——输入是模型输出。所以负向用例比正向更重要：端点写成裸引用、
缺 text、attributes 不是数组，这些在真实模型上都会出现，且一旦漏过就会被写进图谱
（脏数据比报错难查得多）。
"""

from __future__ import annotations

import asyncio

from typing import Any

import pytest

from backend.src.app.graph.service.extractors.base import normalize_extraction_result
from backend.src.app.graph.service.extractors.llm import LLMGraphExtractor


class _FakeModel:
    def __init__(self, reply: str = '{}', *, raises: Exception | None = None) -> None:
        self.reply = reply
        self.raises = raises
        self.prompts: list[str] = []

    async def achat(self, messages: list[dict[str, Any]], **_: Any) -> tuple[str, dict[str, Any]]:
        self.prompts.append(str(messages[-1]['content']))
        if self.raises is not None:
            raise self.raises
        return self.reply, {}


# ------------------------------------------------------------------ 归一：正向
def test_normalize_accepts_wellformed_result() -> None:
    normalized = normalize_extraction_result(
        {
            'entities': [{'text': 'Transformer', 'label': '模型'}],
            'relations': [
                {
                    'source': {'text': 'Transformer', 'label': '模型'},
                    'target': {'text': 'Attention', 'label': '机制'},
                    'text': 'Transformer 使用 Attention',
                    'label': 'USES',
                }
            ],
        },
        'llm',
    )
    assert len(normalized['entities']) == 2
    assert normalized['relations'][0]['label'] == 'USES'
    assert normalized['metadata']['extractor_type'] == 'llm'
    assert normalized['metadata']['schema_version'] == 1


def test_normalize_resolves_relation_endpoint_by_reference() -> None:
    """端点可以是对 entities[].text 的引用——模型常这么省 token。"""
    normalized = normalize_extraction_result(
        {
            'entities': [{'text': 'A', 'label': 'E'}, {'text': 'B', 'label': 'E'}],
            'relations': [{'source': 'A', 'target': 'B', 'text': 'A 到 B'}],
        },
        'llm',
    )
    assert len(normalized['entities']) == 2
    assert normalized['relations'][0]['source']['text'] == 'A'


def test_normalize_resolves_relation_endpoint_by_id() -> None:
    normalized = normalize_extraction_result(
        {
            'entities': [{'id': 'n1', 'text': 'A', 'label': 'E'}],
            'relations': [{'source': 'n1', 'target': {'text': 'B', 'label': 'E'}, 'text': 't'}],
        },
        'llm',
    )
    assert normalized['relations'][0]['source']['text'] == 'A'


def test_normalize_merges_duplicate_entities_by_normalized_name() -> None:
    normalized = normalize_extraction_result(
        {
            'entities': [
                {'text': 'Transformer', 'label': 'E', 'attributes': [{'text': 'a', 'label': 'A'}]},
                {'text': 'transformer', 'label': 'E', 'attributes': [{'text': 'b', 'label': 'B'}]},
            ],
            'relations': [],
        },
        'llm',
    )
    assert len(normalized['entities']) == 1
    assert {attr['text'] for attr in normalized['entities'][0]['attributes']} == {'a', 'b'}


def test_normalize_drops_blank_attributes() -> None:
    normalized = normalize_extraction_result(
        {'entities': [{'text': 'X', 'label': 'E', 'attributes': [{'text': '  ', 'label': 'A'}]}]},
        'llm',
    )
    assert normalized['entities'][0]['attributes'] == []


def test_normalize_defaults_label_and_relation_type() -> None:
    normalized = normalize_extraction_result(
        {
            'entities': [{'text': 'A'}, {'text': 'B'}],
            'relations': [{'source': 'A', 'target': 'B', 'text': 't'}],
        },
        'llm',
    )
    assert normalized['entities'][0]['label'] == 'Entity'
    assert normalized['relations'][0]['label'] == 'RELATED_TO'


# ------------------------------------------------------------------ 归一：负向（信任边界）
def test_normalize_rejects_non_object_result() -> None:
    with pytest.raises(TypeError, match='必须是对象'):
        normalize_extraction_result(['not', 'an', 'object'], 'llm')


def test_normalize_rejects_non_list_collections() -> None:
    with pytest.raises(TypeError, match='必须是数组'):
        normalize_extraction_result({'entities': {'a': 1}}, 'llm')


def test_normalize_rejects_entity_without_text() -> None:
    with pytest.raises(ValueError, match='text 不能为空'):
        normalize_extraction_result({'entities': [{'label': 'E'}]}, 'llm')


def test_normalize_rejects_unknown_relation_reference() -> None:
    """引用不存在的实体必须报错：静默丢关系会让图谱悄悄缺边。"""
    with pytest.raises(ValueError, match='未知实体'):
        normalize_extraction_result(
            {'entities': [{'text': 'A', 'label': 'E'}], 'relations': [{'source': 'ghost', 'target': 'A', 'text': 't'}]},
            'llm',
        )


def test_normalize_rejects_relation_without_text() -> None:
    with pytest.raises(ValueError, match='text 不能为空'):
        normalize_extraction_result(
            {
                'entities': [{'text': 'A', 'label': 'E'}, {'text': 'B', 'label': 'E'}],
                'relations': [{'source': 'A', 'target': 'B'}],
            },
            'llm',
        )


def test_normalize_rejects_non_object_attributes() -> None:
    with pytest.raises(TypeError, match='attributes'):
        normalize_extraction_result({'entities': [{'text': 'X', 'attributes': 'nope'}]}, 'llm')


# ------------------------------------------------------------------ 抽取器
def test_extractor_requires_chat_model() -> None:
    with pytest.raises(ValueError, match='chat_model'):
        LLMGraphExtractor(None)  # type: ignore[arg-type]


def test_extractor_rejects_custom_prompt() -> None:
    """自定义完整 prompt 会连带换掉 JSON 契约，而下游是按固定形状校验的。"""
    extractor = LLMGraphExtractor(_FakeModel(), {'prompt': '自定义'})
    with pytest.raises(ValueError, match='不支持自定义完整 Prompt'):
        extractor.validate_options()


def test_extractor_appends_schema_constraint() -> None:
    prompt = LLMGraphExtractor.build_prompt('文本', schema='只抽人物与组织')
    assert '只抽人物与组织' in prompt
    assert '文本' in prompt


def test_extractor_parses_fenced_json() -> None:
    model = _FakeModel('```json\n{"entities": [{"text": "A", "label": "E"}]}\n```')
    parsed = asyncio.run(LLMGraphExtractor(model).extract('文本'))
    assert parsed['entities'][0]['text'] == 'A'


def test_extractor_rejects_non_object_reply() -> None:
    model = _FakeModel('[1, 2, 3]')
    with pytest.raises(TypeError, match='不是 JSON 对象'):
        asyncio.run(LLMGraphExtractor(model).extract('文本'))


def test_extractor_propagates_model_error() -> None:
    """模型异常按块上抛，由调用方决定隔离（这里是"逐块失败不炸整篇"的接缝）。"""
    with pytest.raises(RuntimeError, match='模型不可用'):
        asyncio.run(LLMGraphExtractor(_FakeModel(raises=RuntimeError('模型不可用'))).extract('文本'))
