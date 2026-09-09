"""ingest 域路由聚合。"""

from fastapi import APIRouter

from backend.src.app.ingest.api.v1.router import router as ingest_router
from backend.src.core.config import settings

v1 = APIRouter(prefix=settings.FASTAPI_API_V1_PATH)

v1.include_router(ingest_router, prefix='/knowledge_bases', tags=['知识库摄取'])
