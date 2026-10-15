import uuid
from typing import Any

from ars.repositories.agent_repository import AgentRepository
from ars.repositories.agent_run_repository import AgentRunRepository
from ars.repositories.conversation_repository import INVOCATION_CONVERSATION_SOURCES, ConversationRepository
from ars.repositories.project_repository import ProjectRepository
from ars.services.attachment_service import serialize_attachment
from ars.services.project_service import create_implicit_project
from ars.services.workdir_service import ensure_conversation_workdir_available, resolve_conversation_workdir_path
from ars.storage.postgres.models_business import AGENT_RUN_TERMINAL_STATUSES, AgentRun, User
from ars.utils.datetime_utils import format_utc_datetime
from ars.utils.logging_config import logger
from ars.workspace.paths import ensure_bound_user_workdir
from ars.workspace.workdir import Workdir
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession


def _thread_status(run_id: str | None, run_status: str | None, last_viewed_run_id: str | None) -> str:
    """将线程最新顶层 run 与查看记录映射为侧边栏三态。

    loading: 顶层 run 进行中；ready: run 已终态且未查看；done: 无 run 或已查看。
    """
    if run_id is None:
        return "done"
    if run_status not in AGENT_RUN_TERMINAL_STATUSES:
        return "loading"
    if run_id == last_viewed_run_id:
        return "done"
    return "ready"


async def _serialize_thread(
    conversation: Any,
    *,
    thread_status: str,
    db,
    workdir_path: str | None = None,
) -> dict:
    """序列化线程，列表调用方可传入已联查的 Project Workdir。"""
    return {
        "id": conversation.thread_id,
        "uid": conversation.uid,
        "agent_id": conversation.agent_id,
        "title": conversation.title,
        "is_pinned": bool(conversation.is_pinned),
        "project_id": conversation.project_id,
        "workdir_path": workdir_path
        or await resolve_conversation_workdir_path(conversation=conversation, uid=str(conversation.uid), db=db),
        "created_at": conversation.created_at.isoformat(),
        "updated_at": conversation.updated_at.isoformat(),
        "metadata": conversation.extra_metadata or {},
        "thread_status": thread_status,
    }


def _matches_thread_creation_intent(conversation, project, *, agent_slug: str, project_id: str | None) -> bool:
    """判断已有 Conversation 是否匹配当前幂等创建意图。"""
    same_project_intent = (
        conversation.project_id == project_id
        if project_id
        else project is not None and project.selection_status == "implicit"
    )
    return conversation.agent_id == agent_slug and same_project_intent


def _format_naive_utc_isoformat(value: Any) -> str | None:
    """将数据库中的 naive UTC 时间序列化为带 Z 后缀的 ISO 字符串。"""
    if value is None:
        return None
    return value.isoformat() + "Z"


async def require_user_conversation(conv_repo: ConversationRepository, thread_id: str, uid: str):
    conversation = await conv_repo.get_conversation_by_thread_id(thread_id)
    if not conversation or conversation.uid != str(uid) or conversation.status == "deleted":
        raise HTTPException(status_code=404, detail="对话线程不存在")
    return conversation


