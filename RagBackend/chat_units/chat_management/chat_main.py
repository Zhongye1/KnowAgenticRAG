import os
import json
from fastapi import FastAPI, HTTPException,APIRouter
from pathlib import Path

# 创建路由
router = APIRouter()

from .chat_download import router as chat_download_router
from .chat_history_attacher import router as chat_history_attacher_router
from .chat_delete import router as chat_delete_router
from .chat_send import router as chat_send_router

router.include_router(chat_download_router)       # 对话下载接口
router.include_router(chat_history_attacher_router)  # 对话载入接口
router.include_router(chat_delete_router)         # 对话删除接口
router.include_router(chat_send_router)           # 消息发送 / Ollama 接口


