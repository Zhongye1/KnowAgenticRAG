from fastapi import APIRouter

router = APIRouter()

from .chat_download import router as chat_download_router
from .chat_history_attacher import router as chat_history_attacher_router
from .chat_delete import router as chat_delete_router
from .chat_send import router as chat_send_router

router.include_router(chat_download_router)
router.include_router(chat_history_attacher_router)
router.include_router(chat_delete_router)
router.include_router(chat_send_router)  # / Ollama
