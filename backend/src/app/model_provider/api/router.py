"""model_provider 域路由聚合。"""

from fastapi import APIRouter

from backend.src.app.model_provider.api.v1.providers import router as providers_router
from backend.src.core.config import settings

v1 = APIRouter(prefix=settings.FASTAPI_API_V1_PATH)

v1.include_router(providers_router, prefix='/system/model-providers', tags=['模型供应商'])
