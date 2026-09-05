"""retrieval 域路由聚合。"""

from fastapi import APIRouter

from backend.src.app.retrieval.api.v1.search import router as search_router
from backend.src.core.config import settings

v1 = APIRouter(prefix=settings.FASTAPI_API_V1_PATH)

v1.include_router(search_router, prefix='/knowledge_bases', tags=['知识库检索'])
