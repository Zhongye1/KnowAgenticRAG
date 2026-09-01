from fastapi import APIRouter

from backend.src.app.kb.api.v1.documents import router as documents_router
from backend.src.app.kb.api.v1.knowledge_bases import router as knowledge_bases_router
from backend.src.app.kb.api.v1.tags import router as tags_router
from backend.src.core.config import settings

v1 = APIRouter(prefix=settings.FASTAPI_API_V1_PATH)

v1.include_router(knowledge_bases_router)
v1.include_router(documents_router)
v1.include_router(tags_router)
