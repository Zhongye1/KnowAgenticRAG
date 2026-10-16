import traceback
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ars.storage.postgres.models_business import User
from server.utils.auth_middleware import get_db, get_required_user
from ars.config.options import system_options
from ars.agents.tool_approval import ToolApprovalMode
from ars.models import select_model
from ars.services.attachment_service import (
    confirm_tmp_thread_attachments_view,
    delete_thread_attachment_view,
    list_thread_attachments_view,
    parse_tmp_attachment_view,
    upload_tmp_attachment_view,
)
from ars.services.chat_service import get_agent_state_view
from ars.services.conversation_service import (
    create_thread_view,
    delete_thread_view,
    get_thread_history_view,
    list_threads_view,
    mark_thread_viewed_view,
    search_threads_view,
    update_thread_view,
)
from ars.services.artifact_service import (
    resolve_thread_artifact_view,
    save_thread_artifact_to_workspace_view,
)
from ars.services.feedback_service import get_message_feedback_view, submit_message_feedback_view
from ars.utils.logging_config import logger
from ars.utils.image_processor import process_uploaded_image


# TODO：当前文件的功能过于庞杂，路由标签混乱


# 图片上传响应模型
class ImageUploadResponse(BaseModel):
    success: bool
    image_content: str | None = None
    thumbnail_content: str | None = None
    width: int | None = None
    height: int | None = None
    format: str | None = None
    mime_type: str | None = None
    size_bytes: int | None = None
    error: str | None = None


class CallResponse(BaseModel):
    """`POST /call` 的简单问答结果。"""

    response: str
    request_id: str


chat = APIRouter(prefix="/chat", tags=["chat"])


