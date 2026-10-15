from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from server.utils.auth_middleware import get_db, get_required_user
from sqlalchemy.ext.asyncio import AsyncSession
from ars.services.mention_search_service import (
    InvalidMentionThreadError,
    MentionThreadNotFoundError,
    search_mentions,
)
from ars.storage.postgres.models_business import User

mention_router = APIRouter(prefix="/mention", tags=["mention"])


class MentionFileItem(BaseModel):
    """提及文件搜索结果条目"""

    name: str
    path: str
    is_dir: bool
    source: str


@mention_router.get("/search", response_model=list[MentionFileItem])
async def search_mention_files(
    thread_id: str | None = Query(None, description="当前聊天会话 ID；为空时仅搜索用户工作区"),
    query: str = Query("", description="模糊搜索关键字"),
    sources: str | None = Query(None, description="搜索来源：workspace,thread；为空时自动选择"),
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    """
    提及文件模糊搜索接口：未创建 thread 时只搜索用户 workspace；已有 thread 时可搜索当前对话文件。
    """
    try:
        return await search_mentions(
            thread_id=thread_id,
            query=query,
            sources=sources,
            current_user=current_user,
            db=db,
        )
    except MentionThreadNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidMentionThreadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
