"""Project 持久化 Repository。"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ars.repositories.conversation_repository import INVOCATION_CONVERSATION_SOURCES
from ars.storage.postgres.models_business import Conversation, Project


class ProjectRepository:
    """读写当前用户的 Project 业务事实。"""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    async def add(self, project: Project) -> Project:
        """新增 Project 并 flush。"""
        self.db.add(project)
        await self.db.flush()
        return project

    async def get_for_user(self, project_id: str, uid: str) -> Project | None:
        """按用户读取 Project。"""
        return await self.db.scalar(select(Project).where(Project.id == project_id, Project.uid == str(uid)))

    async def get_by_idempotency_key(self, idempotency_key: str, uid: str) -> Project | None:
        """按用户和幂等键读取 Project。"""
        return await self.db.scalar(
            select(Project).where(Project.uid == str(uid), Project.idempotency_key == idempotency_key)
        )

    async def list_selectable_for_user(self, uid: str) -> list[Project]:
        """列出用户可选择的 Project。"""
        result = await self.db.execute(
            select(Project)
            .where(Project.uid == str(uid), Project.selection_status == "selectable")
            .order_by(Project.updated_at.desc(), Project.id.desc())
        )
        return list(result.scalars().all())

    async def list_selectable_workdir_paths_for_user(self, uid: str) -> list[str]:
        """列出用户已选择 Project 的去重 Workdir 路径。"""
        result = await self.db.execute(
            select(Project.workdir_path)
            .where(Project.uid == str(uid), Project.selection_status == "selectable")
            .distinct()
        )
        return list(result.scalars().all())

    async def list_history_candidates(self, uid: str) -> list[tuple[Conversation, str]]:
        """列出可解析实际 Workdir 的普通历史对话。"""
        result = await self.db.execute(
            select(Conversation, Project.workdir_path)
            .join(Project, (Project.uid == Conversation.uid) & (Project.id == Conversation.project_id))
            .where(
                Conversation.uid == str(uid),
                Conversation.status == "active",
                (
                    Conversation.extra_metadata.is_(None)
                    | Conversation.extra_metadata["source"].as_string().is_(None)
                    | Conversation.extra_metadata["source"].as_string().notin_(INVOCATION_CONVERSATION_SOURCES)
                ),
            )
            .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        )
        return list(result.all())
