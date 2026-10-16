from __future__ import annotations

import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from ars.agents.buildin import agent_manager
from ars.agents.context import filter_config_by_role
from ars.repositories.agent_repository import (
    AgentRepository,
    is_builtin_agent,
    user_can_access_agent,
    user_can_manage_agent,
)
from ars.services.agent_request_queue_service import (
    cancel_queued_request as cancel_queued_request_svc,
    continue_thread_queue,
    finalize_dispatch,
    get_request as get_request_svc,
    get_thread_queue_snapshot,
    steer_queued_request,
    stream_request_events,
)
from ars.services.agent_run_service import (
    cancel_agent_run_view,
    create_agent_run_view,
    get_active_run_by_thread,
    get_agent_run_langfuse_link,
    get_agent_run_result,
    get_agent_run_view,
    stream_agent_run_events,
)
from ars.services.input_message_service import build_chat_input_message
from ars.services.run_event_models import RUN_EVENT_SCHEMA_REF
from ars.services.run_submission_service import RunOrigin, RunSubmissionCommand, submit_run_command
from ars.storage.postgres.manager import pg_manager
from ars.storage.postgres.models_business import User

from server.utils.auth_middleware import get_admin_user, get_db, get_required_user, get_superadmin_user

agent_router = APIRouter(prefix="/agent", tags=["agent"])


class AgentCreate(BaseModel):
    name: str
    backend_id: str = "ChatbotAgent"
    slug: str | None = None
    description: str | None = None
    icon: str | None = None
    pics: list[str] | None = None
    config_json: dict | None = None
    share_config: dict | None = None
    is_subagent: bool | None = None
    set_default: bool = False


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    pics: list[str] | None = None
    config_json: dict | None = None
    share_config: dict | None = None
    is_subagent: bool | None = None


class AgentItem(BaseModel):
    """智能体条目；字段对齐 `AgentRepository.serialize` 与 `Agent.to_dict()` 的实际输出。

    `configurable_items` 只在请求了可配置项时才下发（详情、创建、更新、置默认），
    列表不带它，所以路由用 `response_model_exclude_unset=True` 保持响应体逐键不变。
    """

    id: int
    slug: str
    agent_id: str
    backend_id: str
    name: str
    description: str | None
    icon: str | None
    pics: list[str]
    config_json: dict[str, Any]
    share_config: dict[str, Any] | None
    is_default: bool
    is_subagent: bool
    created_by: str | None
    updated_by: str | None
    created_at: str | None
    updated_at: str | None
    can_manage: bool
    effective_permission: str
    is_builtin: bool
    permission_locked: bool
    capabilities: list[Any]
    metadata: dict[str, Any]
    configurable_items: dict[str, Any] = Field(default_factory=dict)


class AgentItemResponse(BaseModel):
    """单个智能体的响应。"""

    agent: AgentItem


class AgentListResponse(BaseModel):
    """智能体列表响应。"""

    agents: list[AgentItem]


class AgentDeleteResponse(BaseModel):
    """智能体删除结果。"""

    success: bool


class AgentBackendItem(BaseModel):
    """智能体后端条目；字段对齐 `BaseAgent.get_info()` 与 `_backend_info()` 的输出。

    `get_info()` 始终返回 `configurable_items`（列表请求时为空 dict），`_backend_info()`
    再补上 `type` 并把 `id` 改名为 `backend_id`，因此这些键总是出现。
    """

    backend_id: str
    type: Literal["agent_backend"]
    name: str
    description: str
    metadata: dict[str, Any]
    configurable_items: dict[str, Any]
    capabilities: list[str]


class AgentBackendListResponse(BaseModel):
    """智能体后端列表响应。"""

    backends: list[AgentBackendItem]


