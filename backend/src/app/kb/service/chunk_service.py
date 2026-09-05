"""分块业务契约（ragf-design D9：chunks 数据 Owner = kb 域）。

- ingest 只写：经 ``replace_document_chunks`` 幂等替换文档某版本全部分块；
- retrieval / 版本化只读：经 ``list_by_document`` 等公开方法读取。
"""

from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud import chunk_dao
from backend.src.app.kb.model import Chunk


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
            idx = int(chunk.get('chunk_index') if chunk.get('chunk_index') is not None else chunk_index)
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
