"""分块业务契约（ragf-design D9：chunks 数据 Owner = kb 域）。

- ingest 只写：经 ``replace_document_chunks`` 幂等替换文档某版本全部分块；
- retrieval / 版本化只读：经 ``list_by_document`` 等公开方法读取。
"""

from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud import chunk_dao
from backend.src.app.kb.model import Chunk
from backend.src.app.kb.model.chunk import CHUNK_META_PATH_KEY

__all__ = ['ChunkService', 'chunk_service', 'pick_nearest_section_summary']


def pick_nearest_section_summary(path: str, summaries: list[tuple[str, str]]) -> str | None:
    """在候选章节里挑出 ``path`` 的**最近祖先**摘要（Phase 3.1 parent-doc 下钻）。

    ``summaries`` 为 ``(章节路径, 摘要)``。三条约束：

    - 必须**段边界**前缀匹配——``doc/3`` 不得匹配 ``doc/30 x``；
    - 路径须**严格短于** ``path``——自身不算自己的祖先（摘要行本身也会被召回）；
    - 多个命中取**最深**（路径最长）者：最近的父章节上下文最相关，payload 也最小。
    """
    target = str(path or '').strip()
    if not target:
        return None
    best_length = -1
    best_summary: str | None = None
    for raw_path, raw_summary in summaries:
        section_path = str(raw_path or '').strip()
        summary = str(raw_summary or '').strip()
        if not section_path or not summary:
            continue
        if len(section_path) >= len(target) or not target.startswith(section_path):
            continue
        if target[len(section_path)] != '/':
            continue
        if len(section_path) > best_length:
            best_length, best_summary = len(section_path), summary
    return best_summary


class ChunkService:
    """分块读写契约"""

    @staticmethod
    async def replace_document_chunks(
        db: AsyncSession,
        *,
        document_id: str,
        kb_name: str,
        chunks: list[dict],
        version_id: int = 1,
        plugin_namespace: str | None = None,
    ) -> int:
        """幂等替换文档某版本分块；chunk_id = {document_id}:{version_id}:{chunk_index}。"""
        rows = []
        for chunk_index, chunk in enumerate(chunks):
            content = chunk.get('content')
            if not content or not str(content).strip():
                continue
            chunk_index_value = chunk.get('chunk_index')
            idx = int(chunk_index_value) if chunk_index_value is not None else chunk_index
            rows.append({
                'chunk_id': f'{document_id}:{version_id}:{idx}',
                'content': str(content),
                'chunk_index': idx,
                'token_count': chunk.get('token_count'),
                'char_pos_start': chunk.get('char_pos_start'),
                'char_pos_end': chunk.get('char_pos_end'),
                'meta': chunk.get('meta') or {},
            })
        return await chunk_dao.replace_by_document(
            db,
            document_id=document_id,
            kb_name=kb_name,
            rows=rows,
            version_id=version_id,
            plugin_namespace=plugin_namespace,
        )

    @staticmethod
    async def list_by_document(
        db: AsyncSession,
        document_id: str,
        *,
        kb_name: str | None = None,
        version_id: int | None = None,
        plugin_namespace: str | None = None,
    ) -> list[Chunk]:
        return await chunk_dao.list_by_document(
            db,
            document_id,
            kb_name=kb_name,
            version_id=version_id,
            plugin_namespace=plugin_namespace,
        )

    @staticmethod
    async def list_by_ids(
        db: AsyncSession,
        chunk_ids: list[str],
        *,
        kb_name: str | None = None,
        plugin_namespace: str | None = None,
    ) -> list[Chunk]:
        """按 chunk_id 批量读取（retrieval 来源补全只读契约，D9）。"""
        return await chunk_dao.list_by_ids(
            db,
            chunk_ids,
            kb_name=kb_name,
            plugin_namespace=plugin_namespace,
        )

    @staticmethod
    async def resolve_section_summaries(
        db: AsyncSession,
        chunks: list[Chunk],
        *,
        kb_name: str | None = None,
        plugin_namespace: str | None = None,
    ) -> dict[str, str]:
        """已加载的命中分块 → 各自最近祖先章节摘要（Phase 3.1）；无摘要者不入结果。

        接受**已加载的分块行**而非 id 列表：调用方（来源补全）本就要读这些行，
        传行可省掉一次重复的主键查询。前缀匹配在内存里做——一篇文档的章节数很少，
        不值得下发到 SQL。
        """
        paths: dict[str, str] = {}
        for row in chunks:
            path = str((row.meta or {}).get(CHUNK_META_PATH_KEY) or '').strip()
            if path:
                paths[row.chunk_id] = path
        if not paths:
            return {}

        sections = await chunk_dao.list_section_summaries(
            db,
            sorted({row.document_id for row in chunks}),
            kb_name=kb_name,
            plugin_namespace=plugin_namespace,
        )
        by_document: dict[str, list[tuple[str, str]]] = {}
        for section in sections:
            by_document.setdefault(section.document_id, []).append((
                str((section.meta or {}).get(CHUNK_META_PATH_KEY) or ''),
                str(section.content or ''),
            ))

        document_of = {row.chunk_id: row.document_id for row in chunks}
        resolved: dict[str, str] = {}
        for chunk_id, path in paths.items():
            summary = pick_nearest_section_summary(path, by_document.get(document_of[chunk_id], []))
            if summary:
                resolved[chunk_id] = summary
        return resolved

    @staticmethod
    async def count_by_document(
        db: AsyncSession,
        document_id: str,
        *,
        kb_name: str | None = None,
        version_id: int | None = None,
        plugin_namespace: str | None = None,
    ) -> int:
        return await chunk_dao.count_by_document(
            db,
            document_id,
            kb_name=kb_name,
            version_id=version_id,
            plugin_namespace=plugin_namespace,
        )


chunk_service = ChunkService()
