"""图谱抽取器基类与结果归一（RAG 清单 Phase 5 / D62：Yuxi ``extractors/base.py`` 迁移）。

职责分工（两步分开，因为信任边界不同）：

- ``normalize_extraction_result`` —— **信任边界**。输入是模型输出，什么都可能有：
  端点写成裸引用、属性不是数组、关系缺 text。这里做格式校验与归一，非法即抛。
- ``graph_utils.build_graph_payload`` —— 纯数据变换（按名称+标签去重、合并属性）。

抽取器本身是抽象的：具体实现只需把文本变成「未归一的结果」，模型如何调用不进这一层。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

from backend.src.app.graph.service.graph_utils import normalize_entity_name

if TYPE_CHECKING:
    from collections.abc import Callable

__all__ = ['GraphExtractor', 'normalize_extraction_result']


class GraphExtractor(ABC):
    """图谱抽取器协议。"""

    extractor_type: str

    def __init__(self, options: dict[str, Any] | None = None) -> None:
        self.options = options or {}

    @abstractmethod
    async def extract(self, text: str, *, chunk_metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        """从文本抽取实体与关系，返回**未归一**结果（调用方须过 normalize）。"""

    def validate_options(self) -> None:
        """校验构造选项；不合法抛 ValueError。默认可选。"""
        return


def normalize_extraction_result(result: Any, extractor_type: str) -> dict[str, Any]:
    """模型输出 → 标准化的 ``{entities, relations, metadata}``。

    比 Yuxi 原实现多一条：``relations`` 端点若给了**未在 entities 中出现的裸引用**，
    这里依然报错（保持原语义），但错误信息里带上可用的引用列表——原实现把整个 result
    打进消息，长文本下这条日志基本不可读。
    """
    if not isinstance(result, dict):
        raise TypeError('extraction_result 必须是对象')

    entities = result.get('entities') or []
    relations = result.get('relations') or []
    if not isinstance(entities, list) or not isinstance(relations, list):
        raise TypeError('extraction_result.entities 与 relations 必须是数组')

    entities_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    entity_refs: dict[str, dict[str, Any]] = {}

    def add_entity(raw: Any, path: str) -> dict[str, Any]:
        normalized = _normalize_entity(raw, path)
        key = (normalize_entity_name(normalized['text']), normalized['label'])
        existing = entities_by_key.get(key)
        if existing is None:
            entities_by_key[key] = normalized
            existing = normalized
        else:
            _merge_attributes(existing, normalized['attributes'])
        for ref in _entity_refs(raw, existing):
            entity_refs[ref] = existing
        return existing

    for index, entity in enumerate(entities):
        add_entity(entity, f'entities[{index}]')

    normalized_relations: list[dict[str, Any]] = []
    for index, relation in enumerate(relations):
        if not isinstance(relation, dict):
            raise TypeError(f'relations[{index}] 必须是对象')
        source = _normalize_endpoint(relation.get('source'), entity_refs, add_entity, index, 'source')
        target = _normalize_endpoint(relation.get('target'), entity_refs, add_entity, index, 'target')
        text = str(relation.get('text') or '').strip()
        if not text:
            raise ValueError(f'relations[{index}].text 不能为空')
        normalized_relations.append({
            'source': source,
            'target': target,
            'text': text,
            'label': str(relation.get('label') or 'RELATED_TO').strip() or 'RELATED_TO',
        })

    metadata = dict(result.get('metadata') or {})
    metadata.setdefault('extractor_type', extractor_type)
    metadata.setdefault('schema_version', 1)
    return {
        'entities': list(entities_by_key.values()),
        'relations': normalized_relations,
        'metadata': metadata,
    }


def _normalize_endpoint(
    endpoint: Any,
    entity_refs: dict[str, dict[str, Any]],
    add_entity: Callable[[Any, str], dict[str, Any]],
    index: int,
    side: str,
) -> dict[str, Any]:
    """端点可以是实体对象，也可以是对 ``entities[].text`` / ``entities[].id`` 的引用。"""
    if isinstance(endpoint, dict):
        return add_entity(endpoint, f'relations[{index}].{side}')
    ref = str(endpoint or '').strip()
    entity = entity_refs.get(ref)
    if entity is None:
        known = sorted(entity_refs)[:10]
        raise ValueError(f'relations[{index}].{side} 引用了未知实体 {ref!r}；可用引用示例: {known}')
    return entity


def _normalize_entity(entity: Any, path: str) -> dict[str, Any]:
    if not isinstance(entity, dict):
        raise TypeError(f'{path} 必须是对象')
    text = str(entity.get('text') or '').strip()
    if not text:
        raise ValueError(f'{path}.text 不能为空')
    attributes = entity.get('attributes') or []
    if not isinstance(attributes, list):
        raise TypeError(f'{path}.attributes 必须是数组')
    normalized_attributes: list[dict[str, str]] = []
    for attribute in attributes:
        if not isinstance(attribute, dict):
            raise TypeError(f'{path}.attributes 元素必须是对象')
        attr_text = str(attribute.get('text') or '').strip()
        if not attr_text:
            continue
        normalized_attributes.append({
            'text': attr_text,
            'label': str(attribute.get('label') or 'Attribute').strip() or 'Attribute',
        })
    return {
        'text': text,
        'label': str(entity.get('label') or 'Entity').strip() or 'Entity',
        'attributes': normalized_attributes,
    }


def _entity_refs(raw: Any, entity: dict[str, Any]) -> list[str]:
    """该实体可被关系端点引用的名字（文本 + 可选 id）。"""
    refs = [entity['text']]
    if isinstance(raw, dict):
        entity_id = str(raw.get('id') or '').strip()
        if entity_id:
            refs.append(entity_id)
    return refs


def _merge_attributes(target: dict[str, Any], attributes: list[dict[str, str]]) -> None:
    known = {(attr['text'], attr['label']) for attr in target.get('attributes') or []}
    for attribute in attributes:
        key = (attribute['text'], attribute['label'])
        if key in known:
            continue
        target.setdefault('attributes', []).append(attribute)
        known.add(key)
