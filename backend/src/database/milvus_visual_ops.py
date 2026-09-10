"""ragf_visual 视觉向量集合操作（双管线摄取 spec D7，EagleRAG eagle_visual 迁移）。

直连 ``pymilvus.MilvusClient`` 管理（不经 LlamaIndex：2048 维 Qwen3-VL 向量非
LlamaIndex 标准 embed_model 产物）。集合 schema 携带 ACL 镜像字段
（namespace 分区键 / visibility / owner_id / groups）—— 检索过滤与文本集合同规
（agent-layer spec §3.2：DB 为事实源、Milvus 为镜像）。

集合描述携带编码器指纹（provider:model:dim）：指纹不一致且集合非空时拒绝自动
重建，防止两个向量空间混用（spec D7）。
"""

from __future__ import annotations

import logging

from typing import Any, cast

from pymilvus import CollectionSchema, DataType, FieldSchema, MilvusClient
from pymilvus.milvus_client.index import IndexParams

from backend.src.core.config import settings
from backend.src.database.milvus_kb_ops import _and_expr, _existing_index_names
from backend.src.database.milvus_pool import get_milvus_pool

__all__ = [
    'count_visual_by_document',
    'delete_visual_by_document',
    'delete_visual_by_kb',
    'ensure_visual_collection',
    'insert_visual_rows',
    'search_visual',
    'update_visual_document_acl',
]

logger = logging.getLogger(__name__)

_VECTOR_INDEX_NAME = 'idx_visual_vector'


def _client(plugin_namespace: str | None = None) -> MilvusClient:
    return get_milvus_pool().get(plugin_namespace=plugin_namespace)


def visual_collection_name() -> str:
    """视觉集合名（settings.MILVUS_VISUAL_COLLECTION，默认 ragf_visual）。"""
    return settings.MILVUS_VISUAL_COLLECTION


def _schema(name: str, dim: int) -> CollectionSchema:
    fields = [
        FieldSchema(name='id', dtype=DataType.VARCHAR, is_primary=True, max_length=128),
        FieldSchema(name='vector', dtype=DataType.FLOAT_VECTOR, dim=dim),
        FieldSchema(name='image_path', dtype=DataType.VARCHAR, max_length=512),
        FieldSchema(name='kb_name', dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name='document_id', dtype=DataType.VARCHAR, max_length=255),
        FieldSchema(name='page', dtype=DataType.INT64),
        FieldSchema(name='position', dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name='chunk_type', dtype=DataType.VARCHAR, max_length=32),  # tile/image/table
        FieldSchema(name='parent_section', dtype=DataType.VARCHAR, max_length=512),
        FieldSchema(name='content_summary', dtype=DataType.VARCHAR, max_length=2048),
        FieldSchema(name='source_chunk_id', dtype=DataType.VARCHAR, max_length=255),
        # ACL 镜像字段（agent-layer spec §3.2；namespace 为分区键做租户剪枝）
        FieldSchema(name='namespace', dtype=DataType.VARCHAR, max_length=64, is_partition_key=True),
        FieldSchema(name='visibility', dtype=DataType.VARCHAR, max_length=16),
        FieldSchema(name='owner_id', dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name='groups', dtype=DataType.ARRAY, element_type=DataType.VARCHAR, max_length=64, max_capacity=32),
    ]
    return CollectionSchema(
        fields=fields,
        description=f'{name}|fingerprint:{_fingerprint()}',
        enable_dynamic_field=True,
    )


def _fingerprint() -> str:
    from backend.src.app.ingest.engine.visual_encoder import encoder_fingerprint

    return encoder_fingerprint()


def _schema_ready(client: MilvusClient, collection: str, *, dim: int) -> bool:
    """schema 指纹校验：dim + 编码器指纹 + 关键标量字段存在。"""
    try:
        described = client.describe_collection(collection)
    except Exception as exc:
        logger.warning('describe_collection 失败 coll=%s: %s', collection, exc)
        return False
    blob = described if isinstance(described, dict) else getattr(described, 'dict', None)
    if blob is None:
        return False
    desc = cast('dict', blob() if callable(blob) else blob)
    fields = {str(f.get('name')): f for f in desc.get('fields', []) if isinstance(f, dict)}
    for required in ('id', 'vector', 'kb_name', 'document_id', 'namespace', 'visibility', 'groups'):
        if required not in fields:
            return False
    params = fields.get('vector', {}).get('params') or {}
    if int(params.get('dim') or 0) != int(dim):
        return False
    # 编码器指纹守卫（spec D7）：provider/model/dim 变更 → 集合需重建，防向量空间混用
    return f'fingerprint:{_fingerprint()}' in str(desc.get('description') or '')


