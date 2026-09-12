"""RAG ACL 管理 API（kb-ownership-and-acl-v2 spec §5.2）。

- KB 级：GET/PUT ``/knowledge_bases/{kb_name}/acl``（授权条目全量替换）
- 文档级：GET/PUT ``/documents/{document_id}/acl``（visibility + 授权条目）

功能码 + 资源级校验双层（D49/D50）：GET acl 需 KB >= manage；PUT acl 需
``rag:kb:acl`` 功能码且逐库 == owner；文档 ACL 需 KB >= manage。资源级校验在
service 层（acl/entries.py），无权与不存在同形态 404。
"""

from typing import Annotated, cast

from fastapi import APIRouter, Depends, Path, Request
from starlette.authentication import UnauthenticatedUser

from backend.src.app.kb.deps import CurrentKbUser
from backend.src.app.kb.schema.acl import DocAclDetail, DocAclUpdateParam, KBAclDetail, KBAclUpdateParam
from backend.src.app.kb.service.acl.entries import acl_entry_service
from backend.src.app.kb.utils.permissions import RAG_KB_ACL, RAG_KB_LIST, RAG_KB_MANAGE, RAG_KB_READ
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.database.db import CurrentSession, CurrentSessionTransaction

kb_acl_router = APIRouter(dependencies=[DependsJwtAuth])
doc_acl_router = APIRouter(dependencies=[DependsJwtAuth])

_MANAGE_ACL = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_MANAGE)), DependsRBAC]  # 顺序：先鉴权码后 RBAC
_KB_ACL_READ = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_LIST)), DependsRBAC]
_DOC_ACL_READ = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_READ)), DependsRBAC]
_KB_ACL_WRITE = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_ACL)), DependsRBAC]


def _operator_id(request: Request) -> str | None:
    """操作人 ID（审计字段；JWT 依赖保证已认证，测试替身场景容错为 None）。"""
    return None if isinstance(request.user, UnauthenticatedUser) else str(request.user.id)


@kb_acl_router.get('/{kb_name}/acl', summary='查询知识库授权条目', dependencies=_KB_ACL_READ)
async def get_kb_acl(
    db: CurrentSession,
    kb_name: Annotated[str, Path(description='知识库标识', pattern=r'^[a-z0-9_]+$')],
    user: CurrentKbUser,
) -> ResponseSchemaModel[KBAclDetail]:
    data = await acl_entry_service.get_kb_acl(db=db, kb_name=kb_name, user=user)
    return response_base.success(data=KBAclDetail.model_validate(data))


@kb_acl_router.put('/{kb_name}/acl', summary='更新知识库授权条目（全量替换，仅 Owner）', dependencies=_KB_ACL_WRITE)
async def update_kb_acl(
    request: Request,
    db: CurrentSessionTransaction,
    kb_name: Annotated[str, Path(description='知识库标识', pattern=r'^[a-z0-9_]+$')],
    obj: KBAclUpdateParam,
    user: CurrentKbUser,
) -> ResponseSchemaModel[KBAclDetail]:
    data = await acl_entry_service.update_kb_acl(
        db=db, kb_name=kb_name, entries=obj.entries, operator_id=_operator_id(request), user=user
    )
    return response_base.success(data=KBAclDetail.model_validate(data))


@doc_acl_router.get('/{document_id}/acl', summary='查询文档可见性与授权条目', dependencies=_DOC_ACL_READ)
async def get_document_acl(
    db: CurrentSession,
    document_id: Annotated[str, Path(description='文档 ID')],
    user: CurrentKbUser,
) -> ResponseSchemaModel[DocAclDetail]:
    data = await acl_entry_service.get_document_acl(db=db, document_id=document_id, user=user)
    return response_base.success(data=DocAclDetail.model_validate(data))


@doc_acl_router.put('/{document_id}/acl', summary='更新文档 ACL（DB 为准 + Milvus 传播）', dependencies=_MANAGE_ACL)
async def update_document_acl(
    request: Request,
    db: CurrentSessionTransaction,
    document_id: Annotated[str, Path(description='文档 ID')],
    obj: DocAclUpdateParam,
    user: CurrentKbUser,
) -> ResponseSchemaModel[DocAclDetail]:
    data = await acl_entry_service.update_document_acl(
        db=db,
        document_id=document_id,
        visibility=obj.visibility,
        entries=obj.entries,
        updated_by=_operator_id(request),
        user=user,
    )
    return cast('ResponseSchemaModel[DocAclDetail]', response_base.success(data=DocAclDetail.model_validate(data)))
