"""图谱域 API 路由（统一挂在 ``settings.FASTAPI_API_V1_PATH`` 下，与其余域一致）。"""

from fastapi import APIRouter

from backend.src.app.graph.api.v1.graph import router as graph_router
from backend.src.core.config import settings

v1 = APIRouter(prefix=settings.FASTAPI_API_V1_PATH)
v1.include_router(graph_router)
