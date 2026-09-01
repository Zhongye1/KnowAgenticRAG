"""知识库注册表与生命周期服务（EagleRAG kb/registry.py + kb/lifecycle.py 迁移）。"""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud import dedup_dao, document_dao, keyword_dao, knowledge_base_dao
from backend.src.app.kb.model import KnowledgeBase
from backend.src.app.kb.schema.knowledge_base import KBCreateParam, KBUpdateParam
from backend.src.app.kb.service.document_storage import delete_document_object
from backend.src.app.kb.service.kb_stats_service import KnowledgeBaseStatsService
from backend.src.app.kb.service.namespace import instance_namespace
from backend.src.common.exception import errors
from backend.src.common.pagination import paging_data
from backend.src.database.milvus_kb_ops import base_collection_names, delete_vectors_by_kb


class KnowledgeBaseService:
    """知识库业务逻辑。"""

    @staticmethod
    async def get_list(
        *,
        db: AsyncSession,
        query: str | None = None,
        sort: str = 'recent',
    ) -> dict[str, Any]:
        """分页获取知识库列表（含实时统计）。"""
        stmt = await knowledge_base_dao.get_select(query=query, sort=sort)
        data = await paging_data(db, stmt)
        data['items'] = [await KnowledgeBaseService._with_stats(db=db, kb=kb) for kb in data['items']]
        return data

    @staticmethod
    async def get_detail(*, db: AsyncSession, kb_name: str) -> dict[str, Any]:
        """获取单个知识库（含统计）。"""
        kb = await knowledge_base_dao.get(db, kb_name)
        if kb is None:
            raise errors.NotFoundError(msg='知识库不存在')
        return await KnowledgeBaseService._with_stats(db=db, kb=kb)

    @staticmethod
    async def _with_stats(*, db: AsyncSession, kb: KnowledgeBase) -> dict[str, Any]:
        """给 KB 记录附加实时统计。"""
        stats = await KnowledgeBaseStatsService.get_kb_stats(db=db, kb_name=kb.kb_name)
        return {
            'kb_name': kb.kb_name,
            'plugin_namespace': kb.plugin_namespace,
            'display_name': kb.display_name,
            'description': kb.description,
            'theme': kb.theme,
            'icon': kb.icon,
            'pdf_text_page_ratio': kb.pdf_text_page_ratio,
            'embedding_model': kb.embedding_model,
            'collections_used': kb.collections_used,
            'created_time': kb.created_time,
            'updated_time': kb.updated_time,
            **stats,
        }

    @staticmethod
    async def create(*, db: AsyncSession, obj: KBCreateParam) -> KnowledgeBase:
        """创建知识库；同名（同域）冲突时 409。"""
        existing = await knowledge_base_dao.get(db, obj.kb_name)
        if existing is not None:
            raise errors.ConflictError(msg=f'知识库 {obj.kb_name} 已存在')
        return await knowledge_base_dao.create(db, obj)

    @staticmethod
    async def update(*, db: AsyncSession, kb_name: str, obj: KBUpdateParam) -> KnowledgeBase:
        """更新知识库。"""
        kb = await knowledge_base_dao.update(db, kb_name, obj)
        if kb is None:
            raise errors.NotFoundError(msg='知识库不存在')
        return kb

    @staticmethod
    async def delete(*, db: AsyncSession, kb_name: str) -> dict[str, int]:
        """级联删除知识库：Milvus 向量 → documents → dedup → keywords → 注册行。"""
        ns = instance_namespace()
        kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=ns)
        if kb is None:
            raise errors.NotFoundError(msg='知识库不存在')

        counts: dict[str, int] = {
            'milvus_text': 0,
            'milvus_visual': 0,
            'documents': 0,
            'dedup': 0,
            'keywords': 0,
            'objects': 0,
        }
        text_coll, visual_coll = base_collection_names()
        counts['milvus_text'] = delete_vectors_by_kb(text_coll, kb_name, plugin_namespace=ns)
        counts['milvus_visual'] = delete_vectors_by_kb(visual_coll, kb_name, plugin_namespace=ns)
        object_keys = await dedup_dao.list_object_keys_by_kb(db, kb_name, plugin_namespace=ns)
        counts['objects'] = len(object_keys)
        for object_key in object_keys:
            await delete_document_object(object_key)
        counts['documents'] = await document_dao.delete_by_kb(db, kb_name, plugin_namespace=ns)
        counts['dedup'] = await dedup_dao.delete_by_kb(db, kb_name, plugin_namespace=ns)
        counts['keywords'] = await keyword_dao.delete_by_kb(db, kb_name, plugin_namespace=ns)
        await knowledge_base_dao.delete(db, kb_name, plugin_namespace=ns)
        return counts

    @staticmethod
    async def rebuild(*, db: AsyncSession, kb_name: str) -> None:
        """重建索引（依赖 RAG 摄取层，当前未接入时返回明确错误）。"""
        kb = await knowledge_base_dao.get(db, kb_name)
        if kb is None:
            raise errors.NotFoundError(msg='知识库不存在')
        raise errors.RequestError(msg='重建索引依赖 RAG 摄取层，当前 KB 模块未接入嵌入管线')


kb_service = KnowledgeBaseService()
