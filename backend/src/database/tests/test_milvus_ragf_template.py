"""RAGF 模板集合集成冒烟（ragf-design §5.2/§5.4/§14.7，需真实 Milvus）。

覆盖：模板集合创建与 schema 就绪（BM25 字段/索引）、共享集合 + ``kb_name``
过滤写入、跨 kb 检索不可见、按文档删除与对账计数。Milvus 不可达时跳过
（CI 无基础设施时静默），本机 docker compose 环境应真实执行。
"""

from __future__ import annotations

import time
import uuid

from typing import TYPE_CHECKING

import pytest

from backend.src.database.milvus_kb_ops import (
    count_ragf_vectors_by_document,
    delete_ragf_vectors_by_document,
    ensure_ragf_template_collection,
    insert_ragf_document_vectors,
    ragf_template_collection_name,
    ragf_template_collection_ready,
    search_ragf_kb,
)

if TYPE_CHECKING:
    from collections.abc import Callable

DIM = 1024
VISIBLE_TIMEOUT = 20.0


def _dim_vector(seed: float) -> list[float]:
    base = [seed] * DIM
    base[0] = 1.0 - seed
    return base


def _doc_rows(document_id: str, count: int) -> list[dict]:
    return [
        {
            'chunk_id': f'{document_id}:1:{idx}',
            'embedding': _dim_vector(0.1 + idx * 0.01),
            'content': f'知识库测试分块 {document_id} 第 {idx} 段（中文 BM25 语料）',
            'kb_name': 'unused',  # insert 时由调用方统一写入，这里仅占位
            'document_id': document_id,
            'version_id': 1,
            'chunk_index': idx,
        }
        for idx in range(count)
    ]


def _milvus_available() -> bool:
    try:
        ensure_ragf_template_collection(dim=DIM)
    except Exception:
        return False
    else:
        return True


@pytest.fixture()
def collection() -> str:
    if not _milvus_available():
        pytest.skip('Milvus 不可达，跳过模板集合集成冒烟')
    return ensure_ragf_template_collection(dim=DIM)


def _test_kb() -> str:
    return f'itest_{uuid.uuid4().hex[:8]}'


def _wait_until(predicate: Callable[[], bool], *, timeout: float = VISIBLE_TIMEOUT, interval: float = 0.5) -> bool:
    """轮询直到满足（Milvus 新写入需数据节点封存后才可被过滤查询命中，~2-3s）。"""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


def test_template_collection_schema_ready(collection: str) -> None:
    """模板集合可创建且 schema 指纹就绪（含 BM25 稀疏字段/索引）。"""
    assert collection == ragf_template_collection_name(DIM)
    assert ragf_template_collection_ready(collection) is True


def test_insert_filter_count_delete(collection: str) -> None:
    """共享集合内：双 kb 写入互不可见，计数/删除按 (kb_name, document_id) 精确。"""
    kb_a = _test_kb()
    kb_b = _test_kb()
    doc_a1 = f'{kb_a}-doc-1'
    doc_a2 = f'{kb_a}-doc-2'
    doc_b1 = f'{kb_b}-doc-1'
    rows_a = _doc_rows(doc_a1, 2) + _doc_rows(doc_a2, 1)
    for row in rows_a:
        row['kb_name'] = kb_a
    rows_b = _doc_rows(doc_b1, 1)
    for row in rows_b:
        row['kb_name'] = kb_b
    try:
        assert insert_ragf_document_vectors(kb_name=kb_a, document_id=doc_a1, dim=DIM, rows=rows_a[:2]) == 2
        assert insert_ragf_document_vectors(kb_name=kb_a, document_id=doc_a2, dim=DIM, rows=rows_a[2:]) == 1
        assert insert_ragf_document_vectors(kb_name=kb_b, document_id=doc_b1, dim=DIM, rows=rows_b) == 1

        assert _wait_until(
            lambda: count_ragf_vectors_by_document(kb_a, doc_a1) == 2
            and count_ragf_vectors_by_document(kb_a, doc_a2) == 1
            and count_ragf_vectors_by_document(kb_b, doc_b1) == 1
        ), '写入后应在封存窗口内可被过滤查询命中'

        hits_a = search_ragf_kb(
            kb_name=kb_a,
            dim=DIM,
            query_text='知识库测试',
            search_mode='vector',
            query_embedding=_dim_vector(0.15),
            recall_top_k=10,
        )
        assert hits_a, 'kb_a 应能召回自己的向量'
        assert {hit['document_id'] for hit in hits_a} <= {doc_a1, doc_a2}, '检索结果必须被 kb_name 过滤'

        hits_b = search_ragf_kb(
            kb_name=kb_b,
            dim=DIM,
            query_text='知识库测试',
            search_mode='vector',
            query_embedding=_dim_vector(0.15),
            recall_top_k=10,
        )
        docs_b = {hit['document_id'] for hit in hits_b}
        assert docs_b == {doc_b1}, '跨 kb 不可见：kb_b 检索不得命中 kb_a 文档'

        deleted = delete_ragf_vectors_by_document(kb_a, doc_a1)
        assert sum(deleted.values()) == 2
        assert _wait_until(
            lambda: count_ragf_vectors_by_document(kb_a, doc_a1) == 0
            and count_ragf_vectors_by_document(kb_a, doc_a2) == 1
        ), '按文档删除后计数应归零'
    finally:
        delete_ragf_vectors_by_document(kb_a, doc_a1)
        delete_ragf_vectors_by_document(kb_a, doc_a2)
        delete_ragf_vectors_by_document(kb_b, doc_b1)
