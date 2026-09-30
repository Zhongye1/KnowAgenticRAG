"""评估域模型契约测试（D61）：表注册、多租户字段、可空性语义。

不连数据库——只断言 ``MappedBase.metadata`` 上的结构，用于挡住三类漂移：
① 新域未被模型自动发现（``get_app_models`` 靠目录约定）；② 漏掉租户列导致跨租户
可见；③ 运行快照字段被写成"读当前值"。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

# 显式导入以注册到 MappedBase.metadata：不依赖本文件外任何模块的导入顺序
import backend.src.app.evaluation.model  # ruff: ignore[unused-import]

from backend.src.common.model import MappedBase

if TYPE_CHECKING:
    from sqlalchemy import Table

EVAL_TABLES = frozenset({'eval_datasets', 'eval_dataset_items', 'eval_runs', 'eval_run_items'})


def test_evaluation_tables_are_registered() -> None:
    """四张表须落在 MappedBase.metadata（否则 create_all 不建表）。"""
    assert set(MappedBase.metadata.tables) >= EVAL_TABLES


def test_models_are_discovered_by_dynamic_import() -> None:
    """生产建表走 ``get_app_models()`` 的目录约定发现，而非显式 import。

    这条挡的是「域目录名/包结构改错导致静默不建表」——显式 import 的测试发现不了。
    """
    from backend.src.utils.dynamic_import import get_app_models

    discovered = {obj for obj in get_app_models() if getattr(obj, '__tablename__', '') in EVAL_TABLES}
    assert len(discovered) == len(EVAL_TABLES)


def _table(name: str) -> Table:
    """按表名取 metadata 里的 Table（比 ``Model.__table__`` 的类型更精确）。"""
    return MappedBase.metadata.tables[name]


def test_every_table_carries_tenant_and_kb_columns() -> None:
    """租户与 KB 是评估数据的可见性边界，这几张表都不能漏。"""
    for name in ('eval_datasets', 'eval_dataset_items', 'eval_runs'):
        assert 'plugin_namespace' in _table(name).columns, name
        assert 'kb_name' in _table(name).columns, name


def test_run_item_scopes_to_run_but_not_kb() -> None:
    """逐题结果靠 run 归属（不重复存 kb_name），但带租户列以便直接按域清理。"""
    columns = _table('eval_run_items').columns
    assert 'plugin_namespace' in columns
    assert 'run_id' in columns


def test_dataset_item_and_run_item_keep_stable_ordering() -> None:
    """逐题顺序必须稳定：两处都有 (owner, item_index) 唯一约束。"""
    dataset_item_names = {constraint.name for constraint in _table('eval_dataset_items').constraints}
    run_item_names = {constraint.name for constraint in _table('eval_run_items').constraints}
    assert 'uq_eval_dataset_items_dataset_index' in dataset_item_names
    assert 'uq_eval_run_items_run_index' in run_item_names


def test_run_freezes_retrieval_config() -> None:
    """检索配置是 run 的快照：改 KB 参数后重跑历史 run 仍可解释当时结果。"""
    columns = _table('eval_runs').columns
    assert 'retrieval_config' in columns
    assert 'judge_spec' in columns


def test_dataset_declares_annotation_axes() -> None:
    """两个标注轴决定能算哪些指标，缺省都是未标注。"""
    columns = _table('eval_datasets').columns
    # getattr：ColumnDefault 是联合类型，.arg 只存在于 ScalarElementColumnDefault
    assert getattr(columns['has_gold_chunks'].default, 'arg', None) is False
    assert getattr(columns['has_gold_answers'].default, 'arg', None) is False


def test_run_item_keeps_answer_and_usage_for_audit() -> None:
    """逐题留档生成答案与用量，「某题为什么变差」才可回答。"""
    columns = _table('eval_run_items').columns
    for name in ('generated_answer', 'retrieved_chunk_ids', 'citations', 'usage', 'metrics'):
        assert name in columns, name
