"""KB 维度的 Milvus 操作（EagleRAG index/milvus_kb_ops.py 迁移）。

域内共享基础集合（ragf_text / ragf_visual），知识库之间通过 ``kb_name``
标量过滤隔离。所有查询/删除都必须携带 ``kb_name``，由本模块统一注入。
"""

from __future__ import annotations

import logging

from typing import cast

from pymilvus import CollectionSchema, DataType, FieldSchema, MilvusClient
from pymilvus.milvus_client.index import IndexParams

from backend.src.core.config import settings
from backend.src.database.milvus_pool import get_milvus_pool

__all__ = [
    'base_collection_names',
    'count_all_entities',
    'count_entities_by_kb',
    'delete_vectors_by_kb',
    'ensure_base_collections',
    'list_present_collections',
]

logger = logging.getLogger(__name__)


def base_collection_names() -> tuple[str, str]:
    """基础文本/视觉集合名。"""
    return settings.MILVUS_TEXT_COLLECTION, settings.MILVUS_VISUAL_COLLECTION


def _client(plugin_namespace: str | None = None) -> MilvusClient:
    return get_milvus_pool().get(plugin_namespace=plugin_namespace)


def _collection_schema(name: str, dim: int) -> CollectionSchema:
    fields = [
        FieldSchema(name='id', dtype=DataType.VARCHAR, is_primary=True, max_length=128),
        FieldSchema(name='vector', dtype=DataType.FLOAT_VECTOR, dim=dim),
    ]
    return CollectionSchema(
        fields=fields,
        description=f'{name}（kb_name 标量过滤）',
        enable_dynamic_field=True,
    )


def ensure_base_collections(plugin_namespace: str | None = None) -> None:
    """确保域内基础集合存在、向量/标量索引就绪并已加载。"""
    client = _client(plugin_namespace)
    text_coll, visual_coll = base_collection_names()
    for name, dim in (
        (text_coll, settings.MILVUS_TEXT_VECTOR_DIM),
        (visual_coll, settings.MILVUS_VISUAL_VECTOR_DIM),
    ):
        if not client.has_collection(name):
            client.create_collection(collection_name=name, schema=_collection_schema(name, dim))
        _ensure_vector_index(client, name)
        _ensure_kb_index(client, name)
        try:
            client.load_collection(name)
        except Exception as exc:
            logger.warning('加载集合失败 coll=%s: %s', name, exc)


def _ensure_vector_index(client: MilvusClient, collection: str) -> None:
    """确保 vector 字段有 AUTOINDEX（Milvus 加载集合的前置条件）。"""
    try:
        existing = {str(index.get('field_name')) for index in client.list_indexes(collection)}
        if 'vector' in existing:
            return
        params = IndexParams()
        params.add_index(field_name='vector', index_type='AUTOINDEX', metric_type='COSINE', index_name='idx_vector')
        client.create_index(collection_name=collection, index_params=params)
    except Exception as exc:
        logger.warning('创建向量索引失败 coll=%s: %s', collection, exc)


def _ensure_kb_index(client: MilvusClient, collection: str) -> None:
    """确保 kb_name 动态字段倒排索引存在（集合已存在但缺索引时补建）。"""
    try:
        existing = {str(index.get('field_name')) for index in client.list_indexes(collection)}
        if 'kb_name' in existing:
            return
        params = IndexParams()
        params.add_index(
            field_name='kb_name',
            index_type='INVERTED',
            index_name='idx_kb_name',
            json_cast_type='varchar',
        )
        client.create_index(collection_name=collection, index_params=params)
    except Exception as exc:
        logger.warning('创建 kb_name 倒排索引失败 coll=%s: %s', collection, exc)


def list_present_collections(*, plugin_namespace: str | None = None) -> list[str]:
    """列出实例域内全部集合。"""
    try:
        collections = cast('list[str]', _client(plugin_namespace).list_collections())
        return list(collections)
    except Exception as exc:
        logger.warning('list_collections 失败: %s', exc)
        return []


def _kb_expr(kb_name: str) -> str:
    return f'kb_name == "{kb_name}"'


def count_entities_by_kb(
    collection: str,
    kb_name: str,
    *,
    plugin_namespace: str | None = None,
) -> int:
    """统计集合中属于指定 KB 的实体数。"""
    client = _client(plugin_namespace)
    if not client.has_collection(collection):
        return 0
    try:
        rows = client.query(collection, filter=_kb_expr(kb_name), output_fields=['count(*)'])
        if rows:
            return int(rows[0].get('count(*)', 0))
    except Exception as exc:
        logger.warning('count 失败 coll=%s kb=%s: %s', collection, kb_name, exc)
    return 0


def count_all_entities(collection: str, *, plugin_namespace: str | None = None) -> int:
    """统计集合全部实体数。"""
    client = _client(plugin_namespace)
    if not client.has_collection(collection):
        return 0
    try:
        rows = client.query(collection, output_fields=['count(*)'])
        if rows:
            return int(rows[0].get('count(*)', 0))
    except Exception as exc:
        logger.warning('count_all 失败 coll=%s: %s', collection, exc)
    return 0


def delete_vectors_by_kb(
    collection: str,
    kb_name: str,
    *,
    plugin_namespace: str | None = None,
) -> int:
    """按 kb_name 删除集合中全部向量，返回删除数量。"""
    client = _client(plugin_namespace)
    if not client.has_collection(collection):
        return 0
    count = count_entities_by_kb(collection, kb_name, plugin_namespace=plugin_namespace)
    if count == 0:
        return 0
    try:
        client.delete(collection, filter=_kb_expr(kb_name))
    except Exception as exc:
        logger.warning('delete 失败 coll=%s kb=%s: %s', collection, kb_name, exc)
        return 0
    return count
