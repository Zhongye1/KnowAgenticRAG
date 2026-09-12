"""知识库管理 API（EagleRAG api/knowledge_bases.py 迁移）。"""

from typing import Annotated, cast

from fastapi import APIRouter, Depends, Path, Query, Request
from starlette.authentication import UnauthenticatedUser

from backend.src.app.kb.deps import CurrentKbUser, CurrentNamespace
from backend.src.app.kb.schema.knowledge_base import (
    KBCollectionsItem,
    KBCreateParam,
    KBDeleteResponse,
    KBDetail,
    KBFacetItem,
    KBFormatDistributionItem,
    KBIngestionVolumeItem,
    KBItem,
    KBOverview,
    KBUpdateParam,
)
from backend.src.app.kb.service.acl.resolver import resolve_visible_kbs
from backend.src.app.kb.service.kb_service import kb_service
from backend.src.app.kb.service.kb_stats_service import kb_stats_service
from backend.src.app.kb.utils.permissions import RAG_KB_CREATE, RAG_KB_LIST, RAG_KB_MANAGE
from backend.src.common.pagination import DependsPagination, PageData
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.database.db import CurrentSession, CurrentSessionTransaction

_PERM_LIST = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_LIST)), DependsRBAC]
_PERM_MANAGE = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_MANAGE)), DependsRBAC]
_PERM_CREATE = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_CREATE)), DependsRBAC]

router = APIRouter()


@router.get(
    '', summary='知识库列表（仅含当前用户可见库，default deny）', dependencies=[*(_PERM_LIST), DependsPagination]
)
async def get_knowledge_bases(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    user: CurrentKbUser,
    query: Annotated[str | None, Query(description='搜索关键词')] = None,
    sort: Annotated[str, Query(pattern='^(recent|name)$', description='排序')] = 'recent',
) -> ResponseSchemaModel[PageData[KBItem]]:
    data = await kb_service.get_list(db=db, user=user, query=query, sort=sort)
    data['items'] = [KBItem.model_validate(item) for item in data['items']]
    return cast('ResponseSchemaModel[PageData[KBItem]]', response_base.success(data=data))


@router.get('/overview', summary='跨知识库聚合', dependencies=_PERM_LIST)
async def get_knowledge_bases_overview(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    user: CurrentKbUser,
) -> ResponseSchemaModel[KBOverview]:
    visible = await resolve_visible_kbs(db, user_id=user.user_id, dept_id=user.dept_id, roles=user.roles)
    data = await kb_stats_service.get_overview(db=db, kb_names=visible)
    return response_base.success(data=KBOverview.model_validate(data))


@router.post('', summary='创建知识库', dependencies=_PERM_CREATE)
async def create_knowledge_base(
    request: Request,
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    obj: KBCreateParam,
    user: CurrentKbUser,
) -> ResponseSchemaModel[KBDetail]:
    owner_id = None if isinstance(request.user, UnauthenticatedUser) else str(request.user.id)
    kb = await kb_service.create(db=db, obj=obj, owner_id=owner_id)
    detail = await kb_service.get_detail(db=db, kb_name=kb.kb_name, user=user)
    return response_base.success(data=KBDetail.model_validate(detail))


@router.get('/{kb_name}', summary='知识库详情', dependencies=_PERM_LIST)
async def get_knowledge_base(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
    user: CurrentKbUser,
) -> ResponseSchemaModel[KBDetail]:
    data = await kb_service.get_detail(db=db, kb_name=kb_name, user=user)
    return response_base.success(data=KBDetail.model_validate(data))


@router.patch('/{kb_name}', summary='更新知识库', dependencies=_PERM_MANAGE)
async def update_knowledge_base(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
    obj: KBUpdateParam,
    user: CurrentKbUser,
) -> ResponseSchemaModel[KBDetail]:
    await kb_service.update(db=db, kb_name=kb_name, obj=obj, user=user)
    detail = await kb_service.get_detail(db=db, kb_name=kb_name, user=user)
    return response_base.success(data=KBDetail.model_validate(detail))


@router.delete('/{kb_name}', summary='级联删除知识库', dependencies=_PERM_MANAGE)
async def delete_knowledge_base(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
    user: CurrentKbUser,
) -> ResponseSchemaModel[KBDeleteResponse]:
    counts = await kb_service.delete(db=db, kb_name=kb_name, user=user)
    return response_base.success(data=KBDeleteResponse(deleted=True, counts=counts))


@router.get(
    '/{kb_name}/format-distribution',
    summary='文件类型分布',
    dependencies=_PERM_LIST,
)
async def get_knowledge_base_format_distribution(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
    user: CurrentKbUser,
) -> ResponseSchemaModel[list[KBFormatDistributionItem]]:
    await kb_service.get_detail(db=db, kb_name=kb_name, user=user)
    data = await kb_stats_service.get_format_distribution(db=db, kb_name=kb_name)
    return response_base.success(data=[KBFormatDistributionItem.model_validate(item) for item in data])


@router.get(
    '/{kb_name}/ingestion-volume',
    summary='摄入时间序列',
    dependencies=_PERM_LIST,
)
async def get_knowledge_base_ingestion_volume(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
    user: CurrentKbUser,
    days: Annotated[int, Query(ge=1, le=90, description='天数')] = 30,
) -> ResponseSchemaModel[list[KBIngestionVolumeItem]]:
    await kb_service.get_detail(db=db, kb_name=kb_name, user=user)
    data = await kb_stats_service.get_ingestion_volume(db=db, kb_name=kb_name, days=days)
    return response_base.success(data=[KBIngestionVolumeItem.model_validate(item) for item in data])


@router.get(
    '/{kb_name}/collections',
    summary='集合统计',
    dependencies=_PERM_LIST,
)
async def get_knowledge_base_collections(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
    user: CurrentKbUser,
) -> ResponseSchemaModel[list[KBCollectionsItem]]:
    await kb_service.get_detail(db=db, kb_name=kb_name, user=user)
    data = await kb_stats_service.get_collections(db=db, kb_name=kb_name)
    return response_base.success(data=[KBCollectionsItem.model_validate(item) for item in data])


@router.get('/{kb_name}/facets', summary='分面统计', dependencies=_PERM_LIST)
async def get_knowledge_base_facets(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
    user: CurrentKbUser,
) -> ResponseSchemaModel[list[KBFacetItem]]:
    await kb_service.get_detail(db=db, kb_name=kb_name, user=user)
    data = await kb_stats_service.get_facets(db=db, kb_name=kb_name)
    return response_base.success(data=[KBFacetItem.model_validate(item) for item in data])
