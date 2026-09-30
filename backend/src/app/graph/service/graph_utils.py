"""图谱纯函数（RAG 清单 Phase 5 / D62：Yuxi ``knowledge/graphs/graph_utils.py`` 迁移）。

**只取 Milvus 侧**：Yuxi 的原文件里同时有 Neo4j 的 Cypher 模板（``cypher_merge_chunk``
等），本项目 D62 已定「不引 Neo4j」，那部分不取。

ID 用 sha256 截断而非自然键（对比 ``chunk_id`` 的 ``{document_id}:{version_id}:{idx}``）：
实体的自然键含用户文本（名称、标签），既可能超出列长也会把中文写进主键；哈希后定长且
稳定。**命名空间进哈希**——否则两个部署域里同名实体撞成同一个 ID。
"""

from __future__ import annotations

import hashlib

from typing import Any

__all__ = [
    'build_graph_payload',
    'compute_entity_id',
    'compute_triple_id',
    'normalize_entity_name',
]


def _digest(payload: str, length: int = 32) -> str:
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()[:length]


def normalize_entity_name(text: str) -> str:
    """统一实体名称：去首尾空白、小写化、压缩内部连续空白。

    大小写与空白归一让「Transformer」「transformer 」「 transformer」落成同一实体；
    不做词形还原/同义词合并——那需要语言相关规则，属于精排或人工消歧的范畴。
    """
    return ' '.join(str(text or '').strip().lower().split())


def compute_entity_id(plugin_namespace: str, kb_name: str, normalized_name: str, label: str) -> str:
    """实体 ID = hash(域 + KB + 归一名称 + 标签)。"""
    return _digest(f'{plugin_namespace}:{kb_name}:{normalized_name}:{label}')


def compute_triple_id(
    plugin_namespace: str,
    kb_name: str,
    source_entity_id: str,
    relation_type: str,
    target_entity_id: str,
) -> str:
    """三元组 ID = hash(域 + KB + 源实体 + 关系类型 + 目标实体)。

    用**实体 ID** 而非名称参与哈希：名称归一只保证同形，实体 ID 已经过标签去重，
    同一个名称配不同标签是两个实体，三元组也应随之区分。
    """
    return _digest(f'{plugin_namespace}:{kb_name}:{source_entity_id}:{relation_type}:{target_entity_id}')


def build_graph_payload(normalized_result: dict[str, Any]) -> dict[str, Any]:
    """抽取器产出的标准化结果 → 去重合并后的图载荷。

    与 ``extractors.base.normalize_extraction_result`` 的分工：那里做**格式校验与
    归一**（输入可能来自任意模型），这里做**按 (归一名称, 标签) 去重并合并属性**，
    并把关系端点解析成载荷内的局部引用（``e1``/``e2``…）。两步分开是因为前者是
    信任边界（模型输出不可信），后者是纯数据变换。

    返回 ``{'entities': [...], 'relations': [...], 'metadata': {...}}``，其中
    ``relations[].source/target`` 是 ``entities[].id`` 的值。
    """
    entities: list[dict[str, Any]] = []
    entity_ref_by_key: dict[tuple[str, str], dict[str, Any]] = {}

    def add_entity(entity: dict[str, Any]) -> str:
        name = str(entity.get('text') or '').strip()
        label = str(entity.get('label') or 'Entity').strip() or 'Entity'
        key = (normalize_entity_name(name), label)
        existing = entity_ref_by_key.get(key)
        if existing is not None:
            _merge_attributes(existing, entity.get('attributes') or [])
            return str(existing['id'])
        graph_entity = {
            'id': f'e{len(entities) + 1}',
            'text': name,
            'label': label,
            'attributes': list(entity.get('attributes') or []),
        }
        entities.append(graph_entity)
        entity_ref_by_key[key] = graph_entity
        return graph_entity['id']

    for entity in normalized_result.get('entities') or []:
        add_entity(entity)

    relations: list[dict[str, Any]] = []
    for relation in normalized_result.get('relations') or []:
        source = relation.get('source')
        target = relation.get('target')
        if not isinstance(source, dict) or not isinstance(target, dict):
            # 端点已由 normalize_extraction_result 解析成实体对象；此处拒绝裸引用，
            # 避免下游把字符串当实体写进图
            raise TypeError('relations[].source/target 必须是实体对象（请先经 normalize_extraction_result）')
        relations.append({
            'source_id': add_entity(source),
            'target_id': add_entity(target),
            'text': str(relation.get('text') or ''),
            'label': str(relation.get('label') or 'RELATED_TO').strip() or 'RELATED_TO',
        })

    return {
        'entities': entities,
        'relations': relations,
        'metadata': dict(normalized_result.get('metadata') or {}),
    }


def _merge_attributes(target: dict[str, Any], attributes: list[Any]) -> None:
    """属性取并集（按 (text, label) 去重），保持首次出现顺序。"""
    known = {(str(attr.get('text')), str(attr.get('label'))) for attr in target.get('attributes') or []}
    for attribute in attributes:
        if not isinstance(attribute, dict):
            continue
        key = (str(attribute.get('text') or ''), str(attribute.get('label') or 'Attribute'))
        if not key[0] or key in known:
            continue
        target.setdefault('attributes', []).append({'text': key[0], 'label': key[1]})
        known.add(key)
