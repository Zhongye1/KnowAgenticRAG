from ars.storage.postgres.models_business import OperationLog
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession


async def log_operation(
    db: AsyncSession,
    user_id: int | None,
    operation: str,
    details: str | None = None,
    request: Request | None = None,
) -> None:
    """把强制审计事实加入当前 owning transaction；失败必须阻止业务提交。"""

    ip_address = request.client.host if request and request.client else None
    db.add(OperationLog(user_id=user_id, operation=operation, details=details, ip_address=ip_address))
    await db.flush()
