"""ACL 条目读写领域语义（kb-ownership-and-acl-v2 spec §5.3 entries.py）。

DB 为 source-of-truth：KB 级 ACL 是查询期语义（求值函数消费），变更只动 DB；
文档级 ACL 镜像在 Milvus 标量字段（visibility/owner_id/groups），变更后按主键
upsert 传播——向量/内容原样复用，不需要重嵌入。

所有授权变更（含建库写 Owner）在同一事务追加 rag_acl_audit 审计（D48）。
"""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud import document_dao, knowledge_base_dao
from backend.src.app.kb.crud.crud_acl import doc_acl_dao, kb_acl_dao
from backend.src.app.kb.crud.crud_acl_audit import acl_audit_dao
from backend.src.app.kb.model.acl import DocAcl, KbAcl
from backend.src.app.kb.schema.acl import DocAclEntry, KBAclEntry
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.database.milvus_kb_ops import update_ragf_document_acl

_AUDIT_ACTIONS_KB_ACL = 'kb_acl_update'
_AUDIT_ACTIONS_DOC_ACL = 'doc_acl_update'
_AUDIT_ACTIONS_OWNER_INIT = 'kb_owner_init'


def _entry_snapshot(*entries: KbAcl | DocAcl | KBAclEntry | DocAclEntry) -> list[dict[str, Any]]:
    """条目 → 审计快照（datetime 统一 isoformat，保证 JSON 可序列化）。"""

    def _dump(entry: Any) -> dict[str, Any]:
        expires = getattr(entry, 'expires_at', None)
        return {
            'principal_type': entry.principal_type,
            'principal_id': entry.principal_id,
            'perm': entry.perm,
            'effect': entry.effect,
            'expires_at': expires.isoformat() if expires else None,
        }

    return [_dump(entry) for entry in entries]


