"""Agent 环境变量数据访问层。"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ars.storage.postgres.models_business import AgentEnv


@dataclass(frozen=True)
class AgentEnvWriteResult:
    """Agent 环境变量写入结果。"""

    env: dict[str, str]
    updated_at: datetime | None


class AgentEnvRepository:
    """封装用户级 Agent 环境变量的读取与幂等 upsert。"""

    def __init__(self, db_session: AsyncSession):
        self.db_session = db_session

    async def get_by_uid(self, uid: str) -> AgentEnv | None:
        """读取指定用户的 Agent 环境变量。"""
        result = await self.db_session.execute(select(AgentEnv).where(AgentEnv.uid == uid))
        return result.scalar_one_or_none()

    async def upsert(self, *, uid: str, env: dict[str, str], updated_at: datetime) -> AgentEnvWriteResult:
        """内容未变时复用旧时间，否则原子写入完整环境变量集合。"""
        current = await self.get_by_uid(uid)
        if current is not None and (current.env or {}) == env:
            return AgentEnvWriteResult(env=current.env or {}, updated_at=current.updated_at)

        statement = (
            pg_insert(AgentEnv)
            .values(uid=uid, env=env, updated_at=updated_at)
            .on_conflict_do_update(
                index_elements=[AgentEnv.uid],
                set_={"env": env, "updated_at": updated_at},
            )
        )
        await self.db_session.execute(statement)
        await self.db_session.commit()
        return AgentEnvWriteResult(env=env, updated_at=updated_at)
