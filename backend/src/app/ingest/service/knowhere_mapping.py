"""Knowhere 产物 → RAG-F 存储映射（双管线摄取 spec D6）。

职责：把 SDK ParseResult（chunks + doc_nav）规范化为 RAG-F 三类落点——

1. PG chunks 行（经 kb 域 ``ChunkService.replace_document_chunks`` 契约写入）；
2. Milvus 模板集合向量行（bge-m3 dense + 服务端 BM25 稀疏自动生成；ACL 镜像
   字段 + ``chunk_type``/``path``/``level`` 动态字段供检索过滤与 parent-doc 下钻）；
3. 文档级产物：关键词目录计数、文档摘要、章节结构树。

章节摘要节点以 ``chunk_type='section_summary'`` 落同一集合，与内容 chunk 共享
``path`` 前缀——先召回章节摘要，再按 path 前缀下钻（parent-doc 检索）。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from backend.src.app.ingest.chunking import nlp
from backend.src.common.log import log

__all__ = ['KnowhereMapped', 'aggregate_keyword_counts', 'build_doc_structure', 'map_knowhere_result']

_STRUCTURE_MAX_NODES = 2000
_STRUCTURE_SUMMARY_CAP = 400


@dataclass
class KnowhereMapped:
    """Knowhere 解析产物的 RAG-F 规范化形态。"""

    chunk_rows: list[dict] = field(default_factory=list)  # PG chunks 契约行
    vector_rows: list[dict] = field(default_factory=list)  # Milvus 行（embedding 由服务层后填）
    keyword_counts: dict[str, int] = field(default_factory=dict)
    doc_summary: str = ''
    doc_structure: list[dict] | None = None

    @property
    def content_chunk_count(self) -> int:
        return sum(1 for row in self.chunk_rows if row['meta'].get('chunk_type') != 'section_summary')

    @property
    def section_count(self) -> int:
        return len(self.chunk_rows) - self.content_chunk_count


def _chunk_meta(chunk: Any, name: str, default: Any = None) -> Any:
    """读 chunk.metadata.<name>（SDK ChunkMetadata 与 duck-typing 统一访问）。"""
    meta = getattr(chunk, 'metadata', None)
    val = getattr(meta, name, default) if meta is not None else default
    return val if val is not None else default


def _chunk_text(chunk: Any, ctype: str) -> str:
    """按类型取文本：text=content；table=html（回退 content）；image=摘要（回退 content）。"""
    if ctype == 'table':
        return str(getattr(chunk, 'html', None) or getattr(chunk, 'content', '') or '')
    if ctype == 'image':
        return str(_chunk_meta(chunk, 'summary', '') or getattr(chunk, 'content', '') or '')
    return str(getattr(chunk, 'content', '') or '')


def aggregate_keyword_counts(metas: list[dict[str, Any]]) -> dict[str, int]:
    """聚合 chunk 关键词 → {keyword: 覆盖 chunk 数}（每 chunk 内去重）。"""
    counts: dict[str, int] = {}
    for meta in metas:
        keywords = meta.get('keywords') or []
        if isinstance(keywords, str):
            keywords = [keywords]
        seen: set[str] = set()
        for kw in keywords:
            if not isinstance(kw, str):
                continue
            token = kw.strip()
            if not token or token in seen:
                continue
            seen.add(token)
            counts[token] = counts.get(token, 0) + 1
    return counts


def build_doc_structure(doc_nav: Any, *, max_nodes: int = _STRUCTURE_MAX_NODES) -> list[dict] | None:
    """doc_nav 章节树 → 可序列化结构树（截断摘要、限节点数；无 doc_nav 返回 None）。"""
    sections = getattr(doc_nav, 'sections', None) if doc_nav is not None else None
    if not sections:
        return None
    remaining = {'n': max_nodes}

    def build_node(section: Any) -> dict | None:
        if remaining['n'] <= 0:
            return None
        remaining['n'] -= 1
        path = str(getattr(section, 'path', '') or '')
        summary = str(getattr(section, 'summary', '') or '').strip()
        if len(summary) > _STRUCTURE_SUMMARY_CAP:
            summary = summary[:_STRUCTURE_SUMMARY_CAP]
        title = str(getattr(section, 'title', '') or '').strip() or (path.rsplit('/', 1)[-1].strip() if path else '')
        children = []
        for child in getattr(section, 'children', None) or []:
            node = build_node(child)
            if node is not None:
                children.append(node)
        return {
            'path': path,
            'level': int(getattr(section, 'level', 1) or 1),
            'title': title,
            'summary': summary,
            'chunk_count': int(getattr(section, 'chunk_count', 0) or 0),
            'children': children,
        }

    tree = []
    for section in sections:
        node = build_node(section)
        if node is not None:
            tree.append(node)
    return tree or None


def _collect_chunk_metas(result: Any) -> list[dict[str, Any]]:
    """SDK ParseResult → 统一 chunk 元数据序列（'_text' 承载文本，组装时弹出）。"""
    metas: list[dict[str, Any]] = []

    # ① 内容 chunk（text/table/image）
    for chunk in getattr(result, 'chunks', None) or []:
        ctype = str(getattr(chunk, 'type', 'text') or 'text')
        path = str(getattr(chunk, 'path', '') or '')
        text = _chunk_text(chunk, ctype).strip()
        if not text:
            continue
        metas.append({
            '_text': text,
            'engine': 'knowhere',
            'chunk_type': ctype,
            'path': path,
            'level': path.count('/'),
            'summary': str(_chunk_meta(chunk, 'summary', '') or ''),
            'file_path': str(_chunk_meta(chunk, 'file_path', '') or ''),
            'document_top_summary': str(_chunk_meta(chunk, 'document_top_summary', '') or ''),
            'keywords': list(_chunk_meta(chunk, 'keywords', []) or []),
            'page_nums': list(_chunk_meta(chunk, 'page_nums', []) or []),
            'connect_to': list(_chunk_meta(chunk, 'connect_to', []) or []),
        })

    # ② 章节摘要节点（parent-doc 检索；summary 为空或无内容 chunk 的章节跳过）
    doc_nav = getattr(result, 'doc_nav', None)
    sections = getattr(doc_nav, 'sections', None) if doc_nav is not None else None
    if sections:
        _walk_sections(sections, metas)
    return metas


def _walk_sections(section_list: list[Any], metas: list[dict[str, Any]]) -> None:
    """深度优先收集章节摘要（有 summary 且有内容的章节才入列）。"""
    for section in section_list:
        summary = str(getattr(section, 'summary', '') or '').strip()
        chunk_count = int(getattr(section, 'chunk_count', 0) or 0)
        path = str(getattr(section, 'path', '') or '')
        if summary and chunk_count > 0:
            metas.append({
                '_text': summary,
                'engine': 'knowhere',
                'chunk_type': 'section_summary',
                'path': path,
                'level': int(getattr(section, 'level', 1) or 1),
                'summary': summary,
                'chunk_count': chunk_count,
            })
        children = getattr(section, 'children', None) or []
        if children:
            _walk_sections(children, metas)


def map_knowhere_result(
    result: Any,
    *,
    document_id: str,
    kb_name: str,
    version_id: int,
    acl_fields: dict[str, Any],
) -> KnowhereMapped:
    """SDK ParseResult → RAG-F 规范化产物（纯函数，无 IO）。

    Args:
        result: Knowhere SDK ParseResult（duck-typing：chunks / doc_nav）。
        document_id: 文档 ID。
        kb_name: 知识库标识。
        version_id: 文档版本（Phase 2 前恒为 1）。
        acl_fields: ACL 镜像字段（namespace/visibility/owner_id/groups，spec D6）。
    """
    metas = _collect_chunk_metas(result)
    mapped = KnowhereMapped()
    for idx, meta in enumerate(metas):
        content = str(meta.pop('_text', '') or '').strip()
        if not content:
            continue
        if not mapped.doc_summary and meta.get('document_top_summary'):
            mapped.doc_summary = str(meta['document_top_summary'])
        mapped.chunk_rows.append({
            'content': content,
            'chunk_index': idx,
            'token_count': nlp.count_tokens(content),
            'char_pos_start': None,
            'char_pos_end': None,
            'meta': meta,
        })
        mapped.vector_rows.append({
            'chunk_id': f'{document_id}:{version_id}:{idx}',
            'content': content,
            'kb_name': kb_name,
            'document_id': document_id,
            'version_id': version_id,
            'chunk_index': idx,
            **acl_fields,
            # 动态字段（ragf_text 开启 enable_dynamic_field）：检索过滤 + parent-doc 下钻
            'chunk_type': meta.get('chunk_type') or 'text',
            'path': meta.get('path') or '',
            'level': int(meta.get('level') or 0),
        })

    mapped.keyword_counts = aggregate_keyword_counts(metas)
    mapped.doc_structure = build_doc_structure(getattr(result, 'doc_nav', None))
    log.info(
        'Knowhere 产物映射完成 doc={} content_chunks={} sections={} keywords={}',
        document_id,
        mapped.content_chunk_count,
        mapped.section_count,
        len(mapped.keyword_counts),
    )
    return mapped
