"""知识导图服务（kb-落地改造清单 Phase 4 / 4.2）。

由既有的 `documents.structure`（Knowhere `doc_nav` 章节树）聚合出以文档为根的森林，
**不新增存储**。Yuxi 为此单开 `mindmap` / `mindmap_file_ids` / `mindmap_metadata`
三列 + 生成任务 + diff 接口；本项目的解析产物已经够用，不需要那套。

聚合算法本身是纯函数，在 `kb/utils/mindmap.py`；本模块只负责取数与装配。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.src.app.kb.crud import document_dao
from backend.src.app.kb.utils.mindmap import build_mindmap

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['MindmapService', 'mindmap_service']


class MindmapService:
    """知识导图（由既有 documents.structure 聚合，无新存储）。"""

    @staticmethod
    async def get_mindmap(
        *,
        db: AsyncSession,
        kb_name: str,
        max_nodes: int | None = None,
    ) -> dict[str, Any]:
        """返回以文档为根的导图森林 + 汇总。

        `structure` 为空的文档只剩根节点，整体自然退化为平铺文档列表（4.2 验收）。
        """
        docs = await document_dao.select_models_scoped(db, kb_name=kb_name)
        rows = [
            {
                'document_id': doc.document_id,
                'name': doc.name,
                'status': doc.status,
                'chunk_count': doc.chunk_count,
                'structure': doc.structure,
            }
            for doc in docs
        ]
        forest = build_mindmap(rows, max_nodes=max_nodes) if max_nodes is not None else build_mindmap(rows)
        return {
            'kb_name': kb_name,
            'documents': len(rows),
            'with_structure': sum(1 for row in rows if row['structure']),
            'nodes': forest,
        }


mindmap_service = MindmapService()
