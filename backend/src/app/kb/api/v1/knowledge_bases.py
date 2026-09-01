"""知识库管理 API（EagleRAG api/knowledge_bases.py 迁移）。"""

from typing import Annotated, cast

from fastapi import APIRouter, Path, Query

from backend.src.app.kb.deps import CurrentNamespace
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
from backend.src.app.kb.service.kb_service import kb_service
from backend.src.app.kb.service.kb_stats_service import kb_stats_service
from backend.src.common.pagination import DependsPagination, PageData
from backend.src.common.response.response_schema import ResponseModel, ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.database.db import CurrentSession, CurrentSessionTransaction

router = APIRouter()


@router.get('/knowledge_bases', summary='知识库列表', dependencies=[DependsJwtAuth, DependsPagination])
async def get_knowledge_bases(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    query: Annotated[str | None, Query(description='搜索关键词')] = None,
    sort: Annotated[str, Query(pattern='^(recent|name)$', description='排序')] = 'recent',
) -> ResponseSchemaModel[PageData[KBItem]]:
    data = await kb_service.get_list(db=db, query=query, sort=sort)
    data['items'] = [KBItem.model_validate(item) for item in data['items']]
    return cast('ResponseSchemaModel[PageData[KBItem]]', response_base.success(data=data))


@router.get('/knowledge_bases/overview', summary='跨知识库聚合', dependencies=[DependsJwtAuth])
async def get_knowledge_bases_overview(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
) -> ResponseSchemaModel[KBOverview]:
    data = await kb_stats_service.get_overview(db=db)
    return response_base.success(data=KBOverview.model_validate(data))


@router.post('/knowledge_bases', summary='创建知识库', dependencies=[DependsJwtAuth])
async def create_knowledge_base(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    obj: KBCreateParam,
) -> ResponseSchemaModel[KBDetail]:
    kb = await kb_service.create(db=db, obj=obj)
    detail = await kb_service.get_detail(db=db, kb_name=kb.kb_name)
    return response_base.success(data=KBDetail.model_validate(detail))


@router.get('/knowledge_bases/{kb_name}', summary='知识库详情', dependencies=[DependsJwtAuth])
async def get_knowledge_base(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
) -> ResponseSchemaModel[KBDetail]:
    data = await kb_service.get_detail(db=db, kb_name=kb_name)
    return response_base.success(data=KBDetail.model_validate(data))


@router.patch('/knowledge_bases/{kb_name}', summary='更新知识库', dependencies=[DependsJwtAuth])
async def update_knowledge_base(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
    obj: KBUpdateParam,
) -> ResponseSchemaModel[KBDetail]:
    await kb_service.update(db=db, kb_name=kb_name, obj=obj)
    detail = await kb_service.get_detail(db=db, kb_name=kb_name)
    return response_base.success(data=KBDetail.model_validate(detail))


@router.delete('/knowledge_bases/{kb_name}', summary='级联删除知识库', dependencies=[DependsJwtAuth])
async def delete_knowledge_base(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
) -> ResponseSchemaModel[KBDeleteResponse]:
    counts = await kb_service.delete(db=db, kb_name=kb_name)
    return response_base.success(data=KBDeleteResponse(deleted=True, counts=counts))


@router.post('/knowledge_bases/{kb_name}/rebuild', summary='重建索引', dependencies=[DependsJwtAuth])
async def rebuild_knowledge_base(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
) -> ResponseModel:
    await kb_service.rebuild(db=db, kb_name=kb_name)
    return response_base.success()


@router.get(
    '/knowledge_bases/{kb_name}/format-distribution',
    summary='文件类型分布',
    dependencies=[DependsJwtAuth],
)
async def get_knowledge_base_format_distribution(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
) -> ResponseSchemaModel[list[KBFormatDistributionItem]]:
    await kb_service.get_detail(db=db, kb_name=kb_name)
    data = await kb_stats_service.get_format_distribution(db=db, kb_name=kb_name)
    return response_base.success(data=[KBFormatDistributionItem.model_validate(item) for item in data])


@router.get(
    '/knowledge_bases/{kb_name}/ingestion-volume',
    summary='摄入时间序列',
    dependencies=[DependsJwtAuth],
)
async def get_knowledge_base_ingestion_volume(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
    days: Annotated[int, Query(ge=1, le=90, description='天数')] = 30,
) -> ResponseSchemaModel[list[KBIngestionVolumeItem]]:
    await kb_service.get_detail(db=db, kb_name=kb_name)
    data = await kb_stats_service.get_ingestion_volume(db=db, kb_name=kb_name, days=days)
    return response_base.success(data=[KBIngestionVolumeItem.model_validate(item) for item in data])


@router.get(
    '/knowledge_bases/{kb_name}/collections',
    summary='集合统计',
    dependencies=[DependsJwtAuth],
)
async def get_knowledge_base_collections(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
) -> ResponseSchemaModel[list[KBCollectionsItem]]:
    await kb_service.get_detail(db=db, kb_name=kb_name)
    data = await kb_stats_service.get_collections(db=db, kb_name=kb_name)
    return response_base.success(data=[KBCollectionsItem.model_validate(item) for item in data])


@router.get('/knowledge_bases/{kb_name}/facets', summary='分面统计', dependencies=[DependsJwtAuth])
async def get_knowledge_base_facets(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
) -> ResponseSchemaModel[list[KBFacetItem]]:
    await kb_service.get_detail(db=db, kb_name=kb_name)
    data = await kb_stats_service.get_facets(db=db, kb_name=kb_name)
    return response_base.success(data=[KBFacetItem.model_validate(item) for item in data])
