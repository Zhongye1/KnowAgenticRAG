from typing import cast

from fastapi import APIRouter, Depends, Request, Response
from pyrate_limiter import Duration, Rate
from starlette.background import BackgroundTasks

from backend.src.app.admin.schema.token import GetLoginToken, GetNewToken
from backend.src.app.admin.schema.user import (
    AuthLoginParam,
    GetUserInfoWithRelationDetail,
    RegisterUserParam,
)
from backend.src.app.admin.service.auth_service import auth_service
from backend.src.app.admin.service.user_service import user_service
from backend.src.common.response.response_schema import (
    ResponseModel,
    ResponseSchemaModel,
    response_base,
)
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.database.db import CurrentSession, CurrentSessionTransaction
from backend.src.utils.limiter import RateLimiter

router = APIRouter()


@router.post('/register', summary='用户注册')
async def register(
    db: CurrentSessionTransaction, obj: RegisterUserParam
) -> ResponseSchemaModel[GetUserInfoWithRelationDetail]:
    await auth_service.register(db=db, obj=obj)
    data = await user_service.get_userinfo(db=db, username=obj.username)
    return cast('ResponseSchemaModel[GetUserInfoWithRelationDetail]', response_base.success(data=data))


@router.post(
    '/login',
    summary='用户登录',
    description='json 格式登录, 仅支持在第三方api工具调试, 例如: postman',
    dependencies=[Depends(RateLimiter(Rate(500, Duration.MINUTE)))],
)
async def login(
    db: CurrentSessionTransaction,
    response: Response,
    obj: AuthLoginParam,
    background_tasks: BackgroundTasks,
) -> ResponseSchemaModel[GetLoginToken]:
    data = await auth_service.login(db=db, response=response, obj=obj, background_tasks=background_tasks)
    return response_base.success(data=data)


@router.get(
    '/codes',
    summary='获取所有授权码',
    description='适配 vben admin v5',
    dependencies=[DependsJwtAuth],
)
async def get_codes(db: CurrentSession, request: Request) -> ResponseSchemaModel[list[str]]:
    codes = await auth_service.get_codes(db=db, request=request)
    return response_base.success(data=codes)


@router.post('/refresh', summary='刷新 token')
async def refresh_token(db: CurrentSession, request: Request, response: Response) -> ResponseSchemaModel[GetNewToken]:
    data = await auth_service.refresh_token(db=db, request=request, response=response)
    return response_base.success(data=data)


@router.post('/logout', summary='用户登出')
async def logout(request: Request, response: Response) -> ResponseModel:
    await auth_service.logout(request=request, response=response)
    return response_base.success()
