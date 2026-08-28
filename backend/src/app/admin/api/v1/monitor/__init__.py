from fastapi import APIRouter

from backend.src.app.admin.api.v1.monitor.online import router as token_router

router = APIRouter(prefix='/monitors')

router.include_router(token_router, prefix='/sessions', tags=['会话监控'])
