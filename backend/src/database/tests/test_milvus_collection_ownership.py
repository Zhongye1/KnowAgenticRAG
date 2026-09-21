"""基础集合索引归属（离线单测，无需 Milvus）。

回归保护：``ensure_base_collections`` 曾把 ``ragf_visual`` 也当自己的基础集合，按
``idx_vector`` / ``idx_kb_name`` 判重补索引；而视觉集合的真实所有者是
``milvus_visual_ops.ensure_visual_collection``（``idx_visual_*``）。索引名不同但落在
同一 field 上，Milvus 限制是「同一 field 只能有一个索引」，两边并存会在启动期报
``creating multiple indexes on same field is not supported``（实测于 ragf_visual）。
"""

from __future__ import annotations

import logging

from typing import Any

import pytest

from backend.src.core.config import settings
from backend.src.database import milvus_kb_ops, milvus_visual_ops
from backend.src.database.milvus_kb_ops import ensure_base_collections
from backend.src.database.milvus_visual_ops import ensure_visual_collection


class _StubMilvusClient:
    """最小 MilvusClient 替身：记录集合/索引操作，并按 Milvus 语义拒绝同 field 二次索引。"""

    def __init__(self, collections: dict[str, dict[str, str]] | None = None) -> None:
        # collection -> {field_name: index_name}
        self.index_fields: dict[str, dict[str, str]] = {
            name: dict(fields) for name, fields in (collections or {}).items()
        }
        self.created_collections: list[str] = []
        self.created_indexes: list[tuple[str, str, str]] = []  # (collection, field, index_name)
        self.loaded: list[str] = []

    def has_collection(self, name: str) -> bool:
        return name in self.index_fields

    def create_collection(self, *, collection_name: str, schema: Any) -> None:
        self.created_collections.append(collection_name)
        self.index_fields.setdefault(collection_name, {})

    def list_indexes(self, collection: str) -> list[str]:
        return list(self.index_fields.get(collection, {}).values())

    def create_index(self, *, collection_name: str, index_params: Any) -> None:
        for param in index_params:
            existing = self.index_fields.setdefault(collection_name, {})
            if param.field_name in existing:
                raise RuntimeError(
                    f'creating multiple indexes on same field is not supported: {collection_name}.{param.field_name}'
                )
            existing[param.field_name] = param.index_name
            self.created_indexes.append((collection_name, param.field_name, param.index_name))

    def load_collection(self, name: str) -> None:
        self.loaded.append(name)


@pytest.fixture()
def stub(monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest) -> _StubMilvusClient:
    client = _StubMilvusClient(getattr(request, 'param', None))
    monkeypatch.setattr(milvus_kb_ops, '_client', lambda plugin_namespace=None: client)
    monkeypatch.setattr(milvus_visual_ops, '_client', lambda plugin_namespace=None: client)
    return client


def test_ensure_base_collections_only_owns_text_collection(stub: _StubMilvusClient) -> None:
    """空域启动：只建文本集合，不越权创建视觉集合（后者由 ensure_visual_collection 负责）。"""
    ensure_base_collections()

    text = settings.MILVUS_TEXT_COLLECTION
    visual = settings.MILVUS_VISUAL_COLLECTION
    assert stub.created_collections == [text]
    assert {coll for coll, _field, _name in stub.created_indexes} == {text}
    assert stub.loaded == [text]
    assert visual not in stub.index_fields


@pytest.mark.parametrize(
    'stub',
    [{settings.MILVUS_VISUAL_COLLECTION: {'vector': 'idx_visual_vector', 'kb_name': 'idx_visual_kb_name'}}],
    indirect=True,
)
def test_ensure_base_collections_skips_visual_collection_indexes(
    stub: _StubMilvusClient, caplog: pytest.LogCaptureFixture
) -> None:
    """回归：视觉集合已有 idx_visual_* 时，启动期不得再按 idx_vector/idx_kb_name 补建。"""
    visual = settings.MILVUS_VISUAL_COLLECTION
    assert stub.has_collection(visual)
    with caplog.at_level(logging.WARNING):
        ensure_base_collections()

    assert [coll for coll, _field, _name in stub.created_indexes if coll == visual] == []
    assert stub.index_fields[visual] == {'vector': 'idx_visual_vector', 'kb_name': 'idx_visual_kb_name'}
    assert '创建向量索引失败' not in caplog.text
    assert '创建 kb_name 倒排索引失败' not in caplog.text


@pytest.mark.parametrize(
    'stub',
    [{settings.MILVUS_TEXT_COLLECTION: {'vector': 'idx_vector', 'kb_name': 'idx_kb_name'}}],
    indirect=True,
)
def test_ensure_base_collections_indexes_idempotent(stub: _StubMilvusClient) -> None:
    """文本集合索引已就绪时只加载，不重复建索引（无告警）。"""
    text = settings.MILVUS_TEXT_COLLECTION
    ensure_base_collections()

    assert stub.created_indexes == []
    assert stub.created_collections == []
    assert stub.loaded == [text]


def test_startup_collection_owners_keep_one_index_per_field(stub: _StubMilvusClient) -> None:
    """启动期串起两个所有者后，各集合每个 field 恰好一个索引，且视觉索引仍是 idx_visual_*。"""
    text = settings.MILVUS_TEXT_COLLECTION
    visual = settings.MILVUS_VISUAL_COLLECTION
    ensure_base_collections()
    ensure_visual_collection()

    assert set(stub.index_fields[text]) == {'vector', 'kb_name'}
    visual_indexes = dict(stub.index_fields[visual])
    assert set(visual_indexes) == {'vector', 'kb_name', 'document_id', 'visibility', 'owner_id', 'groups'}
    assert all(name.startswith('idx_visual_') for name in visual_indexes.values())
    assert stub.loaded == [text, visual]
