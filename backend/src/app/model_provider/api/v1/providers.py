"""模型供应商管理 API（ragf-design D14：登录态即可，admin 角色后续）。"""

from typing import Annotated, cast

from fastapi import APIRouter, Path

from backend.src.app.model_provider.model.provider import ModelProvider
from backend.src.app.model_provider.schema.provider import (
    ModelProviderCreateParam,
    ModelProviderDetail,
    ModelProviderUpdateParam,
    ProviderConnectivityParam,
    ProviderConnectivityResult,
)
from backend.src.app.model_provider.service.provider_service import provider_service
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.database.db import CurrentSession

router = APIRouter(dependencies=[DependsJwtAuth])


def _detail(provider: ModelProvider) -> ModelProviderDetail:
    return ModelProviderDetail(
        provider_id=provider.provider_id,
        display_name=provider.display_name,
        provider_type=provider.provider_type,
        base_url=provider.base_url,
        embedding_base_url=provider.embedding_base_url,
        rerank_base_url=provider.rerank_base_url,
        api_key_env=provider.api_key_env,
        api_key_set=provider_service.api_key_available(provider),
        capabilities=list(provider.capabilities or []),
        enabled_models=list(provider.enabled_models or []),
        headers_json=dict(provider.headers_json or {}),
        extra_json=dict(provider.extra_json or {}),
        is_enabled=bool(provider.is_enabled),
        is_builtin=bool(provider.is_builtin),
        created_time=provider.created_time,
        updated_time=provider.updated_time,
    )


@router.get('', summary='模型供应商列表')
async def get_providers(db: CurrentSession) -> ResponseSchemaModel[list[ModelProviderDetail]]:
    providers = await provider_service.get_list(db)
    return cast(
        'ResponseSchemaModel[list[ModelProviderDetail]]',
        response_base.success(data=[_detail(item) for item in providers]),
    )


@router.get('/{provider_id}', summary='模型供应商详情')
async def get_provider(
    db: CurrentSession,
    provider_id: Annotated[str, Path(description='供应商标识')],
) -> ResponseSchemaModel[ModelProviderDetail]:
    provider = await provider_service.get(db, provider_id)
    if provider is None:
        from backend.src.common.exception import errors

        raise errors.NotFoundError(msg='模型供应商不存在')
    return response_base.success(data=_detail(provider))


@router.post('', summary='创建模型供应商')
async def create_provider(
    db: CurrentSession,
    obj: ModelProviderCreateParam,
) -> ResponseSchemaModel[ModelProviderDetail]:
    provider = await provider_service.create(db, obj)
    return response_base.success(data=_detail(provider))


@router.patch('/{provider_id}', summary='更新模型供应商')
async def update_provider(
    db: CurrentSession,
    provider_id: Annotated[str, Path(description='供应商标识')],
    obj: ModelProviderUpdateParam,
) -> ResponseSchemaModel[ModelProviderDetail]:
    provider = await provider_service.update(db, provider_id, obj)
    return response_base.success(data=_detail(provider))


@router.delete('/{provider_id}', summary='删除模型供应商')
async def delete_provider(
    db: CurrentSession,
    provider_id: Annotated[str, Path(description='供应商标识')],
) -> ResponseSchemaModel[None]:
    await provider_service.delete(db, provider_id)
    return response_base.success()


@router.post('/test-connection', summary='模型连通性测试')
async def test_connection(
    db: CurrentSession,
    obj: ProviderConnectivityParam,
) -> ResponseSchemaModel[ProviderConnectivityResult]:
    result = await provider_service.test_connectivity(db, obj.spec)
    return response_base.success(data=ProviderConnectivityResult.model_validate(result))
