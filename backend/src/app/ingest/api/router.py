"""ingest 域路由聚合。"""

from fastapi import APIRouter

from backend.src.app.ingest.api.v1.jobs import router as ingest_jobs_router
from backend.src.app.ingest.api.v1.router import router as ingest_router
from backend.src.app.ingest.api.v1.url_ingest import router as ingest_url_router
from backend.src.core.config import settings

v1 = APIRouter(prefix=settings.FASTAPI_API_V1_PATH)

v1.include_router(ingest_router, prefix='/knowledge_bases', tags=['知识库摄取'])
v1.include_router(ingest_jobs_router, prefix='/knowledge_bases', tags=['知识库摄取'])
v1.include_router(ingest_url_router, prefix='/knowledge_bases', tags=['知识库摄取'])
