"""图谱纯函数测试（D62）：名称归一、ID 稳定性与去重合并。

ID 的稳定性是这里最要紧的性质：实体/三元组 ID 由内容决定，重建图时要能对上号，
否则「同一实体」每次建图都会变成新行，图谱会持续膨胀而无法收敛。
"""

from __future__ import annotations

import pytest

from backend.src.app.graph.service.graph_utils import (
    build_graph_payload,
    compute_entity_id,
    compute_triple_id,
    normalize_entity_name,
)


# ------------------------------------------------------------------ 名称归一
@pytest.mark.parametrize(
    ('raw', 'expected'),
    [
        ('  Transformer  ', 'transformer'),
        ('Multi   Head\tAttention', 'multi head attention'),
        ('', ''),
        ('  ', ''),
    ],
)
def test_normalize_entity_name(raw: str, expected: str) -> None:
    assert normalize_entity_name(raw) == expected


def test_normalize_merges_case_and_whitespace_variants() -> None:
    """大小写与空白差异不应产生两个实体。"""
    variants = ['Transformer', 'transformer', ' TRANSFORMER ', 'trans\nformer']
    assert {normalize_entity_name(v) for v in variants[:3]} == {'transformer'}
    assert normalize_entity_name(variants[3]) == 'trans former'  # 换行变空格，不粘连


# ------------------------------------------------------------------ ID 稳定性
def test_entity_id_is_deterministic() -> None:
    first = compute_entity_id('core', 'dev', 'transformer', '模型')
    assert first == compute_entity_id('core', 'dev', 'transformer', '模型')
    assert len(first) == 32


def test_entity_id_separates_namespace_and_kb() -> None:
    """命名空间与 KB 都进哈希：否则跨域/跨库同名实体会撞成同一行。"""
    base = compute_entity_id('core', 'dev', 'transformer', '模型')
    assert compute_entity_id('other', 'dev', 'transformer', '模型') != base
    assert compute_entity_id('core', 'ops', 'transformer', '模型') != base


def test_entity_id_separates_label() -> None:
    """同名不同标签是两个实体（人/组织），不能合并。"""
    assert compute_entity_id('core', 'dev', 'apple', '公司') != compute_entity_id('core', 'dev', 'apple', '水果')


def test_triple_id_depends_on_direction_and_type() -> None:
    a = compute_entity_id('core', 'dev', 'a', 'E')
    b = compute_entity_id('core', 'dev', 'b', 'E')
    forward = compute_triple_id('core', 'dev', a, 'RELATED_TO', b)
    assert forward == compute_triple_id('core', 'dev', a, 'RELATED_TO', b)
    assert compute_triple_id('core', 'dev', b, 'RELATED_TO', a) != forward  # 方向敏感
    assert compute_triple_id('core', 'dev', a, 'PART_OF', b) != forward  # 类型敏感


# ------------------------------------------------------------------ 去重合并
def _result(entities: list[dict], relations: list[dict] | None = None) -> dict:
    return {'entities': entities, 'relations': relations or [], 'metadata': {'extractor_type': 'llm'}}


def test_payload_dedupes_same_name_and_label() -> None:
    """同名同标签合并成一条，属性取并集。"""
    payload = build_graph_payload(
        _result([
            {'text': 'Transformer', 'label': '模型', 'attributes': [{'text': '2017', 'label': 'Year'}]},
            {'text': 'transformer', 'label': '模型', 'attributes': [{'text': 'Google', 'label': 'Org'}]},
        ])
    )
    assert len(payload['entities']) == 1
    assert {attr['text'] for attr in payload['entities'][0]['attributes']} == {'2017', 'Google'}


def test_payload_keeps_same_name_different_label_separate() -> None:
    payload = build_graph_payload(
        _result([
            {'text': 'Apple', 'label': '公司'},
            {'text': 'apple', 'label': '水果'},
        ])
    )
    assert len(payload['entities']) == 2


def test_payload_attributes_dedupe_preserves_order() -> None:
    payload = build_graph_payload(
        _result([
            {'text': 'X', 'label': 'E', 'attributes': [{'text': 'a', 'label': 'A'}, {'text': 'b', 'label': 'B'}]},
            {'text': 'X', 'label': 'E', 'attributes': [{'text': 'a', 'label': 'A'}, {'text': 'c', 'label': 'C'}]},
        ])
    )
    assert [attr['text'] for attr in payload['entities'][0]['attributes']] == ['a', 'b', 'c']


def test_payload_relations_reference_local_ids() -> None:
    payload = build_graph_payload(
        _result(
            [{'text': 'A', 'label': 'E'}],
            [{'source': {'text': 'A', 'label': 'E'}, 'target': {'text': 'B', 'label': 'E'}, 'text': 'A 与 B 相关'}],
        )
    )
    assert {entity['id'] for entity in payload['entities']} == {'e1', 'e2'}
    assert payload['relations'][0]['source_id'] == 'e1'
    assert payload['relations'][0]['target_id'] == 'e2'


def test_payload_relation_endpoint_must_be_object() -> None:
    """裸引用（字符串端点）必须显式拒绝：否则字符串会被当实体写进图。"""
    with pytest.raises(TypeError, match='实体对象'):
        build_graph_payload(_result([], [{'source': 'e1', 'target': {'text': 'B', 'label': 'E'}, 'text': 't'}]))


def test_payload_carries_metadata() -> None:
    payload = build_graph_payload(_result([]))
    assert payload['metadata']['extractor_type'] == 'llm'
