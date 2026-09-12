"""agent 域路由聚合。"""

from fastapi import APIRouter

from backend.src.app.agent.api.v1.agent import router as agent_router
from backend.src.core.config import settings

v1 = APIRouter(prefix=settings.FASTAPI_API_V1_PATH)

v1.include_router(agent_router, prefix='/knowledge_bases', tags=['知识库 Agentic 问答'])
