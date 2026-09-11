"""retrieval 域路由聚合。"""

from fastapi import APIRouter

from backend.src.app.retrieval.api.v1.rag_query import images_router, search_router
from backend.src.core.config import settings

v1 = APIRouter(prefix=settings.FASTAPI_API_V1_PATH)

v1.include_router(search_router, prefix='/rag', tags=['RAG 检索'])
v1.include_router(images_router, prefix='/rag', tags=['RAG 检索'])
