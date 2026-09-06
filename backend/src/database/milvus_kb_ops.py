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
from pymilvus.client.abstract import AnnSearchRequest, RRFRanker
from pymilvus.milvus_client.index import IndexParams

from backend.src.core.config import settings
from backend.src.database.milvus_pool import get_milvus_pool

__all__ = [
    'base_collection_names',
    'count_all_entities',
    'count_entities_by_kb',
    'count_ragf_vectors_by_document',
    'delete_ragf_vectors_by_document',
    'delete_ragf_vectors_by_kb',
    'delete_vectors_by_document',
    'delete_vectors_by_kb',
    'ensure_base_collections',
    'ensure_ragf_template_collection',
    'insert_ragf_document_vectors',
    'list_present_collections',
    'ragf_template_collection_name',
    'ragf_template_collection_ready',
    'ragf_template_collections',
    'search_ragf_kb',
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
_RAGF_SEARCH_OUTPUT_FIELDS = ['content', 'chunk_id', 'document_id', 'version_id', 'chunk_index']

# 模板集合 schema 指纹（升级护栏：严格匹配字段名/类型 + BM25 Function + embedding dim + ACL 字段）
_RAGF_TEMPLATE_FIELD_TYPES = {
    'chunk_id': DataType.VARCHAR,
    'embedding': DataType.FLOAT_VECTOR,
    'content': DataType.VARCHAR,
    'content_sparse': DataType.SPARSE_FLOAT_VECTOR,
    'kb_name': DataType.VARCHAR,
    'document_id': DataType.VARCHAR,
    'version_id': DataType.INT64,
    'chunk_index': DataType.INT64,
    # ACL 字段（agent-layer spec：namespace 为分区键，其余检索过滤标量）
    'namespace': DataType.VARCHAR,
    'visibility': DataType.VARCHAR,
    'owner_id': DataType.VARCHAR,
    'groups': DataType.ARRAY,
}
_RAGF_TEMPLATE_EMBEDDING_FIELD = 'embedding'


def _and_expr(*parts: str | None) -> str | None:
    """按 AND 组合过滤表达式（kb_name 必带由调用方决定是否传入）。"""
    present = [part.strip() for part in parts if part and part.strip()]
    if not present:
        return None
    if len(present) == 1:
        return present[0]
    return ' and '.join(f'({part})' for part in present)


def _normalize_ragf_hit(hit: dict) -> dict:
    """MilvusClient 检索命中 → 统一结构（chunk_id/content/两轴/分数）。"""
    entity = hit.get('entity') or {}
    return {
        'chunk_id': str(entity.get('chunk_id') or hit.get('id') or ''),
        'content': str(entity.get('content') or ''),
        'document_id': str(entity.get('document_id') or ''),
        'version_id': int(entity.get('version_id') or 1),
        'chunk_index': int(entity.get('chunk_index') or 0),
        'score': float(hit.get('distance') or 0.0),
    }


def ragf_template_collection_name(dim: int) -> str:
    """RAGF 文本模板集合名：{prefix}_{dim}（默认 ragf_text_1024）。"""
    return f'{settings.RAGF_TEXT_COLLECTION_PREFIX}_{int(dim)}'


def _ragf_text_schema(name: str, dim: int) -> CollectionSchema:
    """RAGF 模板集合 schema：chunk_id 主键 + dense/sparse 双字段 + 显式两轴标量 + ACL 字段。

    ACL 字段（namespace/visibility/groups/owner_id）用于检索时权限过滤。
    DB 是 source-of-truth，Milvus 是镜像（检索时过滤全靠它）。
    """
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
        # ACL 字段（agent-layer spec RAG 数据权限设计；namespace 为分区键做租户剪枝）
        FieldSchema(name='namespace', dtype=DataType.VARCHAR, max_length=64, is_partition_key=True),  # 租户域
        FieldSchema(name='visibility', dtype=DataType.VARCHAR, max_length=16),  # public/restricted/private
        FieldSchema(name='owner_id', dtype=DataType.VARCHAR, max_length=64),  # 文档所有者
        FieldSchema(
            name='groups',
            dtype=DataType.ARRAY,
            element_type=DataType.VARCHAR,
            max_length=64,
            max_capacity=32,
        ),  # 可见组列表
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
        description=f'{name}（RAGF 共享集合：kb_name 过滤 + BM25 + ACL；写入须带 document_id/version_id）',
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
    # ACL 标量索引（agent-layer spec §3.2：namespace 为分区键由 Milvus 自管理，不建索引）
    if 'idx_visibility' not in existing:
        params = IndexParams()
        params.add_index(
            field_name='visibility',
            index_type='INVERTED',
            index_name='idx_visibility',
        )
        client.create_index(collection_name=collection, index_params=params)
    if 'idx_owner_id' not in existing:
        params = IndexParams()
        params.add_index(
            field_name='owner_id',
            index_type='INVERTED',
            index_name='idx_owner_id',
        )
        client.create_index(collection_name=collection, index_params=params)
    if 'idx_groups' not in existing:
        params = IndexParams()
        params.add_index(
            field_name='groups',
            index_type='INVERTED',
            index_name='idx_groups',
        )
        client.create_index(collection_name=collection, index_params=params)


def ragf_template_collection_ready(
    collection: str,
    *,
    dim: int | None = None,
    plugin_namespace: str | None = None,
) -> bool:
    """模板集合是否具备当前 RAGF schema（严格指纹：字段名/类型 + BM25 Function + 可选 dim）。"""
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
    desc = cast('dict', blob() if callable(blob) else blob)
    return _ragf_fields_match(desc.get('fields', []), dim=dim) and _ragf_has_bm25_function(desc.get('functions'))


def _ragf_fields_match(desc_fields: list, *, dim: int | None) -> bool:
    """字段指纹：模板全部字段存在且类型一致，embedding dim（提供时）一致。"""
    fields = {str(f.get('name')): f for f in desc_fields if isinstance(f, dict)}
    for name, dtype in _RAGF_TEMPLATE_FIELD_TYPES.items():
        field = fields.get(name)
        if field is None or field.get('type') != int(dtype):
            return False
    if dim is None:
        return True
    params = fields.get(_RAGF_TEMPLATE_EMBEDDING_FIELD, {}).get('params') or {}
    return int(params.get('dim') or 0) == int(dim)


def _ragf_has_bm25_function(desc_functions: list | None) -> bool:
    """Function 指纹：存在 content → content_sparse 的 BM25 Function。"""
    for function in desc_functions or []:
        if isinstance(function, dict):
            ftype = function.get('function_type', function.get('type'))
            inputs = function.get('input_field_names')
            outputs = function.get('output_field_names')
        else:
            ftype = getattr(function, 'function_type', getattr(function, 'type', None))
            inputs = getattr(function, 'input_field_names', None)
            outputs = getattr(function, 'output_field_names', None)
        if ftype is None:
            continue
        if int(ftype) == int(FunctionType.BM25) and 'content' in str(inputs) and 'content_sparse' in str(outputs):
            return True
    return False


def _ragf_collection_row_count(client: MilvusClient, collection: str) -> int | None:
    """已加载集合的实体数（先封存段再统计）；无法完成时返回 None（不猜测为空，禁止静默重建）。"""
    try:
        client.flush(collection_name=collection)
    except Exception as exc:
        logger.warning('封存段失败（无法判定是否为空）coll=%s: %s', collection, exc)
        return None
    try:
        client.load_collection(collection)
    except Exception as exc:
        logger.warning('加载集合失败（无法判定是否为空）coll=%s: %s', collection, exc)
        return None
    try:
        rows = client.query(collection, filter='', output_fields=['count(*)'])
        return int(rows[0].get('count(*)', 0)) if rows else 0
    except Exception as exc:
        logger.warning('统计集合行数失败 coll=%s: %s', collection, exc)
        return None
    finally:
        try:
            client.release_collection(collection)
        except Exception:
            pass


def ensure_ragf_template_collection(
    *,
    dim: int | None = None,
    plugin_namespace: str | None = None,
) -> str:
    """确保 RAGF 文本模板集合存在且 schema 完整（缺 BM25 字段/索引时重建），返回集合名。

    升级护栏：既有集合 schema 不匹配时仅当“可证明为空”才自动重建；
    非空或无法判定（如未建索引无法加载）一律拒绝重建，防止启动期静默丢数据。
    """
    dim = settings.RAGF_TEMPLATE_DIM if dim is None else int(dim)
    name = ragf_template_collection_name(dim)
    client = _client(plugin_namespace)
    if not client.has_collection(name):
        logger.info('创建 RAGF 模板集合 %s dim=%s', name, dim)
        client.create_collection(collection_name=name, schema=_ragf_text_schema(name, dim))
        _ensure_ragf_indexes(client, name)
    elif not ragf_template_collection_ready(name, dim=dim, plugin_namespace=plugin_namespace):
        row_count = _ragf_collection_row_count(client, name)
        if row_count:
            raise RuntimeError(
                f'RAGF 模板集合 {name} schema 与当前代码不匹配且非空（{row_count} 行）。'
                f'为避免静默丢数据，拒绝自动重建：请先导出或按当前 schema 重新摄取该集合数据，'
                '或确认可丢弃后人工 drop_collection 再重启（启动期将按新 schema 自动重建）。'
            )
        if row_count is None:
            raise RuntimeError(
                f'RAGF 模板集合 {name} schema 与当前代码不匹配，且无法判定是否为空（未建索引/加载失败）。'
                '为避免误删数据，拒绝自动重建：请人工确认后可 drop_collection 或补建索引后重启。'
            )
        logger.warning('RAGF 模板集合 %s 为空且 schema 不匹配，按新 schema 重建', name)
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


# ---------------------------------------------------------------------------
# RAGF 模板集合写/删助手（ragf-design D2-1/D9：共享集合 + kb_name/document_id 过滤）
# ---------------------------------------------------------------------------


def ragf_template_collections(*, plugin_namespace: str | None = None) -> list[str]:
    """列出实例域内全部 RAGF 文本模板集合（ragf_text_*）。"""
    prefix = f'{settings.RAGF_TEXT_COLLECTION_PREFIX}_'
    return sorted(
        coll for coll in list_present_collections(plugin_namespace=plugin_namespace) if coll.startswith(prefix)
    )


def count_ragf_vectors_by_document(
    kb_name: str,
    document_id: str,
    *,
    plugin_namespace: str | None = None,
) -> int:
    """跨全部 RAGF 模板集合统计文档向量数（对账/评估用，§14.7）。"""
    expr = f'kb_name == "{kb_name}" and document_id == "{document_id}"'
    total = 0
    for collection in ragf_template_collections(plugin_namespace=plugin_namespace):
        client = _client(plugin_namespace)
        if not client.has_collection(collection):
            continue
        try:
            rows = client.query(collection, filter=expr, output_fields=['count(*)'])
            if rows:
                total += int(rows[0].get('count(*)', 0))
        except Exception as exc:
            logger.warning('按文档计数失败 coll=%s kb=%s doc=%s: %s', collection, kb_name, document_id, exc)
    return total


def search_ragf_kb(
    *,
    kb_name: str,
    dim: int,
    query_text: str,
    search_mode: str = 'hybrid',
    query_embedding: list[float] | None = None,
    recall_top_k: int = 20,
    rrf_k: int = 60,
    nprobe: int = 10,
    expr: str | None = None,
    plugin_namespace: str | None = None,
) -> list[dict]:
    """RAGF 模板集合检索（ragf-design §5.7/§A.3，纯服务端召回）。

    - ``vector``：dense 路（COSINE + nprobe），返回 top-``recall_top_k``；
    - ``hybrid``：dense + sparse（BM25）双路，服务端 ``RRFRanker(k)`` 融合取
      top-``recall_top_k``（两路 limit 均 = recall_top_k，防 RRF 尾段截断）。

    过滤表达式统一由本模块注入（调用方只传 kb_name 之外的可选子句）；COSINE
    阈值过滤属检索服务层语义（vector 模式），不在此处执行。
    """
    if search_mode not in {'vector', 'hybrid'}:
        raise ValueError(f'search_mode 必须是 vector/hybrid: {search_mode}')
    if search_mode == 'vector' and not query_embedding:
        raise ValueError('vector 检索必须提供 query_embedding')
    collection = ensure_ragf_template_collection(dim=int(dim), plugin_namespace=plugin_namespace)
    filter_expr = _and_expr(_kb_expr(kb_name), expr)
    limit = max(int(recall_top_k), 1)
    client = _client(plugin_namespace)

    if search_mode == 'vector':
        results = client.search(
            collection_name=collection,
            data=[query_embedding],
            anns_field='embedding',
            filter=filter_expr or '',
            limit=limit,
            output_fields=_RAGF_SEARCH_OUTPUT_FIELDS,
            search_params={'metric_type': 'COSINE', 'params': {'nprobe': int(nprobe)}},
        )
    else:
        dense_req = AnnSearchRequest(
            data=[query_embedding or []],
            anns_field='embedding',
            param={'metric_type': 'COSINE', 'params': {'nprobe': int(nprobe)}},
            limit=limit,
            expr=filter_expr,
        )
        sparse_req = AnnSearchRequest(
            data=[query_text],
            anns_field='content_sparse',
            param={'metric_type': 'BM25', 'params': {}},
            limit=limit,
            expr=filter_expr,
        )
        results = client.hybrid_search(
            collection_name=collection,
            reqs=[dense_req, sparse_req],
            ranker=RRFRanker(k=int(rrf_k)),
            limit=limit,
            output_fields=_RAGF_SEARCH_OUTPUT_FIELDS,
        )
    rows = results[0] if results else []
    logger.info(
        'RAGF 检索 coll=%s kb=%s mode=%s limit=%s hits=%s',
        collection,
        kb_name,
        search_mode,
        limit,
        len(rows),
    )
    return [_normalize_ragf_hit(hit) for hit in rows]


def delete_ragf_vectors_by_document(
    kb_name: str,
    document_id: str,
    *,
    plugin_namespace: str | None = None,
) -> dict[str, int]:
    """跨全部模板集合按 kb_name + document_id 删除文档向量（换维/重建残留兜底）。"""
    counts: dict[str, int] = {}
    for collection in ragf_template_collections(plugin_namespace=plugin_namespace):
        deleted = delete_vectors_by_document(collection, kb_name, document_id, plugin_namespace=plugin_namespace)
        if deleted:
            counts[collection] = deleted
    return counts


def delete_ragf_vectors_by_kb(
    kb_name: str,
    *,
    plugin_namespace: str | None = None,
) -> dict[str, int]:
    """跨全部模板集合按 kb_name 删除知识库向量。"""
    counts: dict[str, int] = {}
    for collection in ragf_template_collections(plugin_namespace=plugin_namespace):
        deleted = delete_vectors_by_kb(collection, kb_name, plugin_namespace=plugin_namespace)
        if deleted:
            counts[collection] = deleted
    return counts


def insert_ragf_document_vectors(
    *,
    kb_name: str,
    document_id: str,
    dim: int,
    rows: list[dict],
    plugin_namespace: str | None = None,
) -> int:
    """写入文档分块向量到模板集合（先删该文档旧向量、再插入，全量替换幂等）。

    调用方负责事务边界：本函数只保证 Milvus 侧“先删后插”；PG chunks 写入失败时
    由服务层调用 ``delete_ragf_vectors_by_document`` 补偿。
    """
    collection = ensure_ragf_template_collection(dim=int(dim), plugin_namespace=plugin_namespace)
    delete_vectors_by_document(collection, kb_name, document_id, plugin_namespace=plugin_namespace)
    if not rows:
        return 0
    client = _client(plugin_namespace)
    client.insert(collection_name=collection, data=rows)
    logger.info('插入 RAGF 向量 coll=%s kb=%s doc=%s rows=%s', collection, kb_name, document_id, len(rows))
    return len(rows)