class AclEntryService:
    """ACL 条目治理：KB 级条目 + 文档级可见性/条目（含 Milvus 传播与审计）。"""

    # ------------------------------------------------------------------ KB 级
    @staticmethod
    async def get_kb_acl(*, db: AsyncSession, kb_name: str) -> dict[str, Any]:
        """查询 KB 授权条目列表（KB 不存在 → NotFound）。"""
        kb = await knowledge_base_dao.get(db, kb_name)
        if kb is None:
            raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
        entries = await kb_acl_dao.list_entries(db, kb_name=kb_name, plugin_namespace=kb.plugin_namespace)
        return {'kb_name': kb_name, 'entries': _entry_snapshot(*entries)}

    @staticmethod
    async def update_kb_acl(
        *,
        db: AsyncSession,
        kb_name: str,
        entries: list[KBAclEntry],
        operator_id: str | None,
    ) -> dict[str, Any]:
        """全量替换 KB 授权条目 + 审计（KB 级 ACL 是查询期语义，无 Milvus 传播）。"""
        kb = await knowledge_base_dao.get(db, kb_name)
        if kb is None:
            raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
        before = _entry_snapshot(
            *(await kb_acl_dao.list_entries(db, kb_name=kb_name, plugin_namespace=kb.plugin_namespace))
        )
        await kb_acl_dao.replace_entries(
            db, kb_name=kb_name, entries=entries, created_by=operator_id, plugin_namespace=kb.plugin_namespace
        )
        after = _entry_snapshot(
            *(await kb_acl_dao.list_entries(db, kb_name=kb_name, plugin_namespace=kb.plugin_namespace))
        )
        await acl_audit_dao.append(
            db,
            kb_name=kb_name,
            action=_AUDIT_ACTIONS_KB_ACL,
            before_json={'entries': before},
            after_json={'entries': after},
            operator_id=operator_id,
            plugin_namespace=kb.plugin_namespace,
        )
        log.info('KB ACL 更新 kb={} entries={} by={}', kb_name, len(after), operator_id)
        return {'kb_name': kb_name, 'entries': after}

    @staticmethod
    async def ensure_owner(
        *,
        db: AsyncSession,
        kb_name: str,
        owner_id: str,
        plugin_namespace: str | None = None,
    ) -> None:
        """建库即 Owner：写入 owner 授权条目 + 审计（与建库同事务，spec §7.1）。"""
        await kb_acl_dao.replace_entries(
            db,
            kb_name=kb_name,
            entries=[KBAclEntry(principal_type='user', principal_id=owner_id, perm='owner')],
            created_by=owner_id,
            plugin_namespace=plugin_namespace,
        )
        await acl_audit_dao.append(
            db,
            kb_name=kb_name,
            action=_AUDIT_ACTIONS_OWNER_INIT,
            principal_type='user',
            principal_id=owner_id,
            perm='owner',
            effect='allow',
            operator_id=owner_id,
            plugin_namespace=plugin_namespace,
        )
        log.info('KB Owner 落地 kb={} owner={}', kb_name, owner_id)

    # ------------------------------------------------------------------ 文档级
    @staticmethod
    async def get_document_acl(*, db: AsyncSession, document_id: str) -> dict[str, Any]:
        """查询文档可见性 + 授权条目列表（文档不存在 → NotFound）。"""
        doc = await document_dao.get(db, document_id)
        if doc is None:
            raise errors.NotFoundError(msg='文档不存在')
        entries = await doc_acl_dao.list_entries(
            db, document_id=document_id, kb_name=doc.kb_name, plugin_namespace=doc.plugin_namespace
        )
        return {
            'document_id': document_id,
            'kb_name': doc.kb_name,
            'visibility': str(doc.visibility or 'restricted'),
            'owner_id': doc.owner_id,
            'entries': _entry_snapshot(*entries),
        }

    @staticmethod
    async def update_document_acl(
        *,
        db: AsyncSession,
        document_id: str,
        visibility: str | None = None,
        entries: list[DocAclEntry] | None = None,
        updated_by: str | None = None,
    ) -> dict[str, Any]:
        """更新文档 ACL（DB 为准 + Milvus 标量按主键 upsert 传播 + 审计）。

        visibility/entries 传 None = 保持不变；entries 提供即全量替换。
        """
        doc = await document_dao.get(db, document_id)
        if doc is None:
            raise errors.NotFoundError(msg='文档不存在')

        before = _entry_snapshot(
            *(
                await doc_acl_dao.list_entries(
                    db, document_id=document_id, kb_name=doc.kb_name, plugin_namespace=doc.plugin_namespace
                )
            )
        )
        if visibility is not None:
            doc.visibility = visibility
        if entries is not None:
            await doc_acl_dao.replace_entries(
                db,
                document_id=document_id,
                kb_name=doc.kb_name,
                entries=entries,
                created_by=updated_by,
                plugin_namespace=doc.plugin_namespace,
            )
        await db.flush()
        after_models = await doc_acl_dao.list_entries(
            db, document_id=document_id, kb_name=doc.kb_name, plugin_namespace=doc.plugin_namespace
        )
        after = _entry_snapshot(*after_models)
        await acl_audit_dao.append(
            db,
            kb_name=doc.kb_name,
            action=_AUDIT_ACTIONS_DOC_ACL,
            document_id=document_id,
            before_json={'visibility': visibility, 'entries': before} if visibility or entries else None,
            after_json={'visibility': doc.visibility, 'entries': after},
            operator_id=updated_by,
            plugin_namespace=doc.plugin_namespace,
        )

        # Milvus 传播（镜像字段；失败不回滚 DB——source-of-truth 已更新，可重试/对账收敛）
        mirror_principals = [entry.principal_id for entry in after_models]
        updated_rows = await _propagate_acl(
            kb_name=doc.kb_name,
            document_id=document_id,
            plugin_namespace=doc.plugin_namespace,
            visibility=str(doc.visibility or 'restricted'),
            owner_id=doc.owner_id or '',
            principals=mirror_principals,
        )
        log.info(
            '文档 ACL 更新 doc={} kb={} visibility={} entries={} milvus_rows={} by={}',
            document_id,
            doc.kb_name,
            doc.visibility,
            len(after),
            updated_rows,
            updated_by,
        )
        return {
            'document_id': document_id,
            'kb_name': doc.kb_name,
            'visibility': str(doc.visibility or 'restricted'),
            'owner_id': doc.owner_id,
            'entries': after,
            'milvus_updated_rows': updated_rows,
        }


async def _propagate_acl(
    *,
    kb_name: str,
    document_id: str,
    plugin_namespace: str,
    visibility: str,
    owner_id: str,
    principals: list[str],
) -> int:
    """文档 ACL → Milvus 标量 upsert（IO 阻塞走线程，DB 会话不参与）。

    同步传播到文本模板集合与 ragf_visual 视觉集合（双管线摄取 spec D7：
    两集合 ACL 镜像字段同规）。user/dept 主体 ID 统一落入 groups 数组——
    查询侧主体展开同样把 user_id 放进主体集合，两侧语义对齐。
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
                groups=principals[:32],  # 对齐 Milvus groups max_capacity
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
                groups=principals[:32],
                plugin_namespace=ns,
            )
        )

    updated = await _propagate_text()
    try:
        updated += await _propagate_visual()
    except Exception as exc:
        log.warning('视觉集合 ACL 传播失败 kb={} doc={}: {}', kb_name, document_id, exc)
    return updated


acl_entry_service = AclEntryService()
