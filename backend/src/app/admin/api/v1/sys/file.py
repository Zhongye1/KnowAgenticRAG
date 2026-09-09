from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile

from backend.src.common.dataclasses import UploadUrl
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.utils.file_ops import upload_file, upload_file_verify

router = APIRouter()


@router.post(
    '/upload',
    summary='本地文件上传',
    dependencies=[
        Depends(RequestPermission('sys:file:upload')),
        DependsRBAC,
    ],
)
async def upload_files(file: Annotated[UploadFile, File()]) -> ResponseSchemaModel[UploadUrl]:
    upload_file_verify(file)
    filename = await upload_file(file)
    return response_base.success(data=UploadUrl(url=f'/static/upload/{filename}'))
