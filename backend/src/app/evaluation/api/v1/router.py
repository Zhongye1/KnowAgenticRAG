"""评估域 v1 子路由聚合（供 ``api/router.py`` 引用）。"""

from fastapi import APIRouter

from backend.src.app.evaluation.api.v1.datasets import router as datasets_router
from backend.src.app.evaluation.api.v1.runs import router as runs_router

router = APIRouter()
router.include_router(datasets_router)
router.include_router(runs_router)
