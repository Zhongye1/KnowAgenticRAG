"""Phase 4 纯函数测试：示例问题清洗 + 知识导图聚合。

两者都是「KB 元数据供给」的纯逻辑，不依赖 DB/IO，故直测。
"""

from backend.src.app.kb.service.sample_question_service import (
    MAX_SAMPLE_QUESTIONS,
    normalize_questions,
)
from backend.src.app.kb.utils.mindmap import build_mindmap


def _doc(**overrides: object) -> dict:
    base = {
        'document_id': 'd1',
        'name': 'A.md',
        'status': 'ready',
        'chunk_count': 3,
        'structure': None,
    }
    base.update(overrides)
    return base


# ---------------- normalize_questions ----------------


def test_normalize_trims_and_drops_blank() -> None:
    assert normalize_questions(['  q1  ', '', '   ', 'q2']) == ['q1', 'q2']


def test_normalize_dedupes_preserving_order() -> None:
    assert normalize_questions(['b', 'a', 'b', 'a', 'c']) == ['b', 'a', 'c']


def test_normalize_truncates_long_question() -> None:
    long_q = 'x' * 500
    result = normalize_questions([long_q])
    assert len(result) == 1
    assert len(result[0]) == 200


def test_normalize_caps_total_count() -> None:
    result = normalize_questions([f'q{i}' for i in range(100)])
    assert len(result) == MAX_SAMPLE_QUESTIONS


def test_normalize_empty_input() -> None:
    assert normalize_questions([]) == []


def test_normalize_ignores_non_string_items() -> None:
    assert normalize_questions([None, 123, 'ok']) == ['123', 'ok']


# ---------------- build_mindmap ----------------


def test_mindmap_root_per_document_without_structure() -> None:
    """structure 为空时退化为平铺文档列表（Phase 4.2 验收）。"""
    forest = build_mindmap([_doc(document_id='a', name='A.md'), _doc(document_id='b', name='B.md')])

    assert [node['title'] for node in forest] == ['A.md', 'B.md']
    assert all(node['children'] == [] for node in forest)


def test_mindmap_nests_structure_under_document_root() -> None:
    structure = [
        {
            'title': '第一章',
            'path': '/1',
            'level': 1,
            'summary': '摘要',
            'chunk_count': 2,
            'children': [{'title': '1.1', 'path': '/1/1', 'level': 2, 'chunk_count': 1, 'children': []}],
        }
    ]
    forest = build_mindmap([_doc(structure=structure)])

    assert len(forest) == 1
    root = forest[0]
    assert root['title'] == 'A.md'
    assert root['document_id'] == 'd1'
    assert root['children'][0]['title'] == '第一章'
    assert root['children'][0]['children'][0]['title'] == '1.1'


def test_mindmap_tolerates_malformed_structure_nodes() -> None:
    """structure 来自外部解析产物，容忍非 dict 节点与缺失字段。"""
    structure = ['not-a-dict', {'path': '/p'}, {'title': 'ok', 'children': 'not-a-list'}]
    forest = build_mindmap([_doc(structure=structure)])

    titles = [node['title'] for node in forest[0]['children']]
    assert titles == ['/p', 'ok']
    assert forest[0]['children'][1]['children'] == []


def test_mindmap_respects_global_node_budget() -> None:
    """预算只约束章节展开，不约束根节点。

    一篇超大文档不得把后续文档从地图上挤掉——「有这篇文档」比「某篇文档的深层章节」
    更该保住。
    """
    big = [{'title': f's{i}', 'children': []} for i in range(50)]
    forest = build_mindmap(
        [_doc(document_id='big', structure=big), _doc(document_id='small', name='S.md')],
        max_nodes=5,
    )

    assert forest[0]['document_id'] == 'big'
    assert len(forest[0]['children']) == 5
    assert forest[-1]['document_id'] == 'small'
    assert forest[-1]['children'] == []


def test_mindmap_empty_document_list() -> None:
    assert build_mindmap([]) == []


def test_mindmap_falls_back_to_document_id_when_name_missing() -> None:
    forest = build_mindmap([_doc(name='', document_id='only-id')])
    assert forest[0]['title'] == 'only-id'
