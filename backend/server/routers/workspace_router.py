from __future__ import annotations

import io
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from server.utils.auth_middleware import get_db, get_required_user
from server.utils.response_contracts import BINARY_DOWNLOAD
from ars.services.workspace_service import (
    create_workspace_directory,
    delete_workspace_path,
    download_workspace_file,
    list_workspace_tree,
    read_workspace_file_content,
    search_workspace_files,
    upload_workspace_files,
    write_workspace_file_content,
)
from ars.storage.postgres.models_business import User

workspace = APIRouter(prefix="/workspace", tags=["workspace"])
workspace_knowledge = APIRouter(prefix="/workspace", tags=["workspace"])


class CreateWorkspaceDirectoryRequest(BaseModel):
    parent_path: str
    name: str


class UpdateWorkspaceFileContentRequest(BaseModel):
    path: str
    content: str


class WorkspaceEntryItem(BaseModel):
    """工作区树/搜索条目；字段对齐 `workspace_service._entry_from_metadata` 的输出。"""

    path: str
    virtual_path: str
    name: str
    is_dir: bool
    size: int
    modified_at: str


class WorkspaceTreeResponse(BaseModel):
    """工作区目录树与搜索结果响应。"""

    entries: list[WorkspaceEntryItem]


class WorkspaceFileWriteResponse(BaseModel):
    """工作区文件写入结果。"""

    success: bool
    path: str
    entry: WorkspaceEntryItem


class WorkspaceDeleteResponse(BaseModel):
    """工作区文件或目录删除结果。"""

    success: bool
    path: str


class WorkspaceDirectoryCreateResponse(BaseModel):
    """工作区目录创建结果。"""

    success: bool
    entry: WorkspaceEntryItem


class WorkspaceUploadResponse(BaseModel):
    """工作区文件上传结果。"""

    success: bool
    entries: list[WorkspaceEntryItem]


class WorkspaceFilePreviewResponse(BaseModel):
    """工作区文本/不可预览文件的 JSON 预览载荷；对齐 `PreviewResult.payload()`。

    图片、PDF 与 Office 预览由 `read_workspace_file_content` 直接返回 StreamingResponse，
    作为 Response 实例绕过本模型；本模型只描述 JSON 分支的固定 6 个键。
    """

    content: str | None
    preview_type: str
    supported: bool
    message: str | None
    truncated: bool
    limit: int | None


class WorkspaceKnowledgeEntryItem(BaseModel):
    """知识库文件在工作区只读视图中的条目；对齐 `_workspace_knowledge_entry` 的输出。"""

    source: str
    kb_id: str
    file_id: str | None
    parent_id: str | None
    path: str
    virtual_path: str
    name: str
    is_dir: bool
    size: int
    modified_at: str
    readonly: bool
    status: str
    has_original_file: bool
    has_parsed_markdown: bool
    is_virtual_folder: bool
    path_prefix: str


class WorkspaceKnowledgeTreeResponse(BaseModel):
    """知识库文件只读树响应。"""

    entries: list[WorkspaceKnowledgeEntryItem]
    readonly: bool
    page: int
    page_size: int
    total: int
    has_more: bool
    parent_id: str | None
    path_prefix: str


class KnowledgeFilePreviewResponse(BaseModel):
    """知识库文件 JSON 预览；对齐 `read_knowledge_file_preview` 的文本/不支持分支。

    二进制分支（`binary=True`）由 `_preview_response` 转成 StreamingResponse，作为 Response
    实例绕过本模型。`truncated`/`limit` 只在大文件与文本预览分支出现，因此给默认值并由
    `response_model_exclude_unset=True` 保证响应键集合与载荷逐键一致。
    """

    source: str
    kb_id: str
    file_id: str
    filename: str
    readonly: bool
    content: str | None
    preview_type: str
    supported: bool
    message: str | None
    truncated: bool = False
    limit: int | None = None


def _get_knowledge_base():
    """仅在已注册的知识库工作区路由被调用时加载重运行时。"""

    from ars.knowledge.runtime import knowledge_base

    return knowledge_base