class AgentRunCreateResponse(BaseModel):
    """Chat / Resume 提交结果。

    Resume 路径回 `_build_run_response()`（只有运行基本字段），普通 Chat 回
    `submit_run_command()` 的入队结果（多出排队字段，且 run_id/stream_url 可能为 null）。
    两种形状共用本模型，路由用 `response_model_exclude_unset=True` 保持逐键一致。
    """

    run_id: str | None
    thread_id: str
    status: str
    request_id: str
    stream_url: str | None
    queue_policy: str | None = None
    queue_position: int | None = None
    message_id: int | None = None
    request_events_url: str | None = None


class AgentRequestItem(BaseModel):
    """请求条目；字段对齐 `AgentRunRequest.to_dict()`。"""

    request_id: str
    uid: str
    agent_slug: str
    thread_id: str
    source: str
    channel: str
    external_id: str | None
    origin_metadata: dict[str, Any]
    queue_policy: str
    status: str
    input_message_id: int
    dispatched_run_id: str | None
    error_message: str | None
    created_at: str
    dispatched_at: str | None
    updated_at: str


class AgentRequestResponse(BaseModel):
    """单个请求响应。"""

    request: AgentRequestItem


class AgentThreadRequestItem(AgentRequestItem):
    """队列请求条目：请求投影再加上消息内容与 FIFO 位置（`get_thread_queue_snapshot`）。"""

    content: str
    queue_position: int


class AgentRequestQueueState(BaseModel):
    """线程队列状态；字段对齐 `_get_queue_state()` 返回的 metadata。"""

    status: str
    paused_reason: str | None
    blocking_run_id: str | None
    can_continue: bool


class AgentThreadRequestsResponse(BaseModel):
    """线程队列快照响应。"""

    requests: list[AgentThreadRequestItem]
    queue: AgentRequestQueueState


class AgentThreadContinueResponse(BaseModel):
    """手动继续队列的派发结果。"""

    status: Literal["dispatched"]
    request_id: str
    run_id: str


class AgentRequestCancelResponse(BaseModel):
    """排队请求取消结果。"""

    request_id: str
    status: str


class AgentRequestSteerResponse(BaseModel):
    """排队请求升级为引导的结果。"""

    request_id: str
    thread_id: str
    status: str
    queue_policy: str
    queue_position: int | None
    request_events_url: str


class AgentRunItem(BaseModel):
    """运行任务条目；字段对齐 `AgentRun.to_dict()`。"""

    id: str
    conversation_thread_id: str
    runtime_scope_id: str
    runtime_cleanup_pending: bool
    agent_slug: str
    uid: str
    status: str
    request_id: str
    source: str
    channel: str
    external_id: str | None
    origin_metadata: dict[str, Any]
    conversation_id: int | None
    created_by_run_id: str | None
    subagent_thread_relation_id: int | None
    run_type: str
    input_message_id: int | None
    output_message_id: int | None
    last_event_id: str | None
    input_payload: dict[str, Any]
    token_usage: dict[str, Any]
    error_type: str | None
    error_message: str | None
    manifest: dict[str, Any] | None
    manifest_fingerprint: str | None
    started_at: str | None
    finished_at: str | None
    created_at: str | None
    updated_at: str | None


class AgentRunResponse(BaseModel):
    """单个运行任务响应。"""

    run: AgentRunItem


class AgentActiveRunResponse(BaseModel):
    """线程当前待关注运行响应；线程没有活跃运行时 `run` 为 null。"""

    run: AgentRunItem | None


class AgentRunResultError(BaseModel):
    """运行失败的分类与消息。"""

    type: str | None
    message: str | None


class AgentRunResultResponse(BaseModel):
    """运行最终结果。

    Run 不存在时载荷只有 `status/output/agent_run_id/error`，正常结果也不会带 `error`，
    因此路由用 `response_model_exclude_unset=True`。
    """

    status: str
    output: str
    agent_run_id: str
    agent_slug: str | None = None
    thread_id: str | None = None
    conversation_id: int | None = None
    request_id: str | None = None
    final_message_id: int | None = None
    langfuse_trace_id: str | None = None
    token_usage: dict[str, Any] = Field(default_factory=dict)
    error: AgentRunResultError | None = None