@chat.post("/call", response_model=CallResponse, response_model_exclude_unset=True)
async def call(
    query: str = Body(...),
    meta: dict = Body(None),
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    """调用模型进行简单问答（需要登录）"""
    meta = meta or {}

    # 确保 request_id 存在
    if "request_id" not in meta or not meta.get("request_id"):
        meta["request_id"] = str(uuid.uuid4())

    options = await system_options.get(db)
    model = select_model(model_spec=meta.get("model_spec") or meta.get("model") or options["default_model"])

    response = await model.call(query)
    logger.debug({"query": query, "response": response.content})

    return {"response": response.content, "request_id": meta["request_id"]}


class ThreadHistoryFeedbackItem(BaseModel):
    """历史消息中当前用户对该消息的反馈。"""

    id: int
    rating: str
    reason: str | None
    created_at: str | None


class ThreadToolCallFunction(BaseModel):
    """工具调用函数名。"""

    name: str


class ThreadToolCallResult(BaseModel):
    """工具调用成功时的结果摘要。"""

    content: str


class ThreadToolCallItem(BaseModel):
    """历史消息内的一次工具调用。"""

    id: str
    name: str
    function: ThreadToolCallFunction
    args: dict[str, Any]
    tool_call_result: ThreadToolCallResult | None
    status: str
    error_message: str | None


class ThreadHistoryMessageItem(BaseModel):
    """历史消息条目；字段对齐 `conversation_service.get_thread_history_view`。

    `run_started_at`/`run_finished_at` 只对 assistant 消息下发，`tool_calls` 只在该消息
    带工具调用时下发，因此它们有默认值，配合 `response_model_exclude_unset=True`
    保证响应体逐键与载荷一致。
    """

    id: int
    type: str
    content: str
    created_at: str | None
    run_id: str | None
    request_id: str | None
    delivery_status: str
    error_type: str | None
    error_message: str | None
    extra_metadata: dict[str, Any]
    message_type: str | None
    image_content: str | None
    feedback: ThreadHistoryFeedbackItem | None
    run_started_at: str | None = None
    run_finished_at: str | None = None
    tool_calls: list[ThreadToolCallItem] = Field(default_factory=list)


class ThreadHistoryResponse(BaseModel):
    """对话历史消息响应。"""

    history: list[ThreadHistoryMessageItem]


@chat.get(
    "/thread/{thread_id}/history",
    response_model=ThreadHistoryResponse,
    response_model_exclude_unset=True,
)
async def get_thread_history(
    thread_id: str, current_user: User = Depends(get_required_user), db: AsyncSession = Depends(get_db)
):
    """获取对话历史消息（需要登录）- 包含用户反馈状态"""
    try:
        return await get_thread_history_view(
            thread_id=thread_id,
            current_uid=str(current_user.uid),
            db=db,
        )

    except Exception as e:
        logger.error(f"获取对话历史消息出错: {e}, {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"获取对话历史消息出错: {str(e)}")


class ThreadAgentState(BaseModel):
    """`extract_agent_state` 产出的智能体运行状态。"""

    todos: list[Any]
    files: dict[str, Any]
    artifacts: list[str]
    subagent_runs: list[dict[str, Any]]
    token_usage: dict[str, Any] | None


class SubagentThreadItem(BaseModel):
    """子智能体线程归属关系；对齐 `SubagentThread.to_dict()`。"""

    id: int
    uid: str
    parent_conversation_id: int
    child_conversation_id: int
    child_thread_id: str
    subagent_slug: str
    created_by_run_id: str
    created_at: str | None
    updated_at: str | None


class ThreadStateResponse(BaseModel):
    """对话当前状态；字段对齐 `chat_service.get_agent_state_view`。

    `interrupt`、`parent_thread_id`、`subagent_thread`、`subagent_run` 只在特定场景下发，
    `messages` 只在 `include_messages=True` 时下发；它们带默认值并由
    `response_model_exclude_unset=True` 维持响应体逐键不变。
    """

    agent_state: ThreadAgentState
    interrupt: dict[str, Any] | None = None
    parent_thread_id: str | None = None
    subagent_thread: SubagentThreadItem | None = None
    subagent_run: dict[str, Any] | None = None
    messages: list[dict[str, Any]] = Field(default_factory=list)


@chat.get(
    "/thread/{thread_id}/state",
    response_model=ThreadStateResponse,
    response_model_exclude_unset=True,
)
async def get_thread_state(
    thread_id: str,
    include_messages: bool = Query(False),
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    """获取对话当前状态（需要登录）"""
    try:
        return await get_agent_state_view(
            thread_id=thread_id,
            current_user=current_user,
            db=db,
            include_messages=include_messages,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取对话状态出错: {e}, {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"获取对话状态出错: {str(e)}")


# ==================== 线程管理 API ====================


class ThreadCreate(BaseModel):
    """新线程创建请求，只允许在创建时选择 Project。"""

    model_config = ConfigDict(extra="forbid")

    request_id: str | None = Field(None, max_length=64)
    title: str | None = None
    agent_id: str
    metadata: dict | None = None
    project_id: str | None = None


class ThreadResponse(BaseModel):
    id: str
    uid: str
    agent_id: str
    title: str | None = None
    is_pinned: bool = False
    project_id: str | None = None
    workdir_path: str
    created_at: str
    updated_at: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    thread_status: str = "done"


class ThreadSearchSnippet(BaseModel):
    message_id: int | None = None
    content: str
    created_at: str | None = None


class ThreadSearchItem(ThreadResponse):
    """搜索结果条目：只需要定位与片段，工作目录由会话详情接口提供。"""

    workdir_path: str | None = None
    thread_id: str
    matched_count: int
    message_id: int | None = None
    latest_match_at: str | None = None
    snippets: list[ThreadSearchSnippet] = Field(default_factory=list)


class ThreadSearchResponse(BaseModel):
    items: list[ThreadSearchItem]
    has_more: bool
    limit: int
    offset: int


class AttachmentResponse(BaseModel):
    file_id: str
    file_name: str
    file_type: str | None = None
    file_size: int
    status: str
    uploaded_at: str
    path: str
    artifact_url: str | None = None
    original_path: str | None = None
    original_artifact_url: str | None = None
    request_id: str | None = None


class AttachmentLimits(BaseModel):
    allowed_extensions: list[str]
    max_size_bytes: int


class AttachmentListResponse(BaseModel):
    attachments: list[AttachmentResponse]
    limits: AttachmentLimits


class TmpAttachmentResponse(BaseModel):
    file_name: str
    file_type: str | None = None
    file_size: int
    object_name: str
    uploaded_at: str
    parse_supported: bool = False
    parse_methods: list[str] = Field(default_factory=list)


class TmpAttachmentParseRequest(BaseModel):
    object_name: str
    parse_method: str | None = None


class TmpAttachmentParseResponse(BaseModel):
    parsed_object_name: str
    parse_method: str
    status: str
    truncated: bool = False


class TmpAttachmentConfirmItem(BaseModel):
    file_type: str | None = None
    object_name: str
    parsed_object_name: str | None = None


class TmpAttachmentConfirmRequest(BaseModel):
    attachments: list[TmpAttachmentConfirmItem]


class TmpAttachmentConfirmResponse(BaseModel):
    attachments: list[AttachmentResponse]


class SaveThreadArtifactRequest(BaseModel):
    path: str
    destination_path: str | None = None


class SaveThreadArtifactResponse(BaseModel):
    name: str
    source_path: str
    saved_path: str
    saved_artifact_url: str


# =============================================================================
# > === 会话管理分组 ===
# =============================================================================


@chat.post("/thread", response_model=ThreadResponse)
async def create_thread(
    thread: ThreadCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_required_user)
):
    """创建新对话线程 (使用新存储系统)"""
    return await create_thread_view(
        agent_slug=thread.agent_id,
        request_id=thread.request_id,
        title=thread.title,
        metadata=thread.metadata,
        project_id=thread.project_id,
        db=db,
        current_uid=str(current_user.uid),
    )


@chat.get("/threads", response_model=list[ThreadResponse])
async def list_threads(
    agent_id: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_required_user),
):
    """获取用户的所有对话线程 (使用新存储系统)"""
    return await list_threads_view(
        agent_slug=agent_id, db=db, current_uid=str(current_user.uid), limit=limit, offset=offset
    )


@chat.get("/threads/search", response_model=ThreadSearchResponse)
async def search_threads(
    q: str = Query(..., min_length=1, max_length=200),
    agent_id: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_required_user),
):
    """搜索当前用户的历史对话。"""
    return await search_threads_view(
        query=q,
        agent_id=agent_id,
        db=db,
        current_uid=str(current_user.uid),
        limit=limit,
        offset=offset,
    )


class ThreadDeleteResponse(BaseModel):
    """删除对话线程结果。"""

    message: str


@chat.delete("/thread/{thread_id}", response_model=ThreadDeleteResponse, response_model_exclude_unset=True)
async def delete_thread(
    thread_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_required_user)
):
    """删除对话线程 (使用新存储系统)"""
    return await delete_thread_view(thread_id=thread_id, db=db, current_uid=str(current_user.uid))


