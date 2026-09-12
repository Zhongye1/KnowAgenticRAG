from typing import Any, cast

from sqlalchemy import CursorResult, Select
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy_crud_plus import CRUDPlus

from backend.src.app.admin.model import OperaLog
from backend.src.app.admin.schema.opera_log import CreateOperaLogParam
from backend.src.core.config import settings

# 审计删除保护（kb-ownership-and-acl-v2 spec §7.2/D48）：KB/文档/ACL/检索资源类
# 操作记录禁止物理删除；API 批量删除、清空与定时清理共用本过滤
_PROTECTED_PATH_PREFIXES = ('/knowledge_bases', '/documents', '/rag')


def _protected_event_filters() -> list[Any]:
    return [~OperaLog.path.startswith(f'{settings.FASTAPI_API_V1_PATH}{prefix}') for prefix in _PROTECTED_PATH_PREFIXES]


class CRUDOperaLogDao(CRUDPlus[OperaLog]):
    """操作日志数据库操作类"""

    async def get_select(self, username: str | None, status: int | None, ip: str | None) -> Select:
        """
        获取操作日志列表查询表达式

        :param username: 用户名
        :param status: 操作状态
        :param ip: IP 地址
        :return:
        """
        filters = {}

        if username is not None:
            filters['username__like'] = f'%{username}%'
        if status is not None:
            filters['status__eq'] = status
        if ip is not None:
            filters['ip__like'] = f'%{ip}%'

        return await self.select_order('created_time', 'desc', **filters)

    async def create(self, db: AsyncSession, obj: CreateOperaLogParam) -> None:
        """
        创建操作日志

        :param db: 数据库会话
        :param obj: 操作日志创建参数
        :return:
        """
        await self.create_model(db, obj)

    async def bulk_create(self, db: AsyncSession, objs: list[CreateOperaLogParam]) -> None:
        """
        批量创建操作日志

        :param db: 数据库会话
        :param objs: 操作日志创建参数列表
        :return:
        """
        await self.create_models(db, objs)

    async def delete(self, db: AsyncSession, pks: list[int]) -> int:
        """
        批量删除操作日志（资源类事件受删除保护，不计入删除集）

        :param db: 数据库会话
        :param pks: 操作日志 ID 列表
        :return:
        """
        stmt = sa_delete(OperaLog).where(OperaLog.id.in_(pks), *_protected_event_filters())
        result = await db.execute(stmt)
        return cast('CursorResult[Any]', result).rowcount or 0

    @staticmethod
    async def delete_all(db: AsyncSession) -> None:
        """
        删除所有日志（资源类事件受删除保护，保留）

        :param db: 数据库会话
        :return:
        """
        await db.execute(sa_delete(OperaLog).where(*_protected_event_filters()))


opera_log_dao: CRUDOperaLogDao = CRUDOperaLogDao(OperaLog)