class AgentRunLangfuseResponse(BaseModel):
    """Langfuse 跳转地址。

    可用时回 `url`，不可用时只回 `reason`，因此路由用 `response_model_exclude_unset=True`。
    """

    run_id: str
    available: bool
    url: str | None = None
    reason: str | None = None


class AgentRunCreate(BaseModel):
    query: str | None = Field(None, description="用户输入的问题")
    agent_slug: str = Field(..., description="智能体 slug")
    thread_id: str = Field(..., description="会话线程 ID")
    meta: dict = Field(default_factory=dict, description="可选，请求追踪信息，例如 request_id")
    image_content: str | None = Field(None, description="可选，base64 图片内容")
    model_spec: str | None = Field(None, description="可选，对话级模型覆盖，优先级高于智能体配置")
    tool_approval_mode: str | None = Field(None, description="可选，本次运行的工具审批模式覆盖")
    resume: Any | None = Field(None, description="可选，恢复时传给 LangGraph 的输入载荷，非布尔值")
    created_by_run_id: str | None = Field(None, description="可选，创建本 run 的父 run ID；resume 时为被恢复的 run ID")
    queue_policy: str = Field(
        "enqueue",
        description="排队策略：enqueue（默认排队）、reject（运行中拒绝）或 steer（优先接替）",
    )


def _backend_info(info: dict) -> dict:
    data = dict(info)
    data["backend_id"] = data.pop("id", None)
    data["type"] = "agent_backend"
    return data


def _filter_agent_config_json(backend_id: str, config_json: dict | None, role: str | None) -> dict:
    backend = agent_manager.get_agent(backend_id)
    context_schema = backend.context_schema if backend else None
    return filter_config_by_role(config_json or {}, role, context_schema=context_schema)


async def _serialize_agent(
    repo: AgentRepository,
    item,
    user: User,
    *,
    include_configurable_items: bool = False,
    backend_info_cache: dict[tuple[str, bool, str], dict] | None = None,
) -> dict:
    data = await repo.serialize(
        item,
        user=user,
        include_configurable_items=include_configurable_items,
        backend_info_cache=backend_info_cache,
    )
    data["config_json"] = _filter_agent_config_json(item.backend_id, data.get("config_json"), user.role)
    return data


@agent_router.get("/backends", response_model=AgentBackendListResponse, response_model_exclude_unset=True)
async def list_agent_backends(current_user: User = Depends(get_required_user)):
    infos = await agent_manager.get_agents_info(include_configurable_items=False)
    return {"backends": [_backend_info(info) for info in infos]}