class ThreadUpdate(BaseModel):
    """线程可变展示字段，不接受绑定字段。"""

    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    is_pinned: bool | None = None
    tool_approval_mode: ToolApprovalMode | None = None


@chat.put("/thread/{thread_id}", response_model=ThreadResponse)
async def update_thread(
    thread_id: str,
    thread_update: ThreadUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_required_user),
):
    """更新对话线程信息 (使用新存储系统)"""
    return await update_thread_view(
        thread_id=thread_id,
        title=thread_update.title,
        is_pinned=thread_update.is_pinned,
        tool_approval_mode=thread_update.tool_approval_mode,
        db=db,
        current_uid=str(current_user.uid),
    )


@chat.post("/thread/{thread_id}/viewed", response_model=ThreadResponse)
async def mark_thread_viewed(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_required_user),
):
    """记录用户已查看该线程的最新顶层 run，清除侧边栏未读状态。"""
    return await mark_thread_viewed_view(
        thread_id=thread_id,
        db=db,
        current_uid=str(current_user.uid),
    )


# ================================
# > === 附件管理分组 ===
# ================================


@chat.post("/attachments/tmp", response_model=TmpAttachmentResponse)
async def upload_tmp_attachment(file: UploadFile = File(...), current_user: User = Depends(get_required_user)):
    """上传附件到 MinIO tmp，暂不关联线程。"""
    return await upload_tmp_attachment_view(file=file, current_uid=str(current_user.uid))


@chat.post("/attachments/tmp/parse", response_model=TmpAttachmentParseResponse)
async def parse_tmp_attachment(
    request: TmpAttachmentParseRequest,
    current_user: User = Depends(get_required_user),
):
    """解析 tmp 附件并返回解析后的 tmp URL。"""
    return await parse_tmp_attachment_view(
        object_name=request.object_name,
        parse_method=request.parse_method,
        current_uid=str(current_user.uid),
    )


@chat.post("/thread/{thread_id}/attachments/confirm", response_model=TmpAttachmentConfirmResponse)
async def confirm_tmp_thread_attachments(
    thread_id: str,
    request: TmpAttachmentConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_required_user),
):
    """将 tmp 附件正式加入线程附件列表。"""
    return await confirm_tmp_thread_attachments_view(
        thread_id=thread_id,
        attachments=[item.model_dump() for item in request.attachments],
        db=db,
        current_uid=str(current_user.uid),
    )


@chat.get("/thread/{thread_id}/attachments", response_model=AttachmentListResponse)
async def list_thread_attachments(
    thread_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_required_user),
):
    """列出当前对话线程的所有附件元信息。"""
    return await list_thread_attachments_view(
        thread_id=thread_id,
        db=db,
        current_uid=str(current_user.uid),
    )


class ThreadAttachmentDeleteResponse(BaseModel):
    """删除线程附件结果。"""

    message: str


