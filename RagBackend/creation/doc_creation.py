"""
doc_creation.py
文档创作模块 - 复用 multi_model/model_router 的多 Provider 流式能力

功能：
  - 大纲生成：根据主题自动生成文章/报告大纲
  - 摘要生成：对知识库文档或自由文本生成摘要
  - 文本翻译：中英互译（或其他语言）
  - 格式优化：对已有文本做排版/措辞优化
  - 内容扩写：基于大纲或要点扩展为完整文档

API:
  POST /api/creation/outline   -- 生成大纲
  POST /api/creation/summary   -- 生成摘要
  POST /api/creation/translate -- 翻译
  POST /api/creation/polish    -- 格式优化
  POST /api/creation/expand    -- 内容扩写
  GET  /api/creation/templates -- 获取支持的创作类型
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path
from typing import AsyncGenerator, Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/creation", tags=["文档创作"])

# ─── 确保后端根目录在 sys.path ──────────────────────────────────
_backend_root = str(Path(__file__).resolve().parent.parent)
if _backend_root not in sys.path:
    sys.path.insert(0, _backend_root)


# ─── Prompt 模板 ──────────────────────────────────────────────
_PROMPTS = {
    "outline": """你是专业的中文写作助手。根据用户给出的主题和要求，生成一份详细的文章/报告大纲。

要求：
- 层级清晰（一级标题 # / 二级标题 ## / 三级标题 ###）
- 每个节点简要说明该部分的核心内容（1-2句话）
- 大纲应逻辑连贯，覆盖主题的核心维度

主题：{topic}
额外要求：{requirements}

请输出完整大纲（Markdown格式）：""",

    "summary": """你是专业的中文摘要助手。请对以下文本生成一份高质量的摘要。

摘要要求：
- 长度：{length}字左右
- 保留核心观点和关键数据
- 使用简洁的书面中文
- 结构：先总述，再分点列出要点

原文：
{text}

摘要：""",

    "translate": """你是专业翻译助手。请将以下文本翻译为{target_lang}。

翻译要求：
- 准确传达原文语义，不要遗漏信息
- 翻译自然流畅，符合目标语言表达习惯
- 专业术语使用标准译法
- 保留原文的段落格式

原文：
{text}

翻译结果：""",

    "polish": """你是专业的中文写作优化师。请对以下文本进行格式和措辞优化。

优化目标：
- 修正语法错误和用词不当
- 改善句式结构，使表达更流畅
- 统一标点符号使用规范
- 适当调整段落分割
- 保持原文核心意思不变

优化风格：{style}

原文：
{text}

优化后：""",

    "expand": """你是专业的中文内容创作助手。请根据以下大纲/要点，扩写为完整的文章/文档。

扩写要求：
- 内容丰富、逻辑连贯
- 每个要点展开为1-3段详细内容
- 使用适当的过渡语句衔接各部分
- 输出格式：Markdown
- 目标长度：{target_length}字左右

大纲/要点：
{outline}

