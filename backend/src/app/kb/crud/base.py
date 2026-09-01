"""租户维度 CRUD 基类（多租户过滤下沉到 CRUD 层统一注入）。

所有知识库相关查询都必须经过本基类：``plugin_namespace`` 由实例解析注入，
``kb_name`` 由调用方显式传入，避免 service 层自行拼接过滤条件。
"""

from typing import Any, TypeVar, cast

from sqlalchemy import CursorResult, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy_crud_plus import CRUDPlus

from backend.src.app.kb.utils.namespace import instance_namespace

__all__ = ['TenantScopedCrud', 'result_rowcount']


def result_rowcount(result: Any) -> int:
    """返回 SQL 执行影响行数（Result → CursorResult）。"""
    return cast('CursorResult[Any]', result).rowcount


M = TypeVar('M')


class TenantScopedCrud(CRUDPlus[M]):  # type: ignore[type-var]
    """强制注入 plugin_namespace / kb_name 过滤的 CRUD 基类。"""

    async def select_scoped(
        self,
        db: AsyncSession,
        *,
        plugin_namespace: str | None = None,
        kb_name: str | None = None,
        **kwargs: Any,
    ) -> M | None:
        """按域（+ 可选 kb_name）查询单条记录。"""
        filters: dict[str, Any] = {'plugin_namespace': instance_namespace(plugin_namespace)}
        if kb_name is not None:
            filters['kb_name'] = kb_name
        filters.update(kwargs)
        return await self.select_model_by_column(db, **filters)  # type: ignore[return-value]

    async def select_models_scoped(
        self,
        db: AsyncSession,
        *,
        plugin_namespace: str | None = None,
        kb_name: str | None = None,
        **kwargs: Any,
    ) -> list[M]:
        """按域（+ 可选 kb_name）查询多条记录。"""
        filters: dict[str, Any] = {'plugin_namespace': instance_namespace(plugin_namespace)}
        if kb_name is not None:
            filters['kb_name'] = kb_name
        filters.update(kwargs)
        return await self.select_models(db, **filters)  # type: ignore[return-value]

    async def count_scoped(
        self,
        db: AsyncSession,
        *,
        plugin_namespace: str | None = None,
        kb_name: str | None = None,
    ) -> int:
        """按域（+ 可选 kb_name）统计数量。"""
        model = cast('type[M]', self.model)
        ns = instance_namespace(plugin_namespace)
        filters: list[Any] = [model.plugin_namespace == ns]  # type: ignore[attr-defined]
        if kb_name is not None:
            filters.append(model.kb_name == kb_name)  # type: ignore[attr-defined]
        stmt = select(func.count()).select_from(model).where(*filters)
        return int((await db.scalar(stmt)) or 0)
