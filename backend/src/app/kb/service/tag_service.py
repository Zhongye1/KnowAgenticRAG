"""标签目录服务。"""

from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud import keyword_dao


class TagService:
    """标签目录业务逻辑。"""

    @staticmethod
    async def list_tags(*, db: AsyncSession, limit: int = 100) -> list[dict]:
        """标签目录。"""
        return await keyword_dao.list_tags(db, limit=limit)

    @staticmethod
    async def resolve_tags(*, db: AsyncSession, tags: list[str], cap: int = 1000) -> list[str]:
        """标签 → 文档 ID（scope filter 用）。"""
        return await keyword_dao.resolve_tags(db, tags, cap=cap)


tag_service = TagService()
