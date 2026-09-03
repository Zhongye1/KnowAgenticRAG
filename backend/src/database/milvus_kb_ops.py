"""KB 维度的 Milvus 操作（EagleRAG index/milvus_kb_ops.py 迁移）。

域内共享基础集合（ragf_text / ragf_visual），知识库之间通过 ``kb_name``
标量过滤隔离。所有查询/删除都必须携带 ``kb_name``，由本模块统一注入。

**动态字段约定（Phase 1 预埋，摄取层写入）**：集合开启 ``enable_dynamic_field``，
摄取写入向量时必须携带 ``document_id`` 与 ``document_version_id``（版本化占位，
Phase 2 前恒为 1），否则按文档删除向量 / 版本切换将无法工作。
"""

from __future__ import annotations

import logging

from typing import cast

from pymilvus import CollectionSchema, DataType, FieldSchema, Function, FunctionType, MilvusClient
from pymilvus.milvus_client.index import IndexParams

from backend.src.core.config import settings
from backend.src.database.milvus_pool import get_milvus_pool

__all__ = [
    'base_collection_names',
    'count_all_entities',
    'count_entities_by_kb',
    'delete_vectors_by_document',
    'delete_vectors_by_kb',
    'ensure_base_collections',
    'ensure_ragf_template_collection',
    'list_present_collections',
    'ragf_template_collection_name',
    'ragf_template_collection_ready',
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
        description=f'{name}（kb_name 标量过滤；摄取须写 document_id/document_version_id）',
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
        if 'idx_vector' in _existing_index_names(client, collection):
            return
        params = IndexParams()
        params.add_index(field_name='vector', index_type='AUTOINDEX', metric_type='COSINE', index_name='idx_vector')
        client.create_index(collection_name=collection, index_params=params)
    except Exception as exc:
        logger.warning('创建向量索引失败 coll=%s: %s', collection, exc)


def _ensure_kb_index(client: MilvusClient, collection: str) -> None:
    """确保 kb_name 动态字段倒排索引存在（集合已存在但缺索引时补建）。"""
    try:
        if 'idx_kb_name' in _existing_index_names(client, collection):
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


def _existing_index_names(client: MilvusClient, collection: str) -> set[str]:
    """返回集合现有索引名集合（兼容 pymilvus 返回字符串列表或 dict 列表两种形态）。"""
    indexes = client.list_indexes(collection)
    return {
        str(index.get('index_name') or index.get('field_name')) if isinstance(index, dict) else str(index)
        for index in indexes
    }


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


def delete_vectors_by_document(
    collection: str,
    kb_name: str,
    document_id: str,
    *,
    plugin_namespace: str | None = None,
) -> int:
    """按 kb_name + document_id 删除文档的向量（动态字段，摄取层需写入 document_id）。"""
    client = _client(plugin_namespace)
    if not client.has_collection(collection):
        return 0
    expr = f'kb_name == "{kb_name}" and document_id == "{document_id}"'
    try:
        rows = client.query(collection, filter=expr, output_fields=['count(*)'])
        count = int(rows[0].get('count(*)', 0)) if rows else 0
        if count:
            client.delete(collection, filter=expr)
    except Exception as exc:
        logger.warning('按文档删除失败 coll=%s doc=%s: %s', collection, document_id, exc)
        return 0
    return count


# ---------------------------------------------------------------------------
# RAGF 文本模板集合（ragf-design D2-1/D7/D17）
# 模板名 ragf_text_{dim}（默认 ragf_text_1024）：共享集合 + kb_name 标量过滤；
# content 开 Milvus 内建中文 analyzer（jieba），BM25 Function 服务端生成
# content_sparse，插入侧不手工算稀疏向量。
# ---------------------------------------------------------------------------

_RAGF_SPARSE_INDEX_PARAMS = {'inverted_index_algo': 'DAAT_MAXSCORE'}
_RAGF_DENSE_INDEX_NAME = 'idx_embedding'
_RAGF_SPARSE_INDEX_NAME = 'idx_content_sparse'


def ragf_template_collection_name(dim: int) -> str:
    """RAGF 文本模板集合名：{prefix}_{dim}（默认 ragf_text_1024）。"""
    return f'{settings.RAGF_TEXT_COLLECTION_PREFIX}_{int(dim)}'


def _ragf_text_schema(name: str, dim: int) -> CollectionSchema:
    """RAGF 模板集合 schema：chunk_id 主键 + dense/sparse 双字段 + 显式两轴标量。"""
    fields = [
        FieldSchema(name='chunk_id', dtype=DataType.VARCHAR, is_primary=True, max_length=255),
        FieldSchema(name='embedding', dtype=DataType.FLOAT_VECTOR, dim=dim),
        FieldSchema(
            name='content',
            dtype=DataType.VARCHAR,
            max_length=65535,
            enable_analyzer=True,
            analyzer_params={'type': settings.RAGF_BM25_ANALYZER_TYPE},
        ),
        FieldSchema(name='content_sparse', dtype=DataType.SPARSE_FLOAT_VECTOR),
        FieldSchema(name='kb_name', dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name='document_id', dtype=DataType.VARCHAR, max_length=255),
        FieldSchema(name='version_id', dtype=DataType.INT64),
        FieldSchema(name='chunk_index', dtype=DataType.INT64),
    ]
    bm25_function = Function(
        name='content_bm25',
        function_type=FunctionType.BM25,
        input_field_names=['content'],
        output_field_names=['content_sparse'],
    )
    return CollectionSchema(
        fields=fields,
        functions=[bm25_function],
        description=f'{name}（RAGF 共享集合：kb_name 过滤 + BM25；写入须带 document_id/version_id）',
        enable_dynamic_field=True,
    )


def _ensure_ragf_indexes(client: MilvusClient, collection: str) -> None:
    """确保 dense/sparse/标量索引就绪（幂等，缺哪个补哪个）。"""
    existing = _existing_index_names(client, collection)
    if _RAGF_DENSE_INDEX_NAME not in existing:
        params = IndexParams()
        params.add_index(
            field_name='embedding',
            index_type=settings.RAGF_DENSE_INDEX_TYPE,
            metric_type='COSINE',
            index_name=_RAGF_DENSE_INDEX_NAME,
            params={'nlist': settings.RAGF_DENSE_NLIST},
        )
        client.create_index(collection_name=collection, index_params=params)
    if _RAGF_SPARSE_INDEX_NAME not in existing:
        params = IndexParams()
        params.add_index(
            field_name='content_sparse',
            index_type='SPARSE_INVERTED_INDEX',
            metric_type='BM25',
            index_name=_RAGF_SPARSE_INDEX_NAME,
            params=_RAGF_SPARSE_INDEX_PARAMS,
        )
        client.create_index(collection_name=collection, index_params=params)
    if 'idx_kb_name' not in existing:
        params = IndexParams()
        params.add_index(
            field_name='kb_name',
            index_type='INVERTED',
            index_name='idx_kb_name',
            json_cast_type='varchar',
        )
        client.create_index(collection_name=collection, index_params=params)
    if 'idx_document_id' not in existing:
        params = IndexParams()
        params.add_index(
            field_name='document_id',
            index_type='INVERTED',
            index_name='idx_document_id',
            json_cast_type='varchar',
        )
        client.create_index(collection_name=collection, index_params=params)


def ragf_template_collection_ready(
    collection: str,
    *,
    plugin_namespace: str | None = None,
) -> bool:
    """模板集合是否具备 BM25 schema（宽容探测：字段 + BM25 Function 是否在描述中）。"""
    client = _client(plugin_namespace)
    if not client.has_collection(collection):
        return False
    try:
        described = client.describe_collection(collection)
    except Exception as exc:
        logger.warning('describe_collection 失败 coll=%s: %s', collection, exc)
        return False
    blob = described if isinstance(described, dict) else getattr(described, 'dict', None)
    if blob is None:
        return False
    text = str(blob() if callable(blob) else blob).lower()
    return 'content_sparse' in text and 'bm25' in text


def ensure_ragf_template_collection(
    *,
    dim: int | None = None,
    plugin_namespace: str | None = None,
) -> str:
    """确保 RAGF 文本模板集合存在且 schema 完整（缺 BM25 字段/索引时重建），返回集合名。"""
    dim = settings.RAGF_TEMPLATE_DIM if dim is None else int(dim)
    name = ragf_template_collection_name(dim)
    client = _client(plugin_namespace)
    if not client.has_collection(name):
        logger.info('创建 RAGF 模板集合 %s dim=%s', name, dim)
        client.create_collection(collection_name=name, schema=_ragf_text_schema(name, dim))
        _ensure_ragf_indexes(client, name)
    elif not ragf_template_collection_ready(name, plugin_namespace=plugin_namespace):
        logger.warning('RAGF 模板集合 %s 缺少 BM25 字段/索引，重建', name)
        client.drop_collection(name)
        client.create_collection(collection_name=name, schema=_ragf_text_schema(name, dim))
        _ensure_ragf_indexes(client, name)
    else:
        _ensure_ragf_indexes(client, name)
    try:
        client.load_collection(name)
    except Exception as exc:
        logger.warning('加载 RAGF 模板集合失败 coll=%s: %s', name, exc)
    return name