@agent_router.get("/backends/{backend_id}", response_model=AgentBackendItem, response_model_exclude_unset=True)
async def get_agent_backend(
    backend_id: str,
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    backend = agent_manager.get_agent(backend_id)
    if not backend:
        raise HTTPException(status_code=404, detail=f"智能体后端 {backend_id} 不存在")
    return _backend_info(await backend.get_info(user_role=current_user.role, db=db, user=current_user))


@agent_router.get("", response_model=AgentListResponse, response_model_exclude_unset=True)
async def list_agents(
    include_subagents: bool = Query(False),
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    repo = AgentRepository(db)
    await repo.ensure_default_agent()
    items = await repo.list_visible(user=current_user, include_subagent_definitions=include_subagents)
    backend_info_cache: dict[tuple[str, bool, str], dict] = {}
    agents = [await _serialize_agent(repo, item, current_user, backend_info_cache=backend_info_cache) for item in items]
    return {"agents": agents}


@agent_router.get("/default", response_model=AgentItemResponse, response_model_exclude_unset=True)
async def get_default_agent(current_user: User = Depends(get_required_user), db: AsyncSession = Depends(get_db)):
    repo = AgentRepository(db)
    item = await repo.ensure_default_agent()
    if not item or not user_can_access_agent(current_user, item):
        raise HTTPException(status_code=404, detail="默认智能体不可访问")
    return {"agent": await _serialize_agent(repo, item, current_user, include_configurable_items=True)}


@agent_router.post("", response_model=AgentItemResponse, response_model_exclude_unset=True)
async def create_agent(
    payload: AgentCreate, current_user: User = Depends(get_required_user), db: AsyncSession = Depends(get_db)
):
    if not agent_manager.get_agent(payload.backend_id):
        raise HTTPException(status_code=404, detail=f"智能体后端 {payload.backend_id} 不存在")
    if payload.set_default:
        raise HTTPException(status_code=422, detail="默认智能体已固定为内置智能助手")

    repo = AgentRepository(db)
    try:
        item = await repo.create(
            name=payload.name,
            slug=payload.slug,
            backend_id=payload.backend_id,
            description=payload.description,
            icon=payload.icon,
            pics=payload.pics,
            config_json=_filter_agent_config_json(payload.backend_id, payload.config_json, current_user.role),
            share_config=payload.share_config,
            is_default=payload.set_default,
            is_subagent=payload.is_subagent,
            created_by=str(current_user.uid),
            creator=current_user,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"agent": await _serialize_agent(repo, item, current_user, include_configurable_items=True)}


@agent_router.get("/{agent_id}", response_model=AgentItemResponse, response_model_exclude_unset=True)
async def get_agent(agent_id: str, current_user: User = Depends(get_required_user), db: AsyncSession = Depends(get_db)):
    repo = AgentRepository(db)
    agent_slug = agent_id  # 兼容既有路径参数名；这里实际是 Agent.slug。
    item = await repo.get_visible_by_slug(slug=agent_slug, user=current_user, kind="any")
    if not item:
        raise HTTPException(status_code=404, detail="智能体不存在")
    return {"agent": await _serialize_agent(repo, item, current_user, include_configurable_items=True)}


@agent_router.put("/{agent_id}", response_model=AgentItemResponse, response_model_exclude_unset=True)
async def update_agent(
    agent_id: str,
    payload: AgentUpdate,
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    repo = AgentRepository(db)
    agent_slug = agent_id  # 兼容既有路径参数名；这里实际是 Agent.slug。
    item = await repo.get_visible_by_slug(slug=agent_slug, user=current_user, kind="any")
    if not item:
        raise HTTPException(status_code=404, detail="智能体不存在")
    if not user_can_manage_agent(current_user, item):
        raise HTTPException(status_code=403, detail="不能编辑非自己创建的智能体")

    try:
        fields_set = payload.model_fields_set
        if "description" in fields_set and payload.description is None:
            item.description = None
        if "icon" in fields_set and payload.icon is None:
            item.icon = None

        updated = await repo.update(
            item,
            name=payload.name,
            description=payload.description,
            icon=payload.icon,
            pics=payload.pics,
            config_json=_filter_agent_config_json(item.backend_id, payload.config_json, current_user.role)
            if payload.config_json is not None
            else None,
            share_config=payload.share_config,
            is_subagent=payload.is_subagent,
            updated_by=str(current_user.uid),
            updater=current_user,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"agent": await _serialize_agent(repo, updated, current_user, include_configurable_items=True)}


@agent_router.delete("/{agent_id}", response_model=AgentDeleteResponse, response_model_exclude_unset=True)
async def delete_agent(
    agent_id: str, current_user: User = Depends(get_required_user), db: AsyncSession = Depends(get_db)
):
    repo = AgentRepository(db)
    agent_slug = agent_id  # 兼容既有路径参数名；这里实际是 Agent.slug。
    item = await repo.get_visible_by_slug(slug=agent_slug, user=current_user, kind="any")
    if not item:
        raise HTTPException(status_code=404, detail="智能体不存在")
    if not user_can_manage_agent(current_user, item):
        raise HTTPException(status_code=403, detail="不能删除非自己创建的智能体")
    if is_builtin_agent(item):
        raise HTTPException(status_code=409, detail="内置智能体不能删除")
    await repo.delete(agent=item)
    return {"success": True}


@agent_router.post("/{agent_id}/set_default", response_model=AgentItemResponse, response_model_exclude_unset=True)
async def set_agent_default(
    agent_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    repo = AgentRepository(db)
    agent_slug = agent_id  # 兼容既有路径参数名；这里实际是 Agent.slug。
    item = await repo.get_by_slug(agent_slug)
    if not item:
        raise HTTPException(status_code=404, detail="智能体不存在")
    try:
        updated = await repo.set_default(agent=item, updated_by=str(current_user.uid))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"agent": await _serialize_agent(repo, updated, current_user, include_configurable_items=True)}


@agent_router.post("/runs", response_model=AgentRunCreateResponse, response_model_exclude_unset=True)
async def create_agent_run(
    payload: AgentRunCreate,
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    # resume 路径：恢复已有 LangGraph 状态，跳过 request 入队与派发，直接新建 run。
    if payload.resume is not None:
        if payload.queue_policy != "enqueue":
            raise HTTPException(status_code=422, detail="queue_policy 仅支持普通 Chat 请求")
        input_message = None
        if payload.query:
            input_message = build_chat_input_message(payload.query, payload.image_content)
        return await create_agent_run_view(
            input_message=input_message,
            agent_slug=payload.agent_slug,
            thread_id=payload.thread_id,
            meta=dict(payload.meta or {}),
            model_spec=payload.model_spec,
            tool_approval_mode=payload.tool_approval_mode,
            current_uid=str(current_user.uid),
            db=db,
            resume=payload.resume,
            created_by_run_id=payload.created_by_run_id,
        )

    # 普通 chat 路径：写入 request + message，立即派发或入队等待。
    meta = dict(payload.meta or {})
    request_id = meta.get("request_id") or str(uuid.uuid4())
    meta["request_id"] = request_id

    input_message = build_chat_input_message(payload.query or "", payload.image_content)

    return await submit_run_command(
        command=RunSubmissionCommand(
            agent_slug=payload.agent_slug,
            thread_id=payload.thread_id,
            request_id=request_id,
            input_message=input_message,
            origin=RunOrigin(source="chat", channel="web"),
            request_metadata={**meta, "tool_approval_mode": payload.tool_approval_mode},
            model_spec=payload.model_spec,
            tool_approval_mode=payload.tool_approval_mode,
            queue_policy=payload.queue_policy,
        ),
        current_user=current_user,
        db=db,
    )


@agent_router.get("/requests/{request_id}", response_model=AgentRequestResponse, response_model_exclude_unset=True)
async def get_request(
    request_id: str,
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    result = await get_request_svc(db=db, request_id=request_id, uid=str(current_user.uid))
    if not result:
        raise HTTPException(status_code=404, detail="请求不存在")
    return {"request": result}


@agent_router.get(
    "/thread/{thread_id}/requests",
    response_model=AgentThreadRequestsResponse,
    response_model_exclude_unset=True,
)
async def list_thread_requests(
    thread_id: str,
    current_user: User = Depends(get_required_user),
    agent_slug: str = Query(..., description="智能体 slug"),
    db: AsyncSession = Depends(get_db),
):
    return await get_thread_queue_snapshot(
        db=db,
        uid=str(current_user.uid),
        agent_slug=agent_slug,
        thread_id=thread_id,
    )


@agent_router.post(
    "/thread/{thread_id}/requests/continue",
    response_model=AgentThreadContinueResponse,
    response_model_exclude_unset=True,
)
async def continue_thread_requests(
    thread_id: str,
    current_user: User = Depends(get_required_user),
    agent_slug: str = Query(..., description="智能体 slug"),
    db: AsyncSession = Depends(get_db),
):
    dispatch = await continue_thread_queue(
        db=db,
        uid=str(current_user.uid),
        agent_slug=agent_slug,
        thread_id=thread_id,
    )
    await finalize_dispatch(db=db, dispatch=dispatch)
    return {"status": "dispatched", "request_id": dispatch.request_id, "run_id": dispatch.run_id}


@agent_router.post(
    "/requests/{request_id}/cancel",
    response_model=AgentRequestCancelResponse,
    response_model_exclude_unset=True,
)
async def cancel_request(
    request_id: str,
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    status = await cancel_queued_request_svc(request_id=request_id, current_uid=str(current_user.uid), db=db)
    await db.commit()
    return {"request_id": request_id, "status": status}


@agent_router.post(
    "/requests/{request_id}/steer",
    response_model=AgentRequestSteerResponse,
    response_model_exclude_unset=True,
)
async def steer_request(
    request_id: str,
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    result = await steer_queued_request(request_id=request_id, current_uid=str(current_user.uid), db=db)
    await db.commit()
    return {
        "request_id": result.request_id,
        "thread_id": result.thread_id,
        "status": result.status,
        "queue_policy": result.queue_policy,
        "queue_position": result.queue_position,
        "request_events_url": f"/api/agent/requests/{result.request_id}/events",
    }


@agent_router.get("/requests/{request_id}/events", response_class=StreamingResponse)
async def stream_request_events_route(
    request_id: str,
    current_user: User = Depends(get_required_user),
):
    return StreamingResponse(
        stream_request_events(
            request_id=request_id,
            uid=str(current_user.uid),
            db_session_factory=pg_manager.get_async_session_context,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@agent_router.get("/runs/{run_id}", response_model=AgentRunResponse, response_model_exclude_unset=True)
async def get_agent_run(
    run_id: str, current_user: User = Depends(get_required_user), db: AsyncSession = Depends(get_db)
):
    return await get_agent_run_view(run_id=run_id, current_uid=str(current_user.uid), db=db)


@agent_router.get(
    "/runs/{run_id}/result",
    response_model=AgentRunResultResponse,
    response_model_exclude_unset=True,
)
async def get_agent_run_result_route(
    run_id: str, current_user: User = Depends(get_required_user), db: AsyncSession = Depends(get_db)
):
    return await get_agent_run_result(run_id=run_id, current_uid=str(current_user.uid), db=db)


@agent_router.get(
    "/runs/{run_id}/langfuse",
    response_model=AgentRunLangfuseResponse,
    response_model_exclude_unset=True,
)
async def get_agent_run_langfuse_link_route(
    run_id: str, current_user: User = Depends(get_superadmin_user), db: AsyncSession = Depends(get_db)
):
    return await get_agent_run_langfuse_link(run_id=run_id, current_uid=str(current_user.uid), db=db)


@agent_router.post("/runs/{run_id}/cancel", response_model=AgentRunResponse, response_model_exclude_unset=True)
async def cancel_agent_run(
    run_id: str, current_user: User = Depends(get_required_user), db: AsyncSession = Depends(get_db)
):
    return await cancel_agent_run_view(run_id=run_id, current_uid=str(current_user.uid), db=db)


@agent_router.get(
    "/runs/{run_id}/events",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {"schema": RUN_EVENT_SCHEMA_REF}}}},
)
async def stream_run_events(
    run_id: str,
    after_seq: str = "0-0",
    verbose: bool = Query(default=True, description="是否返回完整事件载荷；false 时仅返回 UI/客户端消费所需字段"),
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    current_user: User = Depends(get_required_user),
):
    """按 Server-Sent Events 推送运行事件；每帧的 `data` 是一个 `RunEvent`，`id` 是续传游标。"""

    # 响应 schema 里的 `$ref RunEvent` 由 install_run_event_schema 注册：FastAPI 不注册手写
    # `responses` 里的模型。这段说明留在注释里，因为它不属于面向消费者的描述。
    cursor = last_event_id or after_seq
    return StreamingResponse(
        stream_agent_run_events(run_id=run_id, after_seq=cursor, current_uid=str(current_user.uid), verbose=verbose),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@agent_router.get(
    "/thread/{thread_id}/active_run",
    response_model=AgentActiveRunResponse,
    response_model_exclude_unset=True,
)
async def get_thread_active_run(
    thread_id: str,
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_active_run_by_thread(thread_id=thread_id, current_uid=str(current_user.uid), db=db)