def _row_count(client: MilvusClient, collection: str) -> int | None:
    """集合实体数（无法判定时返回 None，禁止猜测为空）。"""
    try:
        rows = client.query(collection, filter='', output_fields=['count(*)'])
        return int(rows[0].get('count(*)', 0)) if rows else 0
    except Exception as exc:
        logger.warning('统计视觉集合行数失败 coll=%s: %s', collection, exc)
        return None


def ensure_visual_collection(*, plugin_namespace: str | None = None) -> str:
    """确保视觉集合存在、索引就绪并已加载；指纹不一致且非空时拒绝重建。"""
    dim = int(settings.MILVUS_VISUAL_VECTOR_DIM)
    name = visual_collection_name()
    client = _client(plugin_namespace)
    if not client.has_collection(name):
        logger.info('创建视觉集合 %s dim=%s fingerprint=%s', name, dim, _fingerprint())
        client.create_collection(collection_name=name, schema=_schema(name, dim))
        _ensure_indexes(client, name)
    elif not _schema_ready(client, name, dim=dim):
        count = _row_count(client, name)
        if count:
            raise RuntimeError(
                f'视觉集合 {name} schema 与当前代码不匹配且非空（{count} 行）；'
                '为避免静默丢数据拒绝重建，请人工确认后 drop_collection'
            )
        logger.warning('视觉集合 %s 为空且 schema 不匹配，按新 schema 重建', name)
        client.drop_collection(name)
        client.create_collection(collection_name=name, schema=_schema(name, dim))
        _ensure_indexes(client, name)
    else:
        _ensure_indexes(client, name)
    try:
        client.load_collection(name)
    except Exception as exc:
        logger.warning('加载视觉集合失败 coll=%s: %s', name, exc)
    return name


def _ensure_indexes(client: MilvusClient, collection: str) -> None:
    """向量 AUTOINDEX + kb/document 标量倒排索引（幂等补建）。"""
    existing = _existing_index_names(client, collection)
    if _VECTOR_INDEX_NAME not in existing:
        params = IndexParams()
        params.add_index(
            field_name='vector',
            index_type=settings.RAGF_DENSE_INDEX_TYPE,
            metric_type='COSINE',
            index_name=_VECTOR_INDEX_NAME,
            params={'nlist': settings.RAGF_DENSE_NLIST},
        )
        client.create_index(collection_name=collection, index_params=params)
    for field in ('kb_name', 'document_id'):
        index_name = f'idx_visual_{field}'
        if index_name not in existing:
            params = IndexParams()
            params.add_index(field_name=field, index_type='INVERTED', index_name=index_name, json_cast_type='varchar')
            client.create_index(collection_name=collection, index_params=params)
    for field in ('visibility', 'owner_id', 'groups'):
        index_name = f'idx_visual_{field}'
        if index_name not in existing:
            params = IndexParams()
            params.add_index(field_name=field, index_type='INVERTED', index_name=index_name)
            client.create_index(collection_name=collection, index_params=params)


def insert_visual_rows(
    *,
    kb_name: str,
    document_id: str,
    rows: list[dict[str, Any]],
    plugin_namespace: str | None = None,
) -> int:
    """幂等写入视觉向量（先删该文档旧行再插入）。"""
    collection = ensure_visual_collection(plugin_namespace=plugin_namespace)
    delete_visual_by_document(kb_name, document_id, plugin_namespace=plugin_namespace)
    if not rows:
        return 0
    _client(plugin_namespace).insert(collection_name=collection, data=rows)
    logger.info('插入视觉向量 coll=%s kb=%s doc=%s rows=%s', collection, kb_name, document_id, len(rows))
    return len(rows)


def delete_visual_by_document(kb_name: str, document_id: str, *, plugin_namespace: str | None = None) -> int:
    """按 kb + 文档删除视觉向量，返回删除数量。"""
    return _delete_by_expr(
        f'kb_name == "{kb_name}" and document_id == "{document_id}"',
        plugin_namespace=plugin_namespace,
    )


def delete_visual_by_kb(kb_name: str, *, plugin_namespace: str | None = None) -> int:
    """按 kb 删除全部视觉向量。"""
    return _delete_by_expr(f'kb_name == "{kb_name}"', plugin_namespace=plugin_namespace)


def _delete_by_expr(expr: str, *, plugin_namespace: str | None) -> int:
    collection = visual_collection_name()
    client = _client(plugin_namespace)
    if not client.has_collection(collection):
        return 0
    try:
        rows = client.query(collection, filter=expr, output_fields=['count(*)'])
        count = int(rows[0].get('count(*)', 0)) if rows else 0
    except Exception as exc:
        logger.warning('视觉向量删除失败 expr=%s: %s', expr, exc)
        return 0
    if count:
        client.delete(collection, filter=expr)
    return count