async def _ensure_knowledge_read_access(current_user: User, kb_id: str) -> None:
    allowed = await _get_knowledge_base().check_accessible(
        {
            "uid": current_user.uid,
            "role": current_user.role,
            "department_id": current_user.department_id,
        },
        kb_id,
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Access denied")


async def _ensure_knowledge_supports_documents(kb_id: str) -> None:
    db_info, supports_documents = await _get_knowledge_base().get_database_document_support(kb_id)
    if not db_info:
        raise HTTPException(status_code=404, detail=f"知识库 {kb_id} 不存在")
    if not supports_documents:
        raise HTTPException(status_code=501, detail=f"{db_info.name or db_info.kb_type} 不支持文件浏览")


def _raise_knowledge_read_error(error: ValueError) -> None:
    message = str(error) or "知识库文件读取失败"
    if message.startswith("Dify 知识库不支持"):
        raise HTTPException(status_code=501, detail=message) from error
    raise HTTPException(status_code=400, detail=message) from error


def _workspace_knowledge_entry(kb_id: str, item: dict) -> dict:
    is_dir = bool(item.get("is_folder"))
    is_virtual_folder = bool(item.get("is_virtual_folder"))
    file_id = item.get("file_id")
    path_prefix = item.get("path_prefix") or ""
    if is_virtual_folder:
        path = f"/knowledge/{kb_id}/virtual/{quote(path_prefix, safe='')}"
    elif is_dir:
        path = f"/knowledge/{kb_id}/folder/{file_id}/"
    else:
        path = f"/knowledge/{kb_id}/file/{file_id}"

    return {
        "source": "knowledge",
        "kb_id": kb_id,
        "file_id": file_id,
        "parent_id": item.get("parent_id"),
        "path": path,
        "virtual_path": path,
        "name": item.get("filename") or file_id,
        "is_dir": is_dir,
        "size": 0 if is_dir else int(item.get("file_size") or 0),
        "modified_at": item.get("updated_at") or item.get("created_at") or "",
        "readonly": True,
        "status": item.get("status") or "done",
        "has_original_file": bool(item.get("has_original_file")),
        "has_parsed_markdown": bool(item.get("has_parsed_markdown")),
        "is_virtual_folder": is_virtual_folder,
        "path_prefix": path_prefix,
    }


@workspace.get("/tree", response_model=WorkspaceTreeResponse, response_model_exclude_unset=True)
async def get_workspace_tree(
    path: str = Query("/", description="工作区目录路径"),
    recursive: bool = Query(False, description="是否递归返回子目录文件"),
    files_only: bool = Query(False, description="是否仅返回文件"),
    include_unbound_project_dirs: bool = Query(False, description="Project 选目录时展示未绑定目录"),
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_workspace_tree(
        path=path,
        recursive=recursive,
        files_only=files_only,
        include_unbound_project_dirs=include_unbound_project_dirs,
        current_user=current_user,
        db=db,
    )


@workspace.get("/search", response_model=WorkspaceTreeResponse, response_model_exclude_unset=True)
async def search_workspace_files_route(
    query: str = Query(..., description="搜索关键词"),
    current_user: User = Depends(get_required_user),
):
    return await search_workspace_files(query=query, current_user=current_user)


def _binary_preview_response(data: dict) -> StreamingResponse:
    filename = data.get("filename") or "preview"
    preview_type = data.get("preview_type") or "unsupported"
    return StreamingResponse(
        io.BytesIO(data.get("content") or b""),
        media_type=data.get("media_type") or "application/octet-stream",
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}",
            "X-Ars-Preview-Type": preview_type,
            "X-Ars-Preview-Filename": quote(filename),
        },
    )


def _preview_response(data):
    if isinstance(data, dict) and data.get("binary"):
        return _binary_preview_response(data)
    return data


@workspace.get("/file", response_model=WorkspaceFilePreviewResponse, response_model_exclude_unset=True)
async def get_workspace_file(
    path: str = Query(..., description="工作区文件路径"),
    current_user: User = Depends(get_required_user),
):
    return await read_workspace_file_content(path=path, current_user=current_user)


