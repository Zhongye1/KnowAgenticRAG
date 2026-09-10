"""RAG ACL 治理服务（agent-layer spec ACL 设计 §3/§8）。

KB 级 ACL 是查询期语义（allowed_kbs 求交），变更只动 DB；文档级 ACL 镜像在
Milvus 标量字段（visibility/owner_id/groups），变更后按主键 upsert 传播——
向量/内容原样复用，不需要重嵌入（§8.2）。

组 ID 引用 Admin 部门（``sys_dept.id``），本服务不校验组存在性（Admin 域职责）；
设 public 需要 ``rag:kb:manage`` 权限，由路由层 ``RequestPermission`` 强制。
"""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud import document_dao, kb_acl_dao, knowledge_base_dao
from backend.src.app.kb.crud.crud_acl import doc_acl_dao
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.database.milvus_kb_ops import update_ragf_document_acl


class AclService:
    """ACL 治理：KB 级授权组 + 文档级可见性/授权组（含 Milvus 传播）。"""

    # ------------------------------------------------------------------ KB 级
    @staticmethod
    async def get_kb_acl(*, db: AsyncSession, kb_name: str) -> dict[str, Any]:
        """查询 KB 已授权组列表（KB 不存在 → NotFound）。"""
        kb = await knowledge_base_dao.get(db, kb_name)
        if kb is None:
            raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
        return {'kb_name': kb_name, 'group_ids': await kb_acl_dao.list_kb_groups(db, kb_name=kb_name)}

    @staticmethod
    async def update_kb_acl(
        *, db: AsyncSession, kb_name: str, group_ids: list[str], created_by: str | None
    ) -> dict[str, Any]:
        """全量替换 KB 授权组（KB 级 ACL 是查询期语义，无 Milvus 传播）。"""
        kb = await knowledge_base_dao.get(db, kb_name)
        if kb is None:
            raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
        count = await kb_acl_dao.replace_kb_acl(db, kb_name=kb_name, group_ids=group_ids, created_by=created_by)
        log.info('KB ACL 更新 kb={} groups={} by={}', kb_name, count, created_by)
        return {'kb_name': kb_name, 'group_ids': await kb_acl_dao.list_kb_groups(db, kb_name=kb_name)}

    # ------------------------------------------------------------------ 文档级
    @staticmethod
    async def get_document_acl(*, db: AsyncSession, document_id: str) -> dict[str, Any]:
        """查询文档可见性 + 授权组列表（文档不存在 → NotFound）。"""
        doc = await document_dao.get(db, document_id)
        if doc is None:
            raise errors.NotFoundError(msg='文档不存在')
        return {
            'document_id': document_id,
            'kb_name': doc.kb_name,
            'visibility': str(doc.visibility or 'restricted'),
            'owner_id': doc.owner_id,
            'group_ids': await doc_acl_dao.list_document_groups(
                db, document_id=document_id, kb_name=doc.kb_name, plugin_namespace=doc.plugin_namespace
            ),
        }

    @staticmethod
    async def update_document_acl(
        *,
        db: AsyncSession,
        document_id: str,
        visibility: str | None = None,
        group_ids: list[str] | None = None,
        updated_by: str | None = None,
    ) -> dict[str, Any]:
        """更新文档 ACL（DB 为准 + Milvus 标量按主键 upsert 传播，§8.2）。

        visibility/group_ids 传 None = 保持不变；group_ids 提供即全量替换。
        """
        doc = await document_dao.get(db, document_id)
        if doc is None:
            raise errors.NotFoundError(msg='文档不存在')

        if visibility is not None:
            doc.visibility = visibility
        if group_ids is not None:
            await doc_acl_dao.replace_document_acl(
                db,
                document_id=document_id,
                kb_name=doc.kb_name,
                group_ids=group_ids,
                created_by=updated_by,
                plugin_namespace=doc.plugin_namespace,
            )
        await db.flush()

        # Milvus 传播（镜像字段；失败不回滚 DB——source-of-truth 已更新，可重试/重建收敛）
        effective_groups = (
            group_ids
            if group_ids is not None
            else await doc_acl_dao.list_document_groups(
                db, document_id=document_id, kb_name=doc.kb_name, plugin_namespace=doc.plugin_namespace
            )
        )
        updated_rows = await _propagate_acl(
            kb_name=doc.kb_name,
            document_id=document_id,
            plugin_namespace=doc.plugin_namespace,
            visibility=str(doc.visibility or 'restricted'),
            owner_id=doc.owner_id or '',
            groups=effective_groups,
        )
        log.info(
            '文档 ACL 更新 doc={} kb={} visibility={} groups={} milvus_rows={} by={}',
            document_id,
            doc.kb_name,
            doc.visibility,
            len(effective_groups),
            updated_rows,
            updated_by,
        )
        return {
            'document_id': document_id,
            'kb_name': doc.kb_name,
            'visibility': str(doc.visibility or 'restricted'),
            'owner_id': doc.owner_id,
            'group_ids': effective_groups,
            'milvus_updated_rows': updated_rows,
        }


async def _propagate_acl(
    *,
    kb_name: str,
    document_id: str,
    plugin_namespace: str,
    visibility: str,
    owner_id: str,
    groups: list[str],
) -> int:
    """文档 ACL → Milvus 标量 upsert（IO 阻塞走线程，DB 会话不参与）。

    同步传播到文本模板集合与 ragf_visual 视觉集合（双管线摄取 spec D7：
    两集合 ACL 镜像字段同规）。
    """
    import asyncio

    from backend.src.database.milvus_visual_ops import update_visual_document_acl

    ns = instance_namespace(plugin_namespace)

    async def _propagate_text() -> int:
        return await asyncio.to_thread(
            lambda: update_ragf_document_acl(
                kb_name,
                document_id,
                visibility=visibility,
                owner_id=owner_id,
                groups=groups[:32],  # 对齐 Milvus groups max_capacity
                plugin_namespace=ns,
            )
        )

    async def _propagate_visual() -> int:
        return await asyncio.to_thread(
            lambda: update_visual_document_acl(
                kb_name,
                document_id,
                visibility=visibility,
                owner_id=owner_id,
                groups=groups[:32],
                plugin_namespace=ns,
            )
        )

    updated = await _propagate_text()
    try:
        updated += await _propagate_visual()
    except Exception as exc:
        log.warning('视觉集合 ACL 传播失败 kb={} doc={}: {}', kb_name, document_id, exc)
    return updated


acl_service = AclService()
