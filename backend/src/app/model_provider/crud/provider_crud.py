"""模型供应商 CRUD（system 级，非租户表，ragf-design D4/D14）。"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy_crud_plus import CRUDPlus

from backend.src.app.model_provider.model.provider import ModelProvider


class CRUDProvider(CRUDPlus[ModelProvider]):
    """模型供应商数据库操作"""

    async def get(self, db: AsyncSession, provider_id: str) -> ModelProvider | None:
        """按 provider_id 查询。"""
        return await self.select_model_by_column(db, provider_id=provider_id)

    async def get_list(self, db: AsyncSession) -> list[ModelProvider]:
        """全部供应商（启用的在前，provider_id 升序）。"""
        stmt = select(ModelProvider).order_by(ModelProvider.is_enabled.desc(), ModelProvider.provider_id.asc())
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, db: AsyncSession, data: dict) -> ModelProvider:
        """创建供应商配置。"""
        provider = ModelProvider(**data)
        db.add(provider)
        await db.flush()
        await db.refresh(provider)
        return provider

    async def update(self, db: AsyncSession, provider: ModelProvider, data: dict) -> ModelProvider:
        """更新供应商配置（provider_id 不可改）。"""
        for key, value in data.items():
            if key != 'provider_id':
                setattr(provider, key, value)
        await db.flush()
        await db.refresh(provider)
        return provider

    async def delete(self, db: AsyncSession, provider: ModelProvider) -> None:
        """删除供应商配置。"""
        await db.delete(provider)
        await db.flush()


provider_dao = CRUDProvider(ModelProvider)
