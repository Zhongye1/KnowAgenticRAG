"""
多模型适配路由 - 支持 Ollama / OpenAI / 腾讯混元 / DeepSeek 统一接口
"""
from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, AsyncGenerator
import os
import json
import asyncio
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# ── 请求/响应模型 ─────────────────────────────────────────────
class ChatCompletionRequest(BaseModel):
    model: str                          # 模型标识，如 "gpt-4o", "hunyuan", "deepseek-chat", "qwen2:0.5b"
    messages: list[dict]                # [{role, content}]
    stream: bool = True
    temperature: float = 0.7
    max_tokens: int = 2048
    kb_id: Optional[str] = None         # 知识库 ID（RAG 模式）

class ModelListResponse(BaseModel):
    models: list[dict]

# ── 可用模型配置 ───────────────────────────────────────────────
AVAILABLE_MODELS = [
    {
        "id": "qwen2:0.5b",
        "name": "Qwen2 0.5B（本地·推荐）",
        "provider": "ollama",
        "description": "本地 Ollama 模型，无需网络，响应快速",
        "context_length": 8192,
        "available": True,
    },
    {
        "id": "qwen:7b-chat",
        "name": "Qwen 7B Chat（本地·高质量）",
        "provider": "ollama",
        "description": "本地 Ollama 模型，质量更高，需要 17GB+ 内存",
        "context_length": 8192,
        "available": True,
    },
    {
        "id": "deepseek-chat",
        "name": "DeepSeek Chat（云端·深度推理）",
        "provider": "deepseek",
        "description": "擅长深度推理、复杂分析、专业问题",
        "context_length": 32768,
        "available": bool(os.getenv("DEEPSEEK_API_KEY")),
        "requires_key": "DEEPSEEK_API_KEY",
    },
    {
        "id": "deepseek-reasoner",
        "name": "DeepSeek Reasoner（云端·R1推理）",
        "provider": "deepseek",
        "description": "DeepSeek R1 推理模型，适合数学/代码/逻辑",
        "context_length": 32768,
        "available": bool(os.getenv("DEEPSEEK_API_KEY")),
        "requires_key": "DEEPSEEK_API_KEY",
    },
    {
        "id": "hunyuan-lite",
        "name": "腾讯混元 Lite（云端·通用）",
        "provider": "hunyuan",
        "description": "擅长通用问答、日常创作、快速响应",
        "context_length": 8192,
        "available": bool(os.getenv("HUNYUAN_SECRET_ID")),
        "requires_key": "HUNYUAN_SECRET_ID",
    },
    {
        "id": "hunyuan-pro",
        "name": "腾讯混元 Pro（云端·专业）",
        "provider": "hunyuan",
        "description": "混元高性能版本，支持更长上下文",
        "context_length": 32768,
        "available": bool(os.getenv("HUNYUAN_SECRET_ID")),
        "requires_key": "HUNYUAN_SECRET_ID",
    },
    {
        "id": "gpt-4o-mini",
        "name": "GPT-4o Mini（云端·OpenAI）",
        "provider": "openai",
        "description": "OpenAI GPT-4o Mini，性价比高",
        "context_length": 128000,
        "available": bool(os.getenv("OPENAI_API_KEY")),
        "requires_key": "OPENAI_API_KEY",
    },
    {
        "id": "gpt-4o",
        "name": "GPT-4o（云端·OpenAI 旗舰）",
        "provider": "openai",
        "description": "OpenAI 旗舰模型，多模态能力强",
        "context_length": 128000,
        "available": bool(os.getenv("OPENAI_API_KEY")),
        "requires_key": "OPENAI_API_KEY",
    },
]

# ── 辅助：按 provider 路由 ─────────────────────────────────────
async def _stream_ollama(model: str, messages: list, temperature: float, max_tokens: int) -> AsyncGenerator[str, None]:
    """调用本地 Ollama 流式接口"""
    import aiohttp
    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{ollama_url}/api/chat", json=payload, timeout=aiohttp.ClientTimeout(total=300)) as resp:
                if resp.status != 200:
                    err = await resp.text()
                    yield f"data: {json.dumps({'error': f'Ollama 返回错误: {err}'})}\n\n"
                    return
                async for line in resp.content:
                    line = line.decode("utf-8").strip()
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                        content = chunk.get("message", {}).get("content", "")
                        done = chunk.get("done", False)
                        if content:
                            yield f"data: {json.dumps({'content': content, 'done': False})}\n\n"
                        if done:
                            yield f"data: {json.dumps({'content': '', 'done': True})}\n\n"
                    except json.JSONDecodeError:
                        pass
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


async def _stream_deepseek(model: str, messages: list, temperature: float, max_tokens: int) -> AsyncGenerator[str, None]:
    """调用 DeepSeek API 流式接口"""
    api_key = os.getenv("DEEPSEEK_API_KEY", "")
    if not api_key:
        yield f"data: {json.dumps({'error': '未配置 DEEPSEEK_API_KEY，请在 .env 中添加'})}\n\n"
        return
    import aiohttp
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post("https://api.deepseek.com/chat/completions", json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=300)) as resp:
                if resp.status != 200:
                    err = await resp.text()
                    yield f"data: {json.dumps({'error': f'DeepSeek 返回错误({resp.status}): {err}'})}\n\n"
                    return
                async for line in resp.content:
                    line = line.decode("utf-8").strip()
                    if not line or line == "data: [DONE]":
                        if line == "data: [DONE]":
                            yield f"data: {json.dumps({'content': '', 'done': True})}\n\n"
                        continue
                    if line.startswith("data: "):
                        try:
                            chunk = json.loads(line[6:])
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield f"data: {json.dumps({'content': content, 'done': False})}\n\n"
                        except Exception:
                            pass
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


