"""Project 创建、选择与历史目录复用用例。"""

from __future__ import annotations

import uuid

from ars.repositories.project_repository import ProjectRepository
from ars.storage.postgres.models_business import Project
from ars.workspace.paths import normalize_linked_workdir_path
from ars.workspace.workdir import Workdir
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

MAX_PROJECT_NAME_LENGTH = 255


async def _lock_project_workdir_changes(*, db, uid: str) -> None:
    """串行化同一用户的 linked Project 绑定与测试目录删除。"""
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:lock_key, 0))"),
        {"lock_key": f"project-workdir:{uid}"},
    )


def _normalize_project_name(name: str | None, *, required: bool) -> str | None:
    """规范化并校验 Project 名称。"""
    normalized_name = (name or "").strip()
    if required and not normalized_name:
        raise HTTPException(status_code=422, detail="项目名称不能为空")
    if len(normalized_name) > MAX_PROJECT_NAME_LENGTH:
        raise HTTPException(status_code=422, detail="项目名称过长")
    return normalized_name or None


def _matches_creation_intent(project: Project, *, name: str, workdir_path: str) -> bool:
    """判断已有 Project 是否匹配当前创建意图。"""
    return project.name == name and project.directory_mode == "linked" and project.workdir_path == workdir_path


async def create_project_record(
    *,
    uid: str,
    name: str | None,
    directory_mode: str,
    selection_status: str,
    db,
    workdir_path: str | None = None,
    idempotency_key: str | None = None,
) -> Project:
    """在当前事务内创建 Project，但不提交或物化 managed 目录。"""
    normalized_name = _normalize_project_name(name, required=selection_status == "selectable")
    if directory_mode not in {"managed", "linked"}:
        raise HTTPException(status_code=422, detail="directory_mode 必须是 managed 或 linked")
    if selection_status not in {"implicit", "selectable"}:
        raise HTTPException(status_code=422, detail="selection_status 非法")

    project_id = str(uuid.uuid4())
    if directory_mode == "managed":
        if workdir_path is not None:
            raise HTTPException(status_code=422, detail="managed Project 不接受 workdir_path")
        normalized_path = f"projects/{project_id}"
    else:
        if workdir_path is None:
            raise HTTPException(status_code=422, detail="linked Project 必须指定 workdir_path")
        try:
            normalized_path = normalize_linked_workdir_path(workdir_path)
            await _lock_project_workdir_changes(db=db, uid=str(uid))
            Workdir.open_existing(str(uid), normalized_path)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="目录不存在") from exc
        except (NotADirectoryError, PermissionError, OSError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    project = Project(
        id=project_id,
        uid=str(uid),
        name=normalized_name,
        selection_status=selection_status,
        workdir_path=normalized_path,
        directory_mode=directory_mode,
        idempotency_key=idempotency_key.strip() if idempotency_key else None,
    )
    return await ProjectRepository(db).add(project)


async def create_implicit_project(*, uid: str, db, idempotency_key: str | None = None) -> Project:
    """为新 Conversation 创建 implicit managed Project。"""
    return await create_project_record(
        uid=uid,
        name=None,
        directory_mode="managed",
        selection_status="implicit",
        db=db,
        idempotency_key=idempotency_key,
    )


async def create_project_view(
    *, uid: str, request_id: str, name: str, directory_mode: str, workdir_path: str | None, db
) -> dict:
    """幂等创建 selectable Project。"""
    normalized_request_id = (request_id or "").strip()
    if not normalized_request_id:
        raise HTTPException(status_code=422, detail="request_id 不能为空")
    if directory_mode != "linked" or not (workdir_path or "").strip():
        raise HTTPException(status_code=422, detail="手动创建项目必须选择目录")
    existing = await ProjectRepository(db).get_by_idempotency_key(normalized_request_id, str(uid))
    normalized_name = _normalize_project_name(name, required=True)
    try:
        normalized_path = normalize_linked_workdir_path(workdir_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if existing is not None:
        if not _matches_creation_intent(
            existing,
            name=normalized_name,
            workdir_path=normalized_path,
        ):
            raise HTTPException(status_code=409, detail="request_id 已用于其他 Project 创建意图")
        return existing.to_dict()

    try:
        project = await create_project_record(
            uid=uid,
            name=name,
            directory_mode=directory_mode,
            selection_status="selectable",
            workdir_path=workdir_path,
            db=db,
            idempotency_key=normalized_request_id,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        replay = await ProjectRepository(db).get_by_idempotency_key(normalized_request_id, str(uid))
        if replay is None:
            raise HTTPException(status_code=409, detail="Project 创建冲突")
        if not _matches_creation_intent(
            replay,
            name=normalized_name,
            workdir_path=normalized_path,
        ):
            raise HTTPException(status_code=409, detail="request_id 已用于其他 Project 创建意图")
        project = replay
    return project.to_dict()


async def list_projects_view(*, uid: str, db) -> list[dict]:
    """列出当前用户可选择的 Project。"""
    projects = await ProjectRepository(db).list_selectable_for_user(str(uid))
    return [project.to_dict() for project in projects]


async def list_history_candidates_view(*, uid: str, db, query: str = "", limit: int = 20, offset: int = 0) -> dict:
    """列出可作为新建 Project 目录快捷入口的历史 Conversation。"""
    conversations = await ProjectRepository(db).list_history_candidates(str(uid))
    normalized_query = (query or "").strip().lower()
    items = []
    seen_workdirs = set()
    for item, workdir_path in conversations:
        if workdir_path in seen_workdirs:
            continue
        if (
            normalized_query
            and normalized_query not in (item.title or "").lower()
            and normalized_query not in (item.agent_id or "").lower()
        ):
            continue
        seen_workdirs.add(workdir_path)
        items.append(
            {
                "thread_id": item.thread_id,
                "title": item.title,
                "agent_id": item.agent_id,
                "workdir_path": workdir_path,
                "updated_at": item.updated_at.isoformat(),
            }
        )
    return {"items": items[offset : offset + limit], "has_more": len(items) > offset + limit}
