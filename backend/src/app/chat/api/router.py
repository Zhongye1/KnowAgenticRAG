"""chat 域路由聚合。"""

from fastapi import APIRouter

from backend.src.app.chat.api.v1.chat import router as chat_router
from backend.src.core.config import settings

v1 = APIRouter(prefix=settings.FASTAPI_API_V1_PATH)

v1.include_router(chat_router, prefix='/knowledge_bases', tags=['知识库问答'])
