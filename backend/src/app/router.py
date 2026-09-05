from fastapi import APIRouter

from backend.src.app.admin.api.router import v1 as admin_v1
from backend.src.app.ingest.api.router import v1 as ingest_v1
from backend.src.app.kb.api.v1.router import v1 as kb_v1
from backend.src.app.model_provider.api.router import v1 as model_provider_v1
from backend.src.app.task.api.router import v1 as task_v1

router = APIRouter()

router.include_router(admin_v1)
router.include_router(task_v1)
router.include_router(kb_v1)
router.include_router(ingest_v1)
router.include_router(model_provider_v1)
