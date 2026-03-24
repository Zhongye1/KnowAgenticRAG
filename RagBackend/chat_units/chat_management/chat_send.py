"""
chat_send.py — 对话消息发送接口
调用本地 Ollama 服务生成 AI 回复。
"""
import os
import json
import logging
import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()
logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_MODEL = os.getenv("MODEL", "qwen:7b-chat")


class ChatMessage(BaseModel):
    role: str          # "user" or "assistant"
    content: str


class OllamaSettings(BaseModel):
    serverUrl: Optional[str] = None
    timeout: Optional[int] = 60


class SendMessageRequest(BaseModel):
    message: str
    sessionId: Optional[str] = None
    history: Optional[List[dict]] = []
    model: Optional[str] = None
    ollamaSettings: Optional[OllamaSettings] = None


@router.post("/send-message")
async def send_message(req: SendMessageRequest):
    """
    发送消息到 Ollama，返回 AI 回复。
    支持携带历史上下文（多轮对话）。
    """
    # 确定 Ollama 服务地址和模型
    server_url = (
        req.ollamaSettings.serverUrl.rstrip("/")
        if req.ollamaSettings and req.ollamaSettings.serverUrl
        else OLLAMA_BASE_URL
    )
    model = req.model or DEFAULT_MODEL
    timeout = (
        req.ollamaSettings.timeout
        if req.ollamaSettings and req.ollamaSettings.timeout
        else 60
    )

    # 构建消息列表（带历史上下文）
    messages = []
    if req.history:
        for msg in req.history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            # 只保留 user / assistant 角色
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    # 加上当前用户消息（避免重复：history 已包含最新 user 消息时跳过）
    if not messages or messages[-1].get("content") != req.message:
        messages.append({"role": "user", "content": req.message})

    try:
        logger.info(f"调用 Ollama: {server_url}, 模型: {model}, 消息数: {len(messages)}")
        response = requests.post(
            f"{server_url}/api/chat",
            json={
                "model": model,
                "messages": messages,
                "stream": False,
            },
            timeout=timeout,
        )

        if response.status_code != 200:
            logger.error(f"Ollama 返回错误: {response.status_code} {response.text}")
            raise HTTPException(
                status_code=500,
                detail=f"连接Ollama服务失败，请检查API服务是否配置正确: Ollama API responded with status: {response.status_code}"
            )

        data = response.json()
        reply = data.get("message", {}).get("content", "")
        if not reply:
            reply = data.get("response", "（模型无回复）")

        logger.info(f"Ollama 回复成功，长度: {len(reply)}")
        return {"reply": reply, "model": model}

    except requests.exceptions.ConnectionError:
        raise HTTPException(
            status_code=500,
            detail=f"连接Ollama服务失败，请检查API服务是否配置正确: 无法连接到 {server_url}，请确认 Ollama 正在运行"
        )
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=500,
            detail=f"Ollama 响应超时（{timeout}s），请尝试更换更小的模型或增加超时时间"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"send_message 未知错误: {e}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")
