"""图谱域模型契约测试（D62）：表注册、租户维度、替代 Neo4j 的索引路径。

不连数据库。三处断言对应三个具体风险：

① 新域未被 ``get_app_models`` 的目录约定发现 → 静默不建表；
② 漏租户列 → 跨租户可见；
③ **子图展开的索引路径缺失** —— 这是「不引 Neo4j」能否成立的关键：Neo4j 靠图索引
   做邻居遍历，本项目靠 ``graph_triples`` 两端的索引做同样的事，删了索引就等于把
   图遍历退化成全表扫描。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

# 显式导入以注册到 MappedBase.metadata：不依赖本文件外任何模块的导入顺序
import backend.src.app.graph.model  # ruff: ignore[unused-import]

from backend.src.common.model import MappedBase

if TYPE_CHECKING:
    from sqlalchemy import Table

GRAPH_TABLES = frozenset({'graph_entities', 'graph_triples', 'graph_mentions', 'graph_document_index'})


def _table(name: str) -> Table:
    return MappedBase.metadata.tables[name]


def _indexed_columns(table_name: str) -> set[str]:
    return {column for index in _table(table_name).indexes for column in index.columns.keys()}


def test_graph_tables_are_registered() -> None:
    assert set(MappedBase.metadata.tables) >= GRAPH_TABLES


def test_models_are_discovered_by_dynamic_import() -> None:
    """生产建表走 ``get_app_models()`` 的目录约定发现，而非显式 import。"""
    from backend.src.utils.dynamic_import import get_app_models

    discovered = {obj for obj in get_app_models() if getattr(obj, '__tablename__', '') in GRAPH_TABLES}
    assert len(discovered) == len(GRAPH_TABLES)


def test_every_table_carries_tenant_columns() -> None:
    for name in sorted(GRAPH_TABLES):
        columns = _table(name).columns
        assert 'plugin_namespace' in columns, name
        assert 'kb_name' in columns, name


def test_triple_endpoints_are_indexed_for_subgraph_walk() -> None:
    """两端各自可索引——这是替代 Neo4j 邻居遍历的访问路径。"""
    indexed = _indexed_columns('graph_triples') | {
        column.name for column in _table('graph_triples').primary_key.columns
    }
    assert 'source_entity_id' in indexed
    assert 'target_entity_id' in indexed


def test_mention_is_indexed_by_entity_and_chunk() -> None:
    """按实体查提及（检索侧）与按 chunk 查提及（删除侧）都要走索引。"""
    indexed = _indexed_columns('graph_mentions')
    assert 'entity_id' in indexed
    assert 'chunk_id' in indexed


def test_entity_identity_is_unique() -> None:
    """(域, KB, 归一名称, 标签) 唯一：并发抽取不会把同一实体写成两行。"""
    constraints = {c.name for c in _table('graph_entities').constraints}
    assert 'uq_graph_entities_identity' in constraints


def test_document_index_keeps_self_healing_baseline() -> None:
    """台账保留建图时的分块数：与文档当前分块数比对即可判断是否需重建。"""
    columns = _table('graph_document_index').columns
    for name in ('version_id', 'chunk_count', 'status', 'indexed_time'):
        assert name in columns, name