async def _stream_openai(model: str, messages: list, temperature: float, max_tokens: int) -> AsyncGenerator[str, None]:
    """调用 OpenAI 兼容接口（同样支持 Kimi / Moonshot 等兼容服务）"""
    api_key = os.getenv("OPENAI_API_KEY", "")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    if not api_key:
        yield f"data: {json.dumps({'error': '未配置 OPENAI_API_KEY，请在 .env 中添加'})}\n\n"
        return
    import aiohttp
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{base_url}/chat/completions", json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=300)) as resp:
                if resp.status != 200:
                    err = await resp.text()
                    yield f"data: {json.dumps({'error': f'OpenAI 返回错误({resp.status}): {err}'})}\n\n"
                    return
                async for line in resp.content:
                    line = line.decode("utf-8").strip()
                    if not line or line == "data: [DONE]":
                        if line == "data: [DONE]":
                            yield f"data: {json.dumps({'content': '', 'done': True})}\n\n"
                        continue
                    if line.startswith("data: "):
                        try:
                            chunk = json.loads(line[6:])
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield f"data: {json.dumps({'content': content, 'done': False})}\n\n"
                        except Exception:
                            pass
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


async def _stream_hunyuan(model: str, messages: list, temperature: float, max_tokens: int) -> AsyncGenerator[str, None]:
    """调用腾讯混元 API（使用 OpenAI 兼容接口）"""
    secret_id = os.getenv("HUNYUAN_SECRET_ID", "")
    secret_key = os.getenv("HUNYUAN_SECRET_KEY", "")
    if not secret_id or not secret_key:
        yield f"data: {json.dumps({'error': '未配置 HUNYUAN_SECRET_ID / HUNYUAN_SECRET_KEY，请在 .env 中添加'})}\n\n"
        return
    # 混元支持 OpenAI 兼容接口，使用 API key 方式
    import aiohttp
    api_key = f"{secret_id}:{secret_key}"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post("https://api.hunyuan.cloud.tencent.com/v1/chat/completions", json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=300)) as resp:
                if resp.status != 200:
                    err = await resp.text()
                    yield f"data: {json.dumps({'error': f'混元 API 返回错误({resp.status}): {err}'})}\n\n"
                    return
                async for line in resp.content:
                    line = line.decode("utf-8").strip()
                    if not line or line == "data: [DONE]":
                        if line == "data: [DONE]":
                            yield f"data: {json.dumps({'content': '', 'done': True})}\n\n"
                        continue
                    if line.startswith("data: "):
                        try:
                            chunk = json.loads(line[6:])
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield f"data: {json.dumps({'content': content, 'done': False})}\n\n"
                        except Exception:
                            pass
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


# ── API 端点 ───────────────────────────────────────────────────
@router.get("/api/models/list")
async def list_models():
    """获取所有可用模型列表（含可用状态）"""
    return {"models": AVAILABLE_MODELS}


@router.post("/api/models/chat")
async def model_chat(req: ChatCompletionRequest):
    """
    统一多模型对话接口（SSE 流式）
    根据 model 字段自动路由到对应 provider
    """
    # 确定 provider
    model_info = next((m for m in AVAILABLE_MODELS if m["id"] == req.model), None)
    if not model_info:
        # 未在列表中 → 尝试当 Ollama 本地模型处理
        provider = "ollama"
    else:
        provider = model_info.get("provider", "ollama")

    async def generate():
        if provider == "ollama":
            async for chunk in _stream_ollama(req.model, req.messages, req.temperature, req.max_tokens):
                yield chunk
        elif provider == "deepseek":
            async for chunk in _stream_deepseek(req.model, req.messages, req.temperature, req.max_tokens):
                yield chunk
        elif provider == "openai":
            async for chunk in _stream_openai(req.model, req.messages, req.temperature, req.max_tokens):
                yield chunk
        elif provider == "hunyuan":
            async for chunk in _stream_hunyuan(req.model, req.messages, req.temperature, req.max_tokens):
                yield chunk
        else:
            yield f"data: {json.dumps({'error': f'不支持的 provider: {provider}'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/api/models/providers/status")
async def providers_status():
    """检查各云端 Provider 的密钥配置状态"""
    return {
        "ollama": {
            "configured": True,
            "url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        },
        "deepseek": {
            "configured": bool(os.getenv("DEEPSEEK_API_KEY")),
            "key_hint": "DEEPSEEK_API_KEY",
        },
        "openai": {
            "configured": bool(os.getenv("OPENAI_API_KEY")),
            "key_hint": "OPENAI_API_KEY",
            "base_url": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        },
        "hunyuan": {
            "configured": bool(os.getenv("HUNYUAN_SECRET_ID")),
            "key_hint": "HUNYUAN_SECRET_ID / HUNYUAN_SECRET_KEY",
        },
    }
