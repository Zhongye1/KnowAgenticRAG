"""Project HTTP 适配层。"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from server.utils.auth_middleware import get_db, get_required_user
from ars.services.project_service import (
    create_project_view,
    list_history_candidates_view,
    list_projects_view,
)
from ars.storage.postgres.models_business import User

projects = APIRouter(prefix="/projects", tags=["projects"])


class ProjectWorkdirCreate(BaseModel):
    """Project Workdir 创建意图。"""

    model_config = ConfigDict(extra="forbid")

    mode: str = "managed"
    path: str | None = None


class ProjectCreate(BaseModel):
    """独立 Project 创建请求。"""

    model_config = ConfigDict(extra="forbid")

    request_id: str = Field(..., min_length=1, max_length=128)
    name: str
    workdir: ProjectWorkdirCreate


@projects.get("")
async def list_projects(
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    """列出当前用户可选择的 Project。"""
    return await list_projects_view(uid=str(current_user.uid), db=db)


@projects.post("")
async def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    """独立创建 managed 或 linked Project。"""
    return await create_project_view(
        uid=str(current_user.uid),
        request_id=payload.request_id,
        name=payload.name,
        directory_mode=payload.workdir.mode,
        workdir_path=payload.workdir.path,
        db=db,
    )


@projects.get("/history-candidates")
async def list_history_candidates(
    q: str = Query("", max_length=200),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    """列出可作为目录快捷选择的历史 Conversation。"""
    return await list_history_candidates_view(
        uid=str(current_user.uid), db=db, query=q, limit=limit, offset=offset
    )
