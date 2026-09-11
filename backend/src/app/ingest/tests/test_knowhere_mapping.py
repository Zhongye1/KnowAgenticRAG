"""Knowhere 产物映射单测（双管线摄取 spec D6，纯函数无 IO）。"""

from __future__ import annotations

from types import SimpleNamespace

from backend.src.app.ingest.service.knowhere_mapping import (
    aggregate_keyword_counts,
    map_knowhere_result,
)

_ACL = {'namespace': 'core', 'visibility': 'restricted', 'owner_id': 'u1', 'groups': ['g1']}


def _chunk(ctype: str, content: str, *, path: str = '', **meta) -> SimpleNamespace:
    return SimpleNamespace(
        type=ctype,
        path=path,
        content=content,
        html=meta.pop('html', None),
        chunk_id=meta.pop('chunk_id', 'c1'),
        metadata=SimpleNamespace(**meta),
    )


def test_map_text_chunks_and_acl_mirror() -> None:
    result = SimpleNamespace(
        chunks=[
            _chunk(
                'text', '第一条 内容', path='法规/第一章', summary='摘要A', keywords=['个税', '税率'], page_nums=[1]
            ),
            _chunk('text', '第二条 内容', path='法规/第一章', keywords=['个税'], page_nums=[2]),
        ],
        doc_nav=None,
    )
    mapped = map_knowhere_result(result, document_id='doc1', kb_name='kb1', version_id=1, acl_fields=_ACL)
    assert len(mapped.chunk_rows) == 2
    assert [row['chunk_index'] for row in mapped.chunk_rows] == [0, 1]
    first_vector = mapped.vector_rows[0]
    # ACL 镜像字段逐行携带（spec D6）
    assert first_vector['namespace'] == 'core'
    assert first_vector['visibility'] == 'restricted'
    assert first_vector['groups'] == ['g1']
    assert first_vector['chunk_id'] == 'doc1:1:0'
    assert first_vector['chunk_type'] == 'text'
    assert first_vector['path'] == '法规/第一章'
    assert mapped.keyword_counts == {'个税': 2, '税率': 1}


def test_map_table_uses_html_and_image_uses_summary() -> None:
    result = SimpleNamespace(
        chunks=[
            _chunk('table', '', html='<table><tr><td>1</td></tr></table>'),
            _chunk('image', '', summary='一张图表'),
        ],
        doc_nav=None,
    )
    mapped = map_knowhere_result(result, document_id='doc1', kb_name='kb1', version_id=1, acl_fields=_ACL)
    contents = [row['content'] for row in mapped.chunk_rows]
    assert contents[0].startswith('<table>')
    assert contents[1] == '一张图表'
    assert [row['meta']['chunk_type'] for row in mapped.chunk_rows] == ['table', 'image']


def test_section_summary_nodes_share_path_prefix() -> None:
    sections = [
        SimpleNamespace(
            path='doc/3 Model Architecture',
            level=1,
            title='3 Model Architecture',
            summary='模型架构章节摘要',
            chunk_count=2,
            children=[],
        )
    ]
    result = SimpleNamespace(
        chunks=[_chunk('text', 'attention 内容', path='doc/3 Model Architecture/3.2 Attention')],
        doc_nav=SimpleNamespace(sections=sections),
    )
    mapped = map_knowhere_result(result, document_id='doc1', kb_name='kb1', version_id=1, acl_fields=_ACL)
    types = [row['meta']['chunk_type'] for row in mapped.chunk_rows]
    assert types == ['text', 'section_summary']
    section_row = mapped.chunk_rows[1]
    assert section_row['content'] == '模型架构章节摘要'
    assert section_row['meta']['path'] == 'doc/3 Model Architecture'
    assert mapped.vector_rows[1]['chunk_type'] == 'section_summary'


def test_doc_summary_and_structure_tree() -> None:
    sections = [
        SimpleNamespace(
            path='doc/1',
            level=1,
            title='',
            summary='S' * 500,
            chunk_count=1,
            children=[
                SimpleNamespace(path='doc/1/1.1', level=2, title='子节', summary='子摘要', chunk_count=1, children=[])
            ],
        )
    ]
    result = SimpleNamespace(
        chunks=[
            _chunk(
                'text', '正文', document_top_summary='全文摘要', summary='', keywords=[], page_nums=[], connect_to=[]
            ),
        ],
        doc_nav=SimpleNamespace(sections=sections),
    )
    mapped = map_knowhere_result(result, document_id='doc1', kb_name='kb1', version_id=1, acl_fields=_ACL)
    assert mapped.doc_summary == '全文摘要'
    tree = mapped.doc_structure
    assert tree is not None and len(tree) == 1
    assert tree[0]['title'] == '1'  # title 缺省取 path 末段
    assert len(tree[0]['summary']) == 400  # 摘要截断
    assert tree[0]['children'][0]['title'] == '子节'


def test_empty_content_chunks_skipped() -> None:
    result = SimpleNamespace(
        chunks=[_chunk('text', '   ')],
        doc_nav=None,
    )
    mapped = map_knowhere_result(result, document_id='doc1', kb_name='kb1', version_id=1, acl_fields=_ACL)
    assert mapped.chunk_rows == []
    assert mapped.doc_structure is None


def test_aggregate_keyword_counts_dedupes_within_chunk() -> None:
    metas = [
        {'keywords': ['a', 'a', 'b']},
        {'keywords': 'a'},
        {'keywords': [1, None, '']},
    ]
    assert aggregate_keyword_counts(metas) == {'a': 2, 'b': 1}  # type: ignore[comparison-overlap]
