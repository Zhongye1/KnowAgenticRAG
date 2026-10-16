"""Viewer 文件系统路由

提供 Viewer UI 使用的文件系统 API 端点。
- /viewer/filesystem/* - Viewer UI 使用
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from server.utils.auth_middleware import get_db, get_required_user
from server.utils.response_contracts import BINARY_DOWNLOAD
from ars.services.viewer_filesystem_service import (
    create_viewer_directory,
    delete_viewer_file,
    download_viewer_file,
    list_viewer_filesystem_tree,
    read_viewer_file_content,
    search_viewer_files,
    upload_viewer_files,
)
from ars.storage.postgres.models_business import User

filesystem_router = APIRouter(prefix="/viewer/filesystem", tags=["viewer-filesystem"])


class CreateViewerDirectoryRequest(BaseModel):
    thread_id: str
    parent_path: str
    name: str


class ViewerEntryItem(BaseModel):
    """Viewer 文件系统条目；字段对齐 `viewer_filesystem_service._entry` 的输出。

    `artifact_url` 只在列目录、搜索与上传条目中出现（目录项为 null），创建目录不返回该键，
    因此给默认值并由 `response_model_exclude_unset=True` 保持响应键集合与载荷一致。
    """

    path: str
    name: str
    is_dir: bool
    size: int
    modified_at: str
    artifact_url: str | None = None


class ViewerTreeResponse(BaseModel):
    """Viewer 目录列表与搜索结果响应。"""

    entries: list[ViewerEntryItem]


class ViewerDirectoryCreateResponse(BaseModel):
    """Viewer 目录创建结果。"""

    entry: ViewerEntryItem


class ViewerDeleteResponse(BaseModel):
    """Viewer 文件或目录删除结果。"""

    success: bool
    path: str


class ViewerUploadResponse(BaseModel):
    """Viewer 文件上传结果。"""

    entries: list[ViewerEntryItem]


class ViewerFilePreviewResponse(BaseModel):
    """Viewer 文本/不可预览文件的 JSON 预览载荷；对齐 `PreviewResult.payload()`。

    图片、PDF 与 Office 预览由 `read_viewer_file_content` 直接返回 StreamingResponse，
    作为 Response 实例绕过本模型；本模型只描述 JSON 分支的固定 6 个键。
    """

    content: str | None
    preview_type: str
    supported: bool
    message: str | None
    truncated: bool
    limit: int | None


@filesystem_router.get("/tree", response_model=ViewerTreeResponse, response_model_exclude_unset=True)
async def get_viewer_tree(
    thread_id: str = Query(..., description="线程 ID"),
    path: str = Query("/", description="目录路径"),
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_viewer_filesystem_tree(
        thread_id=thread_id,
        path=path,
        current_user=current_user,
        db=db,
    )


@filesystem_router.get("/file", response_model=ViewerFilePreviewResponse, response_model_exclude_unset=True)
async def get_viewer_file(
    thread_id: str = Query(..., description="线程 ID"),
    path: str = Query(..., description="文件路径"),
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    return await read_viewer_file_content(
        thread_id=thread_id,
        path=path,
        current_user=current_user,
        db=db,
    )


@filesystem_router.delete("/file", response_model=ViewerDeleteResponse, response_model_exclude_unset=True)
async def delete_viewer_file_route(
    thread_id: str = Query(..., description="线程 ID"),
    path: str = Query(..., description="文件路径"),
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    return await delete_viewer_file(
        thread_id=thread_id,
        path=path,
        current_user=current_user,
        db=db,
    )


@filesystem_router.post("/directory", response_model=ViewerDirectoryCreateResponse, response_model_exclude_unset=True)
async def create_viewer_directory_route(
    payload: CreateViewerDirectoryRequest,
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_viewer_directory(
        thread_id=payload.thread_id,
        parent_path=payload.parent_path,
        name=payload.name,
        current_user=current_user,
        db=db,
    )


@filesystem_router.post("/upload", response_model=ViewerUploadResponse, response_model_exclude_unset=True)
async def upload_viewer_files_route(
    thread_id: str = Form(..., description="线程 ID"),
    parent_path: str = Form(..., description="父目录路径"),
    files: list[UploadFile] = File(..., description="上传文件列表"),
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    return await upload_viewer_files(
        thread_id=thread_id,
        parent_path=parent_path,
        files=files,
        current_user=current_user,
        db=db,
    )


@filesystem_router.get("/search", response_model=ViewerTreeResponse, response_model_exclude_unset=True)
async def search_viewer_files_route(
    thread_id: str = Query(..., description="线程 ID"),
    query: str = Query(..., description="搜索关键词"),
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    return await search_viewer_files(
        thread_id=thread_id,
        query=query,
        current_user=current_user,
        db=db,
    )


@filesystem_router.get("/download", response_class=FileResponse, responses={200: BINARY_DOWNLOAD})
async def download_viewer(
    thread_id: str = Query(..., description="线程 ID"),
    path: str = Query(..., description="文件路径"),
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    return await download_viewer_file(
        thread_id=thread_id,
        path=path,
        current_user=current_user,
        db=db,
    )