async def create_thread_view(
    *,
    agent_slug: str,
    request_id: str | None,
    title: str | None,
    metadata: dict | None,
    project_id: str | None = None,
    db: AsyncSession,
    current_uid: str,
) -> dict:
    if metadata and "attachments" in metadata:
        raise HTTPException(status_code=400, detail="metadata.attachments 是服务端保留字段")

    user_result = await db.execute(select(User).where(User.uid == str(current_uid)))
    current_user = user_result.scalar_one_or_none()
    if not current_user:
        raise HTTPException(status_code=404, detail="用户不存在")

    agent_repo = AgentRepository(db)
    agent_item = await agent_repo.get_visible_by_slug(slug=agent_slug, user=current_user)
    if not agent_item:
        raise HTTPException(status_code=404, detail="智能体不存在")

    conv_repo = ConversationRepository(db)
    normalized_request_id = str(request_id or "").strip() or None
    if normalized_request_id:
        existing = await conv_repo.get_conversation_by_creation_request_id(str(current_uid), normalized_request_id)
        if existing is not None:
            existing_project = await ProjectRepository(db).get_for_user(existing.project_id, str(current_uid))
            if not _matches_thread_creation_intent(
                existing,
                existing_project,
                agent_slug=agent_item.slug,
                project_id=project_id,
            ):
                raise HTTPException(status_code=409, detail="request_id 已用于其他 Conversation 创建意图")
            await ensure_conversation_workdir_available(conversation=existing, uid=str(current_uid), db=db)
            return await _serialize_thread(existing, thread_status="done", db=db)

    thread_id = str(uuid.uuid4())
    thread_metadata = dict(metadata or {})
    thread_metadata["backend_id"] = agent_item.backend_id
    if project_id:
        project = await ProjectRepository(db).get_for_user(project_id, str(current_uid))
        if project is None or project.selection_status != "selectable":
            raise HTTPException(status_code=404, detail="Project 不存在")
        try:
            Workdir.open_existing(str(current_uid), project.workdir_path)
        except (FileNotFoundError, NotADirectoryError, PermissionError, OSError, ValueError) as exc:
            raise HTTPException(status_code=409, detail="项目目录不可用") from exc
    else:
        try:
            project = await create_implicit_project(
                uid=str(current_uid),
                db=db,
                idempotency_key=f"thread:{normalized_request_id}" if normalized_request_id else None,
            )
        except IntegrityError:
            await db.rollback()
            if not normalized_request_id:
                raise
            project = await ProjectRepository(db).get_by_idempotency_key(
                f"thread:{normalized_request_id}", str(current_uid)
            )
            if project is None or project.selection_status != "implicit":
                raise HTTPException(status_code=409, detail="request_id 已用于其他 Conversation 创建意图")
    try:
        conversation = await conv_repo.add_conversation(
            uid=str(current_uid),
            agent_id=agent_item.slug,
            title=title or "新的对话",
            thread_id=thread_id,
            metadata=thread_metadata,
            project_id=project.id,
            creation_request_id=normalized_request_id,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        if not normalized_request_id:
            raise
        conversation = await conv_repo.get_conversation_by_creation_request_id(str(current_uid), normalized_request_id)
        if conversation is None:
            implicit_project = await ProjectRepository(db).get_by_idempotency_key(
                f"thread:{normalized_request_id}", str(current_uid)
            )
            if implicit_project is None or project_id:
                raise
            project = implicit_project
            conversation = await conv_repo.add_conversation(
                uid=str(current_uid),
                agent_id=agent_item.slug,
                title=title or "新的对话",
                thread_id=thread_id,
                metadata=thread_metadata,
                project_id=project.id,
                creation_request_id=normalized_request_id,
            )
            await db.commit()
        existing_project = await ProjectRepository(db).get_for_user(conversation.project_id, str(current_uid))
        if not _matches_thread_creation_intent(
            conversation,
            existing_project,
            agent_slug=agent_item.slug,
            project_id=project_id,
        ):
            raise HTTPException(status_code=409, detail="request_id 已用于其他 Conversation 创建意图")
        project = existing_project

    try:
        if project.directory_mode == "managed":
            ensure_bound_user_workdir(str(current_uid), project.workdir_path)
    except (FileNotFoundError, NotADirectoryError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return await _serialize_thread(conversation, thread_status="done", db=db)


async def list_threads_view(
    *,
    agent_slug: str | None,
    db: AsyncSession,
    current_uid: str,
    limit: int | None = None,
    offset: int = 0,
) -> list[dict]:
    conv_repo = ConversationRepository(db)
    conversations = await conv_repo.list_conversations(
        uid=str(current_uid),
        agent_id=agent_slug,
        status="active",
        limit=limit,
        offset=offset,
        exclude_sources=INVOCATION_CONVERSATION_SOURCES,
    )

    run_repo = AgentRunRepository(db)
    thread_ids = [conv.thread_id for conv in conversations]
    run_map = await run_repo.get_latest_top_level_runs_for_threads(str(current_uid), thread_ids)

    return [
        await _serialize_thread(
            conv,
            thread_status=_thread_status(
                *run_map.get(conv.thread_id, (None, None)),
                conv.last_viewed_run_id,
            ),
            db=db,
            workdir_path=conv.project.workdir_path,
        )
        for conv in conversations
    ]


async def search_threads_view(
    *,
    query: str,
    agent_id: str | None,
    db: AsyncSession,
    current_uid: str,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    normalized_query = str(query or "").strip()
    if not normalized_query:
        return {"items": [], "has_more": False, "limit": limit, "offset": offset}

    conv_repo = ConversationRepository(db)
    search_items, has_more = await conv_repo.search_conversations_by_message_content(
        uid=str(current_uid),
        agent_id=agent_id,
        query=normalized_query,
        limit=limit,
        offset=offset,
        exclude_sources=INVOCATION_CONVERSATION_SOURCES,
    )

    items = []
    for item in search_items:
        conv = item["conversation"]
        snippets = [
            {
                "message_id": snippet.get("message_id"),
                "content": snippet.get("content") or "",
                "created_at": format_utc_datetime(snippet.get("created_at")),
            }
            for snippet in item.get("snippets", [])
        ]
        items.append(
            {
                "id": conv.thread_id,
                "thread_id": conv.thread_id,
                "uid": conv.uid,
                "agent_id": conv.agent_id,
                "title": conv.title,
                "is_pinned": bool(conv.is_pinned),
                "created_at": format_utc_datetime(conv.created_at),
                "updated_at": format_utc_datetime(conv.updated_at),
                "metadata": conv.extra_metadata or {},
                "matched_count": item.get("matched_count", 0),
                "message_id": item.get("message_id"),
                "latest_match_at": format_utc_datetime(item.get("latest_match_at")),
                "snippets": snippets,
            }
        )

    return {"items": items, "has_more": has_more, "limit": limit, "offset": offset}


async def delete_thread_view(
    *,
    thread_id: str,
    db: AsyncSession,
    current_uid: str,
) -> dict:
    conv_repo = ConversationRepository(db)
    await require_user_conversation(conv_repo, thread_id, str(current_uid))
    deleted = await conv_repo.delete_conversation(thread_id, soft_delete=True)
    if not deleted:
        raise HTTPException(status_code=404, detail="对话线程不存在")

    return {"message": "删除成功"}


async def update_thread_view(
    *,
    thread_id: str,
    title: str | None = None,
    is_pinned: bool | None = None,
    tool_approval_mode: str | None = None,
    db: AsyncSession,
    current_uid: str,
) -> dict:
    conv_repo = ConversationRepository(db)
    await require_user_conversation(conv_repo, thread_id, str(current_uid))
    metadata = {"tool_approval_mode": tool_approval_mode} if tool_approval_mode is not None else None
    updated_conv = await conv_repo.update_conversation(
        thread_id,
        title=title,
        is_pinned=is_pinned,
        metadata=metadata,
    )
    if not updated_conv:
        raise HTTPException(status_code=500, detail="更新失败")

    run_repo = AgentRunRepository(db)
    run_map = await run_repo.get_latest_top_level_runs_for_threads(str(current_uid), [updated_conv.thread_id])
    run_id, run_status = run_map.get(updated_conv.thread_id, (None, None))

    return await _serialize_thread(
        updated_conv,
        thread_status=_thread_status(run_id, run_status, updated_conv.last_viewed_run_id),
        db=db,
    )


async def mark_thread_viewed_view(
    *,
    thread_id: str,
    db: AsyncSession,
    current_uid: str,
) -> dict:
    """记录用户已查看该线程的最新顶层 run，使未读状态转为已读。"""
    conv_repo = ConversationRepository(db)
    conversation = await require_user_conversation(conv_repo, thread_id, str(current_uid))

    run_repo = AgentRunRepository(db)
    run_map = await run_repo.get_latest_top_level_runs_for_threads(str(current_uid), [thread_id])
    run_id, run_status = run_map.get(thread_id, (None, None))

    if run_id and run_status in AGENT_RUN_TERMINAL_STATUSES:
        conversation = await conv_repo.mark_thread_viewed(thread_id, run_id)

    return await _serialize_thread(
        conversation,
        thread_status=_thread_status(run_id, run_status, conversation.last_viewed_run_id),
        db=db,
    )


async def get_thread_history_view(
    *,
    thread_id: str,
    current_uid: str,
    db: AsyncSession,
) -> dict:
    """获取对话历史消息，包含用户反馈状态"""
    conv_repo = ConversationRepository(db)
    conversation = await conv_repo.get_conversation_by_thread_id(thread_id)
    if not conversation or conversation.uid != str(current_uid) or conversation.status == "deleted":
        raise HTTPException(status_code=404, detail="对话线程不存在")

    messages = await conv_repo.get_messages_by_thread_id(thread_id)
    messages = [
        message
        for message in messages
        if not (message.role == "user" and message.delivery_status in {"queued", "cancelled", "rejected"})
    ]

    run_ids_in_messages = {msg.run_id for msg in messages if msg.run_id}
    run_created_at: dict[str, Any] = {}
    run_timing: dict[str, tuple[Any, Any]] = {}
    if run_ids_in_messages:
        run_result = await db.execute(
            select(AgentRun.id, AgentRun.created_at, AgentRun.started_at, AgentRun.finished_at)
            .where(AgentRun.id.in_(run_ids_in_messages))
            .order_by(AgentRun.created_at.asc(), AgentRun.id.asc())
        )
        for run_id, created_at, started_at, finished_at in run_result.all():
            run_created_at[run_id] = created_at
            run_timing[run_id] = (started_at, finished_at)
    messages.sort(
        key=lambda message: (
            run_created_at.get(message.run_id) or message.created_at,
            0 if message.role == "user" else 1,
            message.created_at,
            message.id,
        )
    )
    message_request_ids = set()
    for msg in messages:
        request_id = (msg.extra_metadata or {}).get("request_id")
        if msg.role == "user" and request_id:
            message_request_ids.add(str(request_id))
    attachments_by_request_id: dict[str, list[dict]] = {}
    if message_request_ids:
        for attachment in await conv_repo.get_attachments(conversation.id):
            request_id = attachment.get("request_id")
            if not request_id or str(request_id) not in message_request_ids:
                continue
            attachments_by_request_id.setdefault(str(request_id), []).append(
                serialize_attachment(attachment, thread_id=thread_id)
            )

    history: list[dict] = []
    role_type_map = {"user": "human", "assistant": "ai", "tool": "tool", "system": "system"}

    for msg in messages:
        user_feedback = None
        if msg.feedbacks:
            for feedback in msg.feedbacks:
                if feedback.uid == str(current_uid):
                    user_feedback = {
                        "id": feedback.id,
                        "rating": feedback.rating,
                        "reason": feedback.reason,
                        "created_at": feedback.created_at.isoformat() if feedback.created_at else None,
                    }
                    break

        extra_metadata = dict(msg.extra_metadata or {})
        request_id = extra_metadata.get("request_id")
        if msg.role == "user" and request_id and not extra_metadata.get("attachments"):
            extra_metadata["attachments"] = attachments_by_request_id.get(str(request_id), [])

        msg_dict = {
            "id": msg.id,
            "type": role_type_map.get(msg.role, msg.role),
            "content": msg.content,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
            "run_id": msg.run_id,
            "request_id": msg.request_id,
            "delivery_status": msg.delivery_status,
            "error_type": extra_metadata.get("error_type"),
            "error_message": extra_metadata.get("error_message"),
            "extra_metadata": extra_metadata,
            "message_type": msg.message_type,
            "image_content": msg.image_content,
            "feedback": user_feedback,
        }

        if msg.role == "assistant":
            started_at, finished_at = run_timing.get(msg.run_id, (None, None))
            msg_dict["run_started_at"] = _format_naive_utc_isoformat(started_at)
            msg_dict["run_finished_at"] = _format_naive_utc_isoformat(finished_at)

        if msg.tool_calls:
            msg_dict["tool_calls"] = [
                {
                    "id": tc.langgraph_tool_call_id or str(tc.id),
                    "name": tc.tool_name,
                    "function": {"name": tc.tool_name},
                    "args": tc.tool_input or {},
                    "tool_call_result": {"content": (tc.tool_output or "")} if tc.status == "success" else None,
                    "status": tc.status,
                    "error_message": tc.error_message,
                }
                for tc in msg.tool_calls
            ]

        history.append(msg_dict)

    logger.info(f"Loaded {len(history)} messages with feedback for thread {thread_id}")
    return {"history": history}