扩写结果：""",
}


# ─── Provider 路由 ────────────────────────────────────────────
def _get_provider(model_id: str) -> str:
    """根据 model_id 判断 provider"""
    cloud_prefixes = {
        "deepseek": "deepseek",
        "gpt": "openai",
        "o1": "openai",
        "o3": "openai",
        "hunyuan": "hunyuan",
        "claude": "openai",
    }
    lower = model_id.lower()
    for prefix, provider in cloud_prefixes.items():
        if lower.startswith(prefix):
            return provider
    return "ollama"


async def _stream_via_model_router(
    model: str,
    prompt: str,
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> AsyncGenerator[str, None]:
    """
    统一调用入口：
    - 云端模型（deepseek/openai/hunyuan）：直接复用 model_router 的 _stream_xxx
    - Ollama 本地：通过 httpx 直连
    每个 token 以  data: <token>\\n\\n  格式 yield，最后 yield data: [DONE]\\n\\n
    """
    provider = _get_provider(model)
    messages = [
        {"role": "system", "content": "你是专业的中文内容创作助手，请严格按照用户要求完成任务。"},
        {"role": "user", "content": prompt},
    ]

    try:
        if provider == "ollama":
            async for chunk in _stream_ollama_local(model, prompt):
                yield chunk
        else:
            # 复用 multi_model.model_router 的流式函数
            from multi_model.model_router import (
                _stream_deepseek,
                _stream_openai,
                _stream_hunyuan,
            )
            if provider == "deepseek":
                stream_fn = _stream_deepseek
            elif provider == "openai":
                stream_fn = _stream_openai
            elif provider == "hunyuan":
                stream_fn = _stream_hunyuan
            else:
                yield f"data: [ERROR] 不支持的 provider: {provider}\n\n"
                return

            async for chunk in stream_fn(model, messages, temperature, max_tokens):
                # model_router 返回 data: {"content":"...", "done":false} 格式
                # 需要转换为前端 Creation.vue 期望的 data: <token> 格式
                if chunk.startswith("data: "):
                    raw = chunk[6:].strip()
                    if not raw:
                        continue
                    try:
                        d = json.loads(raw)
                        token = d.get("content", "")
                        if token:
                            yield f"data: {token}\n\n"
                        if d.get("done"):
                            yield "data: [DONE]\n\n"
                    except Exception:
                        # 非 JSON 行直接透传
                        if raw and raw != "[DONE]":
                            yield f"data: {raw}\n\n"
        yield "data: [DONE]\n\n"

    except Exception as e:
        logger.error(f"文档创作流式生成失败 model={model}: {e}")
        yield f"data: [ERROR] {e}\n\n"


async def _stream_ollama_local(model: str, prompt: str) -> AsyncGenerator[str, None]:
    """直连 Ollama /api/generate 流式输出"""
    import httpx
    # 读取 Ollama 配置
    host = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    timeout = 120
    try:
        from models.user_model_config import get_effective_config
        cfg = get_effective_config()
        host = cfg.ollama_base_url or host
        model = cfg.llm_model or model
        timeout = cfg.timeout or timeout
    except Exception:
        pass

    payload = {"model": model, "prompt": prompt, "stream": True}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", f"{host}/api/generate", json=payload) as resp:
                if resp.status_code != 200:
                    yield f"data: [ERROR] Ollama 返回 {resp.status_code}\n\n"
                    return
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                        token = data.get("response", "")
                        if token:
                            yield f"data: {token}\n\n"
                        if data.get("done"):
                            return
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        yield f"data: [ERROR] Ollama 连接失败: {e}\n\n"


def _get_default_model() -> str:
    """获取默认模型（用户配置 > 环境变量 > 固定默认值）"""
    try:
        from models.user_model_config import get_effective_config
        cfg = get_effective_config()
        return cfg.llm_model or "deepseek-chat"
    except Exception:
        return os.getenv("MODEL", "deepseek-chat")


# ─── 请求模型 ─────────────────────────────────────────────────
class OutlineRequest(BaseModel):
    topic: str
    requirements: str = "适合学术/技术报告风格，约2000字"
    model: Optional[str] = None   # 可选，不传则使用默认模型

class SummaryRequest(BaseModel):
    text: str
    length: int = 300
    model: Optional[str] = None

class TranslateRequest(BaseModel):
    text: str
    target_lang: str = "英文"
    model: Optional[str] = None

class PolishRequest(BaseModel):
    text: str
    style: str = "正式学术风格"
    model: Optional[str] = None

class ExpandRequest(BaseModel):
    outline: str
    target_length: int = 1500
    model: Optional[str] = None


# ─── 路由 ─────────────────────────────────────────────────────
@router.post("/outline")
async def gen_outline(req: OutlineRequest):
    """流式生成文章大纲（SSE）"""
    model = req.model or _get_default_model()
    prompt = _PROMPTS["outline"].format(topic=req.topic, requirements=req.requirements)
    return StreamingResponse(
        _stream_via_model_router(model, prompt),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/summary")
async def gen_summary(req: SummaryRequest):
    """流式生成摘要（SSE）"""
    model = req.model or _get_default_model()
    prompt = _PROMPTS["summary"].format(text=req.text[:4000], length=req.length)
    return StreamingResponse(
        _stream_via_model_router(model, prompt),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/translate")
async def translate(req: TranslateRequest):
    """流式翻译（SSE）"""
    model = req.model or _get_default_model()
    prompt = _PROMPTS["translate"].format(text=req.text[:4000], target_lang=req.target_lang)
    return StreamingResponse(
        _stream_via_model_router(model, prompt),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/polish")
async def polish(req: PolishRequest):
    """流式格式优化（SSE）"""
    model = req.model or _get_default_model()
    prompt = _PROMPTS["polish"].format(text=req.text[:4000], style=req.style)
    return StreamingResponse(
        _stream_via_model_router(model, prompt),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/expand")
async def expand(req: ExpandRequest):
    """流式内容扩写（SSE）"""
    model = req.model or _get_default_model()
    prompt = _PROMPTS["expand"].format(outline=req.outline[:3000], target_length=req.target_length)
    return StreamingResponse(
        _stream_via_model_router(model, prompt),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/templates")
async def get_templates():
    """获取所有支持的创作类型说明"""
    return {
        "types": [
            {"id": "outline",   "name": "大纲生成", "desc": "根据主题自动生成层次化文章大纲", "icon": "📋"},
            {"id": "summary",   "name": "摘要生成", "desc": "压缩长文本为要点摘要", "icon": "📝"},
            {"id": "translate", "name": "文本翻译", "desc": "中英互译，保持专业术语准确性", "icon": "🌐"},
            {"id": "polish",    "name": "格式优化", "desc": "润色措辞、统一格式、修正语法", "icon": "✨"},
            {"id": "expand",    "name": "内容扩写", "desc": "从大纲/要点扩展为完整文档", "icon": "📄"},
        ]
    }
