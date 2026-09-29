"""文档批量操作 API（kb-落地改造清单 Phase 3 / D55 §3F 3.8）。

语义：**逐条处理，不整批回滚**——批量删/重摄取里单条失败（无权限、文档不存在、
状态不允许）不应把已成功的条目一起退掉。返回逐条结果 + 汇总计数，前端可据此只重试失败项。

注意路由注册顺序：`/documents/batch` 必须比 `/documents/{document_id}` 先注册，
否则 `batch` 会被当成 document_id 吃掉。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import APIRouter, Depends, Path

from backend.src.app.kb.crud import document_dao
from backend.src.app.kb.schema.preview import BatchDocumentParam, BatchItemResult, BatchResult
from backend.src.app.kb.service.acl.resolver import Perm, perm_at_least, resolve_kb_perm
from backend.src.app.kb.service.document_service import document_service
from backend.src.app.kb.utils.permissions import RAG_KB_INGEST, RAG_KB_MANAGE
from backend.src.app.task.celery import celery_app
from backend.src.common.log import log
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC

if TYPE_CHECKING:
    from backend.src.app.kb.deps import CurrentKbUser, CurrentNamespace
    from backend.src.database.db import CurrentSession, CurrentSessionTransaction

_PERM_INGEST = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_INGEST)), DependsRBAC]
_PERM_MANAGE = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_MANAGE)), DependsRBAC]

router = APIRouter()

_KB_NAME = Annotated[str, Path(description='知识库标识', pattern=r'^[a-z0-9_]+$')]


async def _has_perm(db: CurrentSession, kb_name: str, user: CurrentKbUser, threshold: Perm) -> bool:
    perm = await resolve_kb_perm(db, user_id=user.user_id, dept_id=user.dept_id, roles=user.roles, kb_name=kb_name)
    return perm_at_least(perm, threshold)


def _item(document_id: str, *, ok: bool, detail: str | None = None) -> BatchItemResult:
    """构造逐条结果。

    用 `model_validate` 而非构造器：`SchemaBase` 子类的 `Field(None, ...)` 默认值
    pyright 推断不出（仓库既有限制，`test_folder_pg` 同样规避）。
    """
    return BatchItemResult.model_validate({'document_id': document_id, 'ok': ok, 'detail': detail})


def _summarize(results: list[BatchItemResult]) -> BatchResult:
    succeeded = sum(1 for item in results if item.ok)
    return BatchResult.model_validate({
        'total': len(results),
        'succeeded': succeeded,
        'failed': len(results) - succeeded,
        'items': results,
    })


@router.delete('/batch', summary='批量删除文档（逐条结果，不整批回滚）', dependencies=_PERM_MANAGE)
async def batch_delete_documents(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    obj: BatchDocumentParam,
    user: CurrentKbUser,
) -> ResponseSchemaModel[BatchResult]:
    results: list[BatchItemResult] = []
    for document_id in obj.document_ids:
        doc = await document_dao.get(db, document_id)
        if doc is None:
            results.append(_item(document_id, ok=False, detail='文档不存在'))
            continue
        if not await _has_perm(db, doc.kb_name, user, Perm.MANAGE):
            results.append(_item(document_id, ok=False, detail='无权管理该文档'))
            continue
        try:
            await document_service.delete(db=db, document_id=document_id)
        except Exception as exc:
            log.warning('批量删除单条失败 doc={}: {}', document_id, exc)
            results.append(_item(document_id, ok=False, detail=str(exc)))
            continue
        results.append(_item(document_id, ok=True))
    return response_base.success(data=_summarize(results))


@router.post('/batch/reindex', summary='批量重新摄取（逐条结果，不整批回滚）', dependencies=_PERM_INGEST)
async def batch_reindex_documents(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    obj: BatchDocumentParam,
    user: CurrentKbUser,
) -> ResponseSchemaModel[BatchResult]:
    """重新入队既有摄取任务（幂等全量替换），不新建文档、不改元数据。"""
    results: list[BatchItemResult] = []
    for document_id in obj.document_ids:
        doc = await document_dao.get(db, document_id)
        if doc is None:
            results.append(_item(document_id, ok=False, detail='文档不存在'))
            continue
        if not await _has_perm(db, doc.kb_name, user, Perm.CONTRIBUTE):
            results.append(_item(document_id, ok=False, detail='无权摄取该文档'))
            continue
        try:
            celery_app.send_task(
                'ingest.process_document',
                args=[document_id, doc.kb_name, doc.plugin_namespace],
            )
        except Exception as exc:
            log.warning('批量重摄取派发失败 doc={}: {}', document_id, exc)
            results.append(_item(document_id, ok=False, detail=f'派发失败: {exc}'))
            continue
        results.append(_item(document_id, ok=True, detail='已入队'))
    return response_base.success(data=_summarize(results))
