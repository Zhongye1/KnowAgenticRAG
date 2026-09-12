"""知识库注册表与生命周期服务（EagleRAG kb/registry.py + kb/lifecycle.py 迁移）。"""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud import (
    acl_audit_dao,
    chunk_dao,
    dedup_dao,
    doc_acl_dao,
    document_dao,
    kb_acl_dao,
    keyword_dao,
    knowledge_base_dao,
)
from backend.src.app.kb.model import KnowledgeBase
from backend.src.app.kb.schema.knowledge_base import KBCreateParam, KBUpdateParam
from backend.src.app.kb.service.acl.entries import acl_entry_service
from backend.src.app.kb.service.acl.resolver import Perm, perm_at_least, resolve_kb_perm, resolve_visible_kbs
from backend.src.app.kb.service.acl.scope import UserContext
from backend.src.app.kb.service.document_storage import delete_document_object, kb_parsed_object_key
from backend.src.app.kb.service.kb_stats_service import KnowledgeBaseStatsService
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.common.exception import errors
from backend.src.common.pagination import paging_data
from backend.src.database.milvus_kb_ops import (
    base_collection_names,
    delete_ragf_vectors_by_kb,
    delete_vectors_by_kb,
)


class KnowledgeBaseService:
    """知识库业务逻辑（资源级权限经 resolve_kb_perm，无权统一 404 不泄露存在性）。"""

    @staticmethod
    async def get_list(
        *,
        db: AsyncSession,
        user: UserContext,
        query: str | None = None,
        sort: str = 'recent',
    ) -> dict[str, Any]:
        """分页获取知识库列表（含实时统计；仅含当前用户可见库，default deny）。"""
        visible = await resolve_visible_kbs(db, user_id=user.user_id, dept_id=user.dept_id, roles=user.roles)
        stmt = await knowledge_base_dao.get_select(query=query, sort=sort, kb_names=visible)
        data = await paging_data(db, stmt)
        data['items'] = [await KnowledgeBaseService._with_stats(db=db, kb=kb) for kb in data['items']]
        return data

    @staticmethod
    async def get_detail(*, db: AsyncSession, kb_name: str, user: UserContext) -> dict[str, Any]:
        """获取单个知识库（含统计；无权与不存在同形态 404）。"""
        kb = await knowledge_base_dao.get(db, kb_name)
        if kb is None or not await KnowledgeBaseService._has_perm(
            db=db, kb_name=kb_name, user=user, threshold=Perm.READ
        ):
            raise errors.NotFoundError(msg='知识库不存在')
        return await KnowledgeBaseService._with_stats(db=db, kb=kb)

    @staticmethod
    async def _has_perm(*, db: AsyncSession, kb_name: str, user: UserContext, threshold: Perm) -> bool:
        """当前用户在 KB 上是否达到 threshold 级别。"""
        perm = await resolve_kb_perm(db, user_id=user.user_id, dept_id=user.dept_id, roles=user.roles, kb_name=kb_name)
        return perm_at_least(perm, threshold)

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
            'query_params': kb.query_params or {},
            'collections_used': kb.collections_used,
            'owner_id': kb.owner_id,
            'is_public': kb.is_public,
            'created_time': kb.created_time,
            'updated_time': kb.updated_time,
            **stats,
        }

    @staticmethod
    async def create(*, db: AsyncSession, obj: KBCreateParam, owner_id: str | None = None) -> KnowledgeBase:
        """创建知识库；同名（同域）冲突时 409；建库即 Owner（spec §7.1）。"""
        existing = await knowledge_base_dao.get(db, obj.kb_name)
        if existing is not None:
            raise errors.ConflictError(msg=f'知识库 {obj.kb_name} 已存在')
        kb = await knowledge_base_dao.create(db, obj, owner_id=owner_id)
        if owner_id is not None:
            await acl_entry_service.ensure_owner(
                db=db, kb_name=kb.kb_name, owner_id=owner_id, plugin_namespace=kb.plugin_namespace
            )
        return kb

    @staticmethod
    async def update(*, db: AsyncSession, kb_name: str, obj: KBUpdateParam, user: UserContext) -> KnowledgeBase:
        """更新知识库（仅 Owner；无权与不存在同形态 404）；is_public 变更留审计（spec §7.1）。"""
        kb = await knowledge_base_dao.get(db, kb_name)
        if kb is None or not await KnowledgeBaseService._has_perm(
            db=db, kb_name=kb_name, user=user, threshold=Perm.OWNER
        ):
            raise errors.NotFoundError(msg='知识库不存在')
        before_public = kb.is_public
        updated = await knowledge_base_dao.update(db, kb_name, obj)
        if updated is None:  # pragma: no cover - 前置已确认存在
            raise errors.NotFoundError(msg='知识库不存在')
        if obj.is_public is not None and obj.is_public != before_public:
            await acl_audit_dao.append(
                db,
                kb_name=kb_name,
                action='kb_public_update',
                before_json={'is_public': before_public},
                after_json={'is_public': updated.is_public},
                operator_id=user.user_id or None,
                plugin_namespace=updated.plugin_namespace,
            )
        return updated

    @staticmethod
    async def delete(*, db: AsyncSession, kb_name: str, user: UserContext) -> dict[str, int]:
        """级联删除知识库（仅 Owner）：Milvus 向量 → documents → dedup → keywords → 注册行。"""
        ns = instance_namespace()
        kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=ns)
        if kb is None or not await KnowledgeBaseService._has_perm(
            db=db, kb_name=kb_name, user=user, threshold=Perm.OWNER
        ):
            raise errors.NotFoundError(msg='知识库不存在')

        counts: dict[str, int] = {
            'milvus_text': 0,
            'milvus_visual': 0,
            'milvus_text_ragf': 0,
            'chunks': 0,
            'documents': 0,
            'dedup': 0,
            'keywords': 0,
            'kb_acl': 0,
            'doc_acl': 0,
            'objects': 0,
        }
        text_coll, visual_coll = base_collection_names()
        counts['milvus_text'] = delete_vectors_by_kb(text_coll, kb_name, plugin_namespace=ns)
        counts['milvus_visual'] = delete_vectors_by_kb(visual_coll, kb_name, plugin_namespace=ns)
        ragf_deleted = delete_ragf_vectors_by_kb(kb_name, plugin_namespace=ns)
        counts['milvus_text_ragf'] = sum(ragf_deleted.values())
        counts['chunks'] = await chunk_dao.delete_by_kb(db, kb_name, plugin_namespace=ns)
        object_keys = await dedup_dao.list_object_keys_by_kb(db, kb_name, plugin_namespace=ns)
        counts['objects'] = len(object_keys)
        for object_key in object_keys:
            await delete_document_object(object_key)
        for document_id in await document_dao.list_ids_by_kb(db, kb_name, plugin_namespace=ns):
            await delete_document_object(kb_parsed_object_key(ns, kb_name, document_id))
        counts['documents'] = await document_dao.delete_by_kb(db, kb_name, plugin_namespace=ns)
        counts['dedup'] = await dedup_dao.delete_by_kb(db, kb_name, plugin_namespace=ns)
        counts['keywords'] = await keyword_dao.delete_by_kb(db, kb_name, plugin_namespace=ns)
        counts['kb_acl'] = await kb_acl_dao.delete_by_kb(db, kb_name=kb_name, plugin_namespace=ns)
        counts['doc_acl'] = await doc_acl_dao.delete_by_kb(db, kb_name=kb_name, plugin_namespace=ns)
        await knowledge_base_dao.delete(db, kb_name, plugin_namespace=ns)
        return counts


kb_service = KnowledgeBaseService()
