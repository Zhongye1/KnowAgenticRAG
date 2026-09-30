"""AgentRun 输出消息查询。"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ars.storage.postgres.models_business import Message


class AgentRunOutputRepository:
    """只在指定 Run 的因果边界内读取输出消息。"""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    async def get_output_message(
        self,
        *,
        run_id: str,
        conversation_id: int,
        output_message_id: int | None,
        allow_legacy_fallback: bool = False,
    ) -> Message | None:
        """读取显式绑定消息；仅对历史 completed Run 启用同 Run 兼容读取。"""

        if output_message_id is None and not allow_legacy_fallback:
            return None

        statement = select(Message).where(
            Message.conversation_id == conversation_id,
            Message.run_id == run_id,
            Message.role == "assistant",
        )
        if output_message_id is not None:
            statement = statement.where(Message.id == output_message_id)
        else:
            statement = statement.order_by(Message.created_at.desc(), Message.id.desc()).limit(1)

        result = await self.db.execute(statement)
        return result.scalar_one_or_none()
