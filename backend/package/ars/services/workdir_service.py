"""授权 Conversation 对持久化 Project Workdir 的访问。"""

from __future__ import annotations

from dataclasses import dataclass

from ars.repositories.conversation_repository import ConversationRepository
from ars.repositories.project_repository import ProjectRepository
from ars.workspace.paths import ensure_bound_user_workdir
from ars.workspace.workdir import Workdir
from fastapi import HTTPException


@dataclass(frozen=True, slots=True)
class AuthorizedWorkdir:
    """Service 授权上下文与持久化 Workdir。"""

    conversation_id: int
    thread_id: str
    uid: str
    workdir: Workdir
    project_id: str
    directory_mode: str

    @property
    def workdir_path(self) -> str:
        return self.workdir.relative_path


async def resolve_authorized_workdir(*, thread_id: str, uid: str, db) -> AuthorizedWorkdir:
    """授权线程并统一解析 Project 或历史 Workdir 绑定。"""
    conversation = await ConversationRepository(db).get_conversation_by_thread_id(thread_id)
    if conversation is None or conversation.uid != str(uid) or conversation.status == "deleted":
        raise HTTPException(status_code=404, detail="对话线程不存在")
    workdir_path, project = await resolve_conversation_workdir_binding(
        conversation=conversation,
        uid=str(uid),
        db=db,
    )
    return AuthorizedWorkdir(
        conversation_id=conversation.id,
        thread_id=conversation.thread_id,
        uid=str(uid),
        workdir=Workdir.open_existing(str(uid), workdir_path),
        project_id=project.id,
        directory_mode=project.directory_mode,
    )


async def resolve_conversation_workdir_path(*, conversation, uid: str, db) -> str:
    """解析已授权 Conversation 的唯一持久 Workdir 路径。"""
    workdir_path, _project = await resolve_conversation_workdir_binding(
        conversation=conversation,
        uid=uid,
        db=db,
    )
    return workdir_path


async def ensure_conversation_workdir_available(*, conversation, uid: str, db) -> str:
    """确保 Conversation 的持久 Workdir 可用，并返回其相对路径。"""
    workdir_path, project = await resolve_conversation_workdir_binding(
        conversation=conversation,
        uid=uid,
        db=db,
    )
    if project.directory_mode == "managed":
        ensure_bound_user_workdir(str(uid), workdir_path)
    else:
        Workdir.open_existing(str(uid), workdir_path)
    return workdir_path


async def resolve_conversation_workdir_binding(*, conversation, uid: str, db):
    """解析 Conversation 唯一 Project 所拥有的持久 Workdir。"""
    project = await ProjectRepository(db).get_for_user(conversation.project_id, str(uid))
    if project is None:
        raise RuntimeError("Conversation 绑定的 Project 不存在")
    return project.workdir_path, project