def count_visual_by_document(kb_name: str, document_id: str, *, plugin_namespace: str | None = None) -> int:
    """按文档统计视觉向量数（对账用）。"""
    collection = visual_collection_name()
    client = _client(plugin_namespace)
    if not client.has_collection(collection):
        return 0
    try:
        expr = f'kb_name == "{kb_name}" and document_id == "{document_id}"'
        rows = client.query(collection, filter=expr, output_fields=['count(*)'])
        return int(rows[0].get('count(*)', 0)) if rows else 0
    except Exception as exc:
        logger.warning('视觉向量计数失败 doc=%s: %s', document_id, exc)
        return 0


_VISUAL_OUTPUT_FIELDS = [
    'id',
    'image_path',
    'kb_name',
    'document_id',
    'page',
    'position',
    'chunk_type',
    'parent_section',
    'content_summary',
    'source_chunk_id',
]


def search_visual(
    *,
    kb_name: str,
    query_vector: list[float],
    recall_top_k: int = 20,
    expr: str | None = None,
    plugin_namespace: str | None = None,
) -> list[dict[str, Any]]:
    """视觉检索（纯向量 + 标量过滤；ACL 过滤表达式由调用方按 agent-layer spec 注入）。"""
    collection = ensure_visual_collection(plugin_namespace=plugin_namespace)
    filter_expr = _and_expr(f'kb_name == "{kb_name}"', expr)
    limit = max(int(recall_top_k), 1)
    client = _client(plugin_namespace)
    results = client.search(
        collection_name=collection,
        data=[query_vector],
        anns_field='vector',
        filter=filter_expr or '',
        limit=limit,
        output_fields=_VISUAL_OUTPUT_FIELDS,
        search_params={'metric_type': 'COSINE'},
    )
    rows = results[0] if results else []
    hits: list[dict[str, Any]] = []
    for hit in rows:
        entity = hit.get('entity') or {}
        hits.append({
            'id': str(entity.get('id') or hit.get('id') or ''),
            'image_path': str(entity.get('image_path') or ''),
            'document_id': str(entity.get('document_id') or ''),
            'page': int(entity.get('page') or 0),
            'position': str(entity.get('position') or ''),
            'chunk_type': str(entity.get('chunk_type') or 'tile'),
            'parent_section': str(entity.get('parent_section') or ''),
            'content_summary': str(entity.get('content_summary') or ''),
            'score': float(hit.get('distance') or 0.0),
        })
    logger.info('视觉检索 coll=%s kb=%s hits=%s', collection, kb_name, len(hits))
    return hits


def update_visual_document_acl(
    kb_name: str,
    document_id: str,
    *,
    visibility: str | None = None,
    owner_id: str | None = None,
    groups: list[str] | None = None,
    plugin_namespace: str | None = None,
) -> int:
    """按主键 upsert 文档 ACL 标量字段（agent-layer spec §8.2 变更传播，视觉集合）。

    vector/image_path 从现值原样回读；None 语义 = 该字段保持不变。返回更新行数。
    """
    collection = visual_collection_name()
    client = _client(plugin_namespace)
    if not client.has_collection(collection):
        return 0
    expr = f'kb_name == "{kb_name}" and document_id == "{document_id}"'
    try:
        rows = client.query(collection, filter=expr, output_fields=[*_VISUAL_OUTPUT_FIELDS, 'vector', 'namespace'])
    except Exception as exc:
        logger.warning('视觉集合 ACL 传播查询失败 coll=%s doc=%s: %s', collection, document_id, exc)
        return 0
    if not rows:
        return 0
    new_rows = [
        {
            'id': str(row.get('id') or ''),
            'vector': row.get('vector'),
            'image_path': str(row.get('image_path') or ''),
            'kb_name': kb_name,
            'document_id': document_id,
            'page': int(row.get('page') or 0),
            'position': str(row.get('position') or ''),
            'chunk_type': str(row.get('chunk_type') or 'tile'),
            'parent_section': str(row.get('parent_section') or ''),
            'content_summary': str(row.get('content_summary') or ''),
            'source_chunk_id': str(row.get('source_chunk_id') or ''),
            'namespace': str(row.get('namespace') or plugin_namespace or ''),
            'visibility': visibility if visibility is not None else str(row.get('visibility') or 'restricted'),
            'owner_id': owner_id if owner_id is not None else str(row.get('owner_id') or ''),
            'groups': groups if groups is not None else list(row.get('groups') or []),
        }
        for row in rows
    ]
    try:
        client.upsert(collection_name=collection, data=new_rows)
    except Exception as exc:
        logger.warning('视觉集合 ACL 传播 upsert 失败 coll=%s doc=%s: %s', collection, document_id, exc)
        return 0
    logger.info('视觉集合 ACL 传播完成 coll=%s kb=%s doc=%s rows=%s', collection, kb_name, document_id, len(new_rows))
    return len(new_rows)
