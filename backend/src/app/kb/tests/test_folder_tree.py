"""文件夹树组装纯函数测试（D51）。

`_build_tree` 不依赖 DB：给定扁平文件夹列表与每级文档数，验证父子挂载、
根级识别与孤儿兜底。真实 PG 行为见 `test_folder_pg.py`。
"""

from __future__ import annotations

from backend.src.app.kb.model import KbFolder
from backend.src.app.kb.service.folder_service import FolderService
from backend.src.utils.timezone import timezone

KB = 'folder_tree_kb'


def _folder(folder_id: str, name: str, parent_id: str | None, sort_order: int = 0) -> KbFolder:
    """构造未入库的文件夹实例（`_build_tree` 只读属性，不需要 session）。"""
    return KbFolder(
        folder_id=folder_id,
        kb_name=KB,
        plugin_namespace='core',
        parent_id=parent_id,
        name=name,
        sort_order=sort_order,
        created_time=timezone.now(),
        updated_time=timezone.now(),
    )


def test_build_tree_nests_children_under_parent() -> None:
    folders = [_folder('a', 'A', None), _folder('b', 'B', 'a'), _folder('c', 'C', 'b')]
    roots = FolderService._build_tree(folders, {})

    assert [node.folder_id for node in roots] == ['a']
    assert [node.folder_id for node in roots[0].children] == ['b']
    assert [node.folder_id for node in roots[0].children[0].children] == ['c']


def test_build_tree_returns_all_roots_sorted_by_input_order() -> None:
    """输入已按 sort_order/name 排序，组装不得改变同级的相对顺序。"""
    folders = [_folder('a', 'A', None, 0), _folder('b', 'B', None, 1), _folder('c', 'C', None, 2)]
    roots = FolderService._build_tree(folders, {})

    assert [node.folder_id for node in roots] == ['a', 'b', 'c']


def test_build_tree_maps_document_counts_per_folder() -> None:
    folders = [_folder('a', 'A', None), _folder('b', 'B', 'a')]
    roots = FolderService._build_tree(folders, {'a': 3, 'b': 7})

    assert roots[0].document_count == 3
    assert roots[0].children[0].document_count == 7


def test_build_tree_missing_count_defaults_to_zero() -> None:
    roots = FolderService._build_tree([_folder('a', 'A', None)], {})

    assert roots[0].document_count == 0


def test_build_tree_orphan_becomes_root_instead_of_failing() -> None:
    """父级缺失（并发删除/脏数据）时按根节点处理，不让整棵树查询失败。"""
    folders = [_folder('b', 'B', 'ghost')]
    roots = FolderService._build_tree(folders, {})

    assert [node.folder_id for node in roots] == ['b']


def test_build_tree_empty_input() -> None:
    assert FolderService._build_tree([], {}) == []