@workspace_knowledge.get(
    "/knowledge/tree", response_model=WorkspaceKnowledgeTreeResponse, response_model_exclude_unset=True
)
async def get_workspace_knowledge_tree(
    kb_id: str = Query(..., description="知识库 ID"),
    parent_id: str | None = Query(None, description="父文件夹 ID"),
    path_prefix: str | None = Query(None, description="虚拟目录路径前缀"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(100, ge=1, le=500, description="每页数量"),
    recursive: bool = Query(False, description="是否递归返回子目录文件"),
    files_only: bool = Query(False, description="是否仅返回文件"),
    current_user: User = Depends(get_required_user),
):
    await _ensure_knowledge_read_access(current_user, kb_id)
    await _ensure_knowledge_supports_documents(kb_id)
    try:
        data = await _get_knowledge_base().list_document_files(
            kb_id=kb_id,
            parent_id=parent_id,
            path_prefix=path_prefix,
            page=page,
            page_size=page_size,
            recursive=recursive,
            files_only=files_only,
            include_stats=False,
        )
        return {
            "entries": [_workspace_knowledge_entry(kb_id, item) for item in data.get("items", [])],
            "readonly": True,
            "page": data.get("page", page),
            "page_size": data.get("page_size", page_size),
            "total": data.get("total", 0),
            "has_more": bool(data.get("has_more")),
            "parent_id": data.get("parent_id"),
            "path_prefix": data.get("path_prefix", ""),
        }
    except ValueError as error:
        _raise_knowledge_read_error(error)


@workspace_knowledge.get(
    "/knowledge/file", response_model=KnowledgeFilePreviewResponse, response_model_exclude_unset=True
)
async def get_workspace_knowledge_file(
    kb_id: str = Query(..., description="知识库 ID"),
    file_id: str = Query(..., description="知识库文件 ID"),
    current_user: User = Depends(get_required_user),
):
    await _ensure_knowledge_read_access(current_user, kb_id)
    await _ensure_knowledge_supports_documents(kb_id)
    try:
        from ars.knowledge.preview import read_knowledge_file_preview

        return _preview_response(await read_knowledge_file_preview(kb_id=kb_id, file_id=file_id))
    except ValueError as error:
        _raise_knowledge_read_error(error)


@workspace_knowledge.get("/knowledge/download", response_class=StreamingResponse, responses={200: BINARY_DOWNLOAD})
async def download_workspace_knowledge_file(
    kb_id: str = Query(..., description="知识库 ID"),
    file_id: str = Query(..., description="知识库文件 ID"),
    variant: str = Query("original", description="下载模式：original 或 parsed"),
    current_user: User = Depends(get_required_user),
):
    await _ensure_knowledge_read_access(current_user, kb_id)
    try:
        data = await _get_knowledge_base().get_file_download(kb_id=kb_id, file_id=file_id, variant=variant)
    except ValueError as error:
        _raise_knowledge_read_error(error)

    filename = data["filename"]
    return StreamingResponse(
        io.BytesIO(data["content"]),
        media_type=data["media_type"],
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@workspace.put("/file", response_model=WorkspaceFileWriteResponse, response_model_exclude_unset=True)
async def update_workspace_file(
    payload: UpdateWorkspaceFileContentRequest,
    current_user: User = Depends(get_required_user),
):
    return await write_workspace_file_content(
        path=payload.path,
        content=payload.content,
        current_user=current_user,
    )


@workspace.delete("/file", response_model=WorkspaceDeleteResponse, response_model_exclude_unset=True)
async def delete_workspace_file_route(
    path: str = Query(..., description="工作区文件或目录路径"),
    current_user: User = Depends(get_required_user),
):
    return await delete_workspace_path(path=path, current_user=current_user)


@workspace.post("/directory", response_model=WorkspaceDirectoryCreateResponse, response_model_exclude_unset=True)
async def create_workspace_directory_route(
    payload: CreateWorkspaceDirectoryRequest,
    current_user: User = Depends(get_required_user),
):
    return await create_workspace_directory(
        parent_path=payload.parent_path,
        name=payload.name,
        current_user=current_user,
    )


@workspace.post("/upload", response_model=WorkspaceUploadResponse, response_model_exclude_unset=True)
async def upload_workspace_files_route(
    parent_path: str = Form(..., description="父目录路径"),
    files: list[UploadFile] = File(..., description="上传文件列表"),
    current_user: User = Depends(get_required_user),
):
    return await upload_workspace_files(parent_path=parent_path, files=files, current_user=current_user)


@workspace.get("/download", response_class=FileResponse, responses={200: BINARY_DOWNLOAD})
async def download_workspace(
    path: str = Query(..., description="工作区文件路径"),
    current_user: User = Depends(get_required_user),
):
    return await download_workspace_file(path=path, current_user=current_user)