@chat.delete(
    "/thread/{thread_id}/attachments/{file_id}",
    response_model=ThreadAttachmentDeleteResponse,
    response_model_exclude_unset=True,
)
async def delete_thread_attachment(
    thread_id: str,
    file_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_required_user),
):
    """移除指定附件。"""
    return await delete_thread_attachment_view(
        thread_id=thread_id,
        file_id=file_id,
        db=db,
        current_uid=str(current_user.uid),
    )


class ThreadArtifactPreviewResponse(BaseModel):
    """artifact 文本/不支持预览的 JSON 载荷；对齐 `PreviewResult.payload()`。

    该路由的主路径是文件下载，返回 FileResponse / StreamingResponse 时由 FastAPI 直接
    透传（Response 实例不经过 response_model）；只有预览落在 JSON 分支时才由本模型序列化，
    并借此为 OpenAPI 声明字段信息。
    """

    content: str | None
    preview_type: str
    supported: bool
    message: str | None
    truncated: bool
    limit: int | None


@chat.get(
    "/thread/{thread_id}/artifacts/{path:path}",
    response_model=ThreadArtifactPreviewResponse,
    response_model_exclude_unset=True,
)
async def get_thread_artifact(
    thread_id: str,
    path: str,
    download: bool = Query(False),
    preview: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_required_user),
):
    """下载或预览线程文件。"""
    return await resolve_thread_artifact_view(
        thread_id=thread_id,
        current_uid=str(current_user.uid),
        db=db,
        path=path,
        download=download,
        preview=preview,
    )


@chat.post("/thread/{thread_id}/artifacts/save", response_model=SaveThreadArtifactResponse)
async def save_thread_artifact_to_workspace(
    thread_id: str,
    request: SaveThreadArtifactRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_required_user),
):
    """保存交付物到用户工作区中指定的目录。"""
    return await save_thread_artifact_to_workspace_view(
        thread_id=thread_id,
        current_uid=str(current_user.uid),
        db=db,
        path=request.path,
        destination_path=request.destination_path,
    )


# =============================================================================
# > === 消息反馈分组 ===
# =============================================================================


class MessageFeedbackRequest(BaseModel):
    rating: str  # 'like' or 'dislike'
    reason: str | None = None  # Optional reason for dislike


class MessageFeedbackResponse(BaseModel):
    id: int
    message_id: int
    rating: str
    reason: str | None
    created_at: str


@chat.post("/message/{message_id}/feedback", response_model=MessageFeedbackResponse)
async def submit_message_feedback(
    message_id: int,
    feedback_data: MessageFeedbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_required_user),
):
    """提交消息反馈（需要登录）"""
    result = await submit_message_feedback_view(
        message_id=message_id,
        rating=feedback_data.rating,
        reason=feedback_data.reason,
        db=db,
        current_uid=str(current_user.uid),
    )
    return MessageFeedbackResponse(**result)


class MessageFeedbackItem(BaseModel):
    """GET 反馈接口读到的反馈记录。"""

    id: int
    rating: str
    reason: str | None
    created_at: str


class MessageFeedbackStatusResponse(BaseModel):
    """指定消息的当前用户反馈状态；对齐 `feedback_service.get_message_feedback_view`。"""

    has_feedback: bool
    feedback: MessageFeedbackItem | None


@chat.get(
    "/message/{message_id}/feedback",
    response_model=MessageFeedbackStatusResponse,
    response_model_exclude_unset=True,
)
async def get_message_feedback(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_required_user),
):
    """获取指定消息的用户反馈（需要登录）"""
    return await get_message_feedback_view(
        message_id=message_id,
        db=db,
        current_uid=str(current_user.uid),
    )


# =============================================================================
# > === 多模态图片支持分组 ===
# =============================================================================


@chat.post("/image/upload", response_model=ImageUploadResponse)
async def upload_image(file: UploadFile = File(...), current_user: User = Depends(get_required_user)):
    """
    上传并处理图片，返回base64编码的图片数据
    """
    try:
        # 验证文件类型
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="只支持图片文件上传")

        # 读取文件内容
        image_data = await file.read()

        # 检查文件大小（10MB限制，超过后会压缩到5MB）
        if len(image_data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="图片文件过大，请上传小于10MB的图片")

        # 处理图片
        result = process_uploaded_image(image_data, file.filename)

        if not result["success"]:
            raise HTTPException(status_code=400, detail=f"图片处理失败: {result['error']}")

        logger.info(
            f"用户 {current_user.id} 成功上传图片: {file.filename}, "
            f"尺寸: {result['width']}x{result['height']}, "
            f"格式: {result['format']}, "
            f"大小: {result['size_bytes']} bytes"
        )

        return ImageUploadResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"图片上传处理失败: {str(e)}, {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"图片处理失败: {str(e)}")
