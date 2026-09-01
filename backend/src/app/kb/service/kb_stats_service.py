"""知识库统计服务（EagleRAG kb/stats.py 迁移）。"""

from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud import document_dao, knowledge_base_dao
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.database.milvus_kb_ops import (
    base_collection_names,
    count_all_entities,
    count_entities_by_kb,
    list_present_collections,
)


class KnowledgeBaseStatsService:
    """知识库统计业务逻辑。"""

    @staticmethod
    async def get_kb_stats(
        *,
        db: AsyncSession,
        kb_name: str,
        plugin_namespace: str | None = None,
    ) -> dict[str, int]:
        """单个知识库统计：文档数 + 文本/视觉向量数。"""
        ns = instance_namespace(plugin_namespace)
        documents = await document_dao.count_by_kb(db, kb_name, plugin_namespace=ns)
        text_coll, visual_coll = base_collection_names()
        return {
            'documents': documents,
            'text_vectors': count_entities_by_kb(text_coll, kb_name, plugin_namespace=ns),
            'visual_vectors': count_entities_by_kb(visual_coll, kb_name, plugin_namespace=ns),
        }

    @staticmethod
    async def get_overview(*, db: AsyncSession) -> dict[str, int]:
        """跨知识库聚合。"""
        ns = instance_namespace()
        total_kbs = await knowledge_base_dao.count(db, plugin_namespace=ns)
        total_documents = await document_dao.count(db, plugin_namespace=ns)
        text_coll, visual_coll = base_collection_names()
        return {
            'total_kbs': total_kbs,
            'total_documents': total_documents,
            'total_text_vectors': count_all_entities(text_coll, plugin_namespace=ns),
            'total_visual_vectors': count_all_entities(visual_coll, plugin_namespace=ns),
        }

    @staticmethod
    async def get_collections(
        *,
        db: AsyncSession,
        kb_name: str,
        plugin_namespace: str | None = None,
    ) -> list[dict[str, int | str]]:
        """KB 内各集合实体数（含已存在但为空的集合）。"""
        ns = instance_namespace(plugin_namespace)
        kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=ns)
        if kb is None:
            return []
        collections = list(dict.fromkeys([*base_collection_names(), *kb.collections_used]))
        return [
            {'collection': coll, 'count': count_entities_by_kb(coll, kb_name, plugin_namespace=ns)}
            for coll in collections
        ]

    @staticmethod
    async def get_format_distribution(
        *,
        db: AsyncSession,
        kb_name: str,
        plugin_namespace: str | None = None,
    ) -> list[dict[str, int | str]]:
        """文件类型分布。"""
        rows = await document_dao.format_distribution(db, kb_name, plugin_namespace=plugin_namespace)
        return [{'source_type': row[0], 'count': row[1]} for row in rows]

    @staticmethod
    async def get_ingestion_volume(
        *,
        db: AsyncSession,
        kb_name: str,
        plugin_namespace: str | None = None,
        days: int = 30,
    ) -> list[dict[str, int | str]]:
        """摄入时间序列。"""
        rows = await document_dao.ingestion_volume(db, kb_name, plugin_namespace=plugin_namespace, days=days)
        return [{'date': row[0], 'count': row[1]} for row in rows]

    @staticmethod
    async def get_facets(
        *,
        db: AsyncSession,
        kb_name: str,
        plugin_namespace: str | None = None,
    ) -> list[dict[str, int | str]]:
        """source_type / pipeline / status 分面。"""
        return await document_dao.facets(db, kb_name, plugin_namespace=plugin_namespace)

    @staticmethod
    async def get_all_collections(*, plugin_namespace: str | None = None) -> list[str]:
        """实例域内全部集合（供前端展示）。"""
        return list_present_collections(plugin_namespace=plugin_namespace)


kb_stats_service = KnowledgeBaseStatsService()
