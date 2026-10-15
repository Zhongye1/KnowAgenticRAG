"""Subagent thread relation repository."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ars.storage.postgres.models_business import SubagentThread


class SubagentThreadRepository:
    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    async def get_by_child_thread_for_user(self, child_thread_id: str, uid: str) -> SubagentThread | None:
        """按子线程 ID 查找当前用户可见的父子线程关系。"""
        result = await self.db.execute(
            select(SubagentThread).where(
                SubagentThread.child_thread_id == child_thread_id,
                SubagentThread.uid == str(uid),
            )
        )
        return result.scalar_one_or_none()

    async def get_for_user(self, relation_id: int, uid: str) -> SubagentThread | None:
        """按关系记录主键读取当前用户的子智能体线程关系。"""
        result = await self.db.execute(
            select(SubagentThread).where(
                SubagentThread.id == relation_id,
                SubagentThread.uid == str(uid),
            )
        )
        return result.scalar_one_or_none()

    async def get_by_child_conversation_for_user(self, child_conversation_id: int, uid: str) -> SubagentThread | None:
        """按子对话 ID 查找父子线程关系，用于从 conversation 反查父线程。"""
        result = await self.db.execute(
            select(SubagentThread).where(
                SubagentThread.child_conversation_id == child_conversation_id,
                SubagentThread.uid == str(uid),
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        uid: str,
        parent_conversation_id: int,
        child_conversation_id: int,
        child_thread_id: str,
        subagent_slug: str,
        created_by_run_id: str,
    ) -> SubagentThread:
        """创建一条父对话到子对话的线程关系记录。"""
        item = SubagentThread(
            uid=str(uid),
            parent_conversation_id=parent_conversation_id,
            child_conversation_id=child_conversation_id,
            child_thread_id=child_thread_id,
            subagent_slug=subagent_slug,
            created_by_run_id=created_by_run_id,
        )
        self.db.add(item)
        await self.db.flush()
        return item
