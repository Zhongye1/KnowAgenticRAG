"""评估域 API 路由（统一挂在 ``settings.FASTAPI_API_V1_PATH`` 下，与其余域一致）。"""

from fastapi import APIRouter

from backend.src.app.evaluation.api.v1.datasets import router as datasets_router
from backend.src.app.evaluation.api.v1.runs import router as runs_router
from backend.src.core.config import settings

v1 = APIRouter(prefix=settings.FASTAPI_API_V1_PATH)
v1.include_router(datasets_router)
v1.include_router(runs_router)
