"""Phase 3.1 章节摘要下钻测试：命中 chunk → 其最近祖先章节摘要。

章节摘要不是独立表，而是以 ``meta.chunk_type='section_summary'`` 与内容 chunk
**同表**存放（`ingest/service/knowhere_mapping.py:173`），归属关系由 ``meta.path``
前缀决定。本文件覆盖纯匹配逻辑的边界（多祖先取最深、段边界、自引用、无路径）。
"""

from __future__ import annotations

import pytest

from backend.src.app.kb.service.chunk_service import pick_nearest_section_summary


def _sections(*pairs: tuple[str, str]) -> list[tuple[str, str]]:
    return list(pairs)


def test_picks_deepest_ancestor() -> None:
    """多个祖先时取最深（路径最长）的那个——最近的父章节上下文最相关。"""
    summaries = _sections(
        ('doc', '文档摘要'),
        ('doc/3 Model Architecture', '模型架构章节摘要'),
    )
    assert pick_nearest_section_summary('doc/3 Model Architecture/3.2 Attention', summaries) == '模型架构章节摘要'


def test_matches_on_segment_boundary_only() -> None:
    """前缀必须落在路径分隔符上：``doc/3`` 不得匹配 ``doc/30 xxx``。"""
    summaries = _sections(('doc/3', '第三章摘要'))
    assert pick_nearest_section_summary('doc/30 Other Chapter', summaries) is None
    assert pick_nearest_section_summary('doc/3/child', summaries) == '第三章摘要'
    assert pick_nearest_section_summary('doc/3', summaries) is None  # 自身不算祖先


def test_returns_none_without_path_or_summaries() -> None:
    assert pick_nearest_section_summary('', _sections(('doc', '摘要'))) is None
    assert pick_nearest_section_summary('doc/a/b', []) is None


def test_ignores_unrelated_sections() -> None:
    summaries = _sections(('other/1', '别的章节'))
    assert pick_nearest_section_summary('doc/3 Attention', summaries) is None


def test_blank_summary_is_not_returned() -> None:
    """空摘要视为无摘要（摄取侧已过滤，此处防御历史数据）。"""
    assert pick_nearest_section_summary('doc/3/x', _sections(('doc/3', '   '))) is None


@pytest.mark.parametrize(
    ('chunk_path', 'expected'),
    [
        ('a/b/c/d', 'a/b'),
        ('a/b', 'a'),
        ('a', None),
    ],
)
def test_walks_up_to_nearest_available_ancestor(chunk_path: str, expected: str | None) -> None:
    """中间层级缺失时向上找最近存在的祖先。"""
    summaries = _sections(('a', 'A'), ('a/b', 'B'))
    picked = pick_nearest_section_summary(chunk_path, summaries)
    assert picked == (None if expected is None else {'a': 'A', 'a/b': 'B'}[expected])
