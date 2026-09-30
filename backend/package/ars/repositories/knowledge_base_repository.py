from __future__ import annotations

from typing import Any

from sqlalchemy import func, select

from ars.knowledge.cache import cache_kb_config, delete_cached_kb_config, kb_config_cache_lock
from ars.storage.postgres.manager import pg_manager
from ars.storage.postgres.models_knowledge import KnowledgeBase


class KnowledgeBaseRepository:
    async def count_by_type(self) -> list[tuple[str, int]]:
        """按知识库类型聚合数量。"""
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(
                select(KnowledgeBase.kb_type, func.count(KnowledgeBase.id)).group_by(KnowledgeBase.kb_type)
            )
            return [(str(kb_type or "unknown"), int(count or 0)) for kb_type, count in result.all()]

    async def get_all(self) -> list[KnowledgeBase]:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(select(KnowledgeBase))
            return list(result.scalars().all())

    async def get_by_kb_id(self, kb_id: str) -> KnowledgeBase | None:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(select(KnowledgeBase).where(KnowledgeBase.kb_id == kb_id))
            return result.scalar_one_or_none()

    async def create(self, data: dict[str, Any]) -> KnowledgeBase:
        kb = KnowledgeBase(**data)
        async with pg_manager.get_async_session_context() as session:
            session.add(kb)
        await cache_kb_config(kb)
        return kb

    async def update(self, kb_id: str, data: dict[str, Any]) -> KnowledgeBase | None:
        async with kb_config_cache_lock(kb_id):
            # 先可靠清除旧值；失败时不进入数据库事务。
            await delete_cached_kb_config(kb_id)
            async with pg_manager.get_async_session_context() as session:
                result = await session.execute(select(KnowledgeBase).where(KnowledgeBase.kb_id == kb_id))
                kb = result.scalar_one_or_none()
                if kb is None:
                    return None
                for key, value in data.items():
                    setattr(kb, key, value)
            return kb

    async def merge_query_params_options(self, kb_id: str, params: dict[str, Any]) -> KnowledgeBase | None:
        """在行锁内合并知识库查询参数，避免并发部分更新互相覆盖。"""
        async with kb_config_cache_lock(kb_id):
            await delete_cached_kb_config(kb_id)
            async with pg_manager.get_async_session_context() as session:
                statement = select(KnowledgeBase).where(KnowledgeBase.kb_id == kb_id).with_for_update()
                result = await session.execute(statement)
                kb = result.scalar_one_or_none()
                if kb is None:
                    return None

                query_params = dict(kb.query_params or {})
                options = dict(query_params.get("options") or {})
                options.update(params)
                query_params["options"] = options
                kb.query_params = query_params
            return kb

    async def update_stats(self, kb_id: str, stats: dict[str, int]) -> KnowledgeBase | None:
        """在行锁内更新统计投影，保留并发写入的其他附加参数。"""
        async with kb_config_cache_lock(kb_id):
            async with pg_manager.get_async_session_context() as session:
                statement = select(KnowledgeBase).where(KnowledgeBase.kb_id == kb_id).with_for_update()
                result = await session.execute(statement)
                kb = result.scalar_one_or_none()
                if kb is None:
                    return None

                additional_params = dict(kb.additional_params or {})
                additional_params["stats"] = stats
                kb.additional_params = additional_params
            return kb

    async def delete(self, kb_id: str) -> None:
        async with kb_config_cache_lock(kb_id):
            await delete_cached_kb_config(kb_id)
            async with pg_manager.get_async_session_context() as session:
                result = await session.execute(select(KnowledgeBase).where(KnowledgeBase.kb_id == kb_id))
                kb = result.scalar_one_or_none()
                if kb is not None:
                    await session.delete(kb)
