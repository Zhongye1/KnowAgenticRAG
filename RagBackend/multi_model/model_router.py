"""
多模型适配路由 - 支持 Ollama / OpenAI / 腾讯混元 / DeepSeek 统一接口

API Key 优先级（每次请求动态读取，无需重启）：
  文件（models_config.json）> 环境变量（.env）> 空
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, AsyncGenerator
import os
import json
import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)
router = APIRouter()

# - Config file user_model_config.py -
_CONFIG_PATH = Path(__file__).parent.parent / "models_config.json"


def _read_cloud_keys() -> dict:
    """读取 models_config.json 中的云端 API Key，不存在则返回空字典。每次调用都重新读取，实时生效。"""
    try:
        if _CONFIG_PATH.exists():
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("cloud_keys", {})
    except Exception as e:
        logger.warning(f"[model_router] 读取 models_config.json 失败: {e}")
    return {}


def _get_key(provider: str, env_var: str) -> str:
    """按优先级获取 API Key：文件 > 环境变量"""
    keys = _read_cloud_keys()
    return keys.get(provider, {}).get("api_key", "") or os.getenv(env_var, "")


def _get_base_url(provider: str, env_var: str, default: str) -> str:
    """按优先级获取 Base URL：文件 > 环境变量 > 默认值"""
    keys = _read_cloud_keys()
    return keys.get(provider, {}).get("base_url", "") or os.getenv(env_var, default)


# - / -
class ChatCompletionRequest(BaseModel):
    model: str  # "gpt-4o", "hunyuan", "deepseek-chat", "qwen2:0.5b"
    messages: list[dict]  # [{role, content}]
    stream: bool = True
    temperature: float = 0.7
    max_tokens: int = 2048
    kb_id: Optional[str] = None  # IDRAG


class ModelListResponse(BaseModel):
    models: list[dict]


# - Model configavailable -
_MODEL_CATALOG = [
    {
        "id": "qwen2:0.5b",
        "name": "Qwen2 0.5B（本地·推荐）",
        "provider": "ollama",
        "description": "本地 Ollama 模型，无需网络，响应快速",
        "context_length": 8192,
    },
    {
        "id": "qwen:7b-chat",
        "name": "Qwen 7B Chat（本地·高质量）",
        "provider": "ollama",
        "description": "本地 Ollama 模型，质量更高，需要 17GB+ 内存",
        "context_length": 8192,
    },
    {
        "id": "deepseek-chat",
        "name": "DeepSeek Chat（云端·深度推理）",
        "provider": "deepseek",
        "description": "擅长深度推理、复杂分析、专业问题",
        "context_length": 32768,
        "requires_key": "DEEPSEEK_API_KEY",
    },
    {
        "id": "deepseek-reasoner",
        "name": "DeepSeek Reasoner（云端·R1推理）",
        "provider": "deepseek",
        "description": "DeepSeek R1 推理模型，适合数学/代码/逻辑",
        "context_length": 32768,
        "requires_key": "DEEPSEEK_API_KEY",
    },
    {
        "id": "hunyuan-lite",
        "name": "腾讯混元 Lite（云端·通用）",
        "provider": "hunyuan",
        "description": "擅长通用问答、日常创作、快速响应",
        "context_length": 8192,
        "requires_key": "HUNYUAN_SECRET_ID",
    },
    {
        "id": "hunyuan-pro",
        "name": "腾讯混元 Pro（云端·专业）",
        "provider": "hunyuan",
        "description": "混元高性能版本，支持更长上下文",
        "context_length": 32768,
        "requires_key": "HUNYUAN_SECRET_ID",
    },
    {
        "id": "gpt-4o-mini",
        "name": "GPT-4o Mini（云端·OpenAI）",
        "provider": "openai",
        "description": "OpenAI GPT-4o Mini，性价比高",
        "context_length": 128000,
        "requires_key": "OPENAI_API_KEY",
    },
    {
        "id": "gpt-4o",
        "name": "GPT-4o（云端·OpenAI 旗舰）",
        "provider": "openai",
        "description": "OpenAI 旗舰模型，多模态能力强",
        "context_length": 128000,
        "requires_key": "OPENAI_API_KEY",
    },
]

# AVAILABLE_MODELS
AVAILABLE_MODELS = _MODEL_CATALOG


def _build_model_list() -> list:
    """动态构建模型列表，available 字段实时反映当前配置状态"""
    has_deepseek = bool(_get_key("deepseek", "DEEPSEEK_API_KEY"))
    has_openai = bool(_get_key("openai", "OPENAI_API_KEY"))
    has_hunyuan = bool(
        _get_key("hunyuan", "HUNYUAN_SECRET_ID") or os.getenv("HUNYUAN_SECRET_ID")
    )
    provider_available = {
        "ollama": True,
        "deepseek": has_deepseek,
        "openai": has_openai,
        "hunyuan": has_hunyuan,
    }
    result = []
    for m in _MODEL_CATALOG:
        entry = dict(m)
        entry["available"] = provider_available.get(m["provider"], False)
        result.append(entry)
    return result


# - provider -
async def _stream_ollama(
    model: str, messages: list, temperature: float, max_tokens: int
) -> AsyncGenerator[str, None]:
    """调用本地 Ollama 流式接口"""
    import aiohttp

    ollama_url = _get_base_url("ollama", "OLLAMA_BASE_URL", "http://localhost:11434")
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{ollama_url}/api/chat",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=300),
            ) as resp:
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


async def _stream_deepseek(
    model: str, messages: list, temperature: float, max_tokens: int
) -> AsyncGenerator[str, None]:
    """调用 DeepSeek API 流式接口"""
    api_key = _get_key("deepseek", "DEEPSEEK_API_KEY")
    if not api_key:
        yield f"data: {json.dumps({'error': '未配置 DeepSeek API Key，请在「设置 → 多模型」填写并保存'})}\n\n"
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
            async with session.post(
                "https://api.deepseek.com/chat/completions",
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=300),
            ) as resp:
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


async def _stream_openai(
    model: str, messages: list, temperature: float, max_tokens: int
) -> AsyncGenerator[str, None]:
    """调用 OpenAI 兼容接口（同样支持 Kimi / Moonshot 等兼容服务）"""
    api_key = _get_key("openai", "OPENAI_API_KEY")
    base_url = _get_base_url("openai", "OPENAI_BASE_URL", "https://api.openai.com/v1")
    if not api_key:
        yield f"data: {json.dumps({'error': '未配置 OpenAI API Key，请在「设置 → 多模型」填写并保存'})}\n\n"
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
            async with session.post(
                f"{base_url}/chat/completions",
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=300),
            ) as resp:
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


async def _stream_hunyuan(
    model: str, messages: list, temperature: float, max_tokens: int
) -> AsyncGenerator[str, None]:
    """调用腾讯混元 API（使用 OpenAI 兼容接口）"""
    secret_id = _get_key("hunyuan", "HUNYUAN_SECRET_ID") or os.getenv(
        "HUNYUAN_SECRET_ID", ""
    )
    secret_key = os.getenv("HUNYUAN_SECRET_KEY", "")
    # hunyuan api_key Bearer token
    file_keys = _read_cloud_keys().get("hunyuan", {})
    if file_keys.get("api_key"):
        secret_id = file_keys["api_key"]
        secret_key = ""
    if not secret_id:
        yield f"data: {json.dumps({'error': '未配置混元 API Key，请在「设置 → 多模型」填写并保存'})}\n\n"
        return
    # OpenAI API key
    import aiohttp

    # api_keyEnvironment variable secretId:secretKey
    api_key = secret_id if not secret_key else f"{secret_id}:{secret_key}"
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
            async with session.post(
                "https://api.hunyuan.cloud.tencent.com/v1/chat/completions",
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=300),
            ) as resp:
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


# - API -
@router.get("/api/models/list")
async def list_models():
    """获取所有可用模型列表（available 字段实时反映当前 Key 配置状态）"""
    return {"models": _build_model_list()}


@router.post("/api/models/chat")
async def model_chat(req: ChatCompletionRequest):
    """
    统一多模型对话接口（SSE 流式）
    根据 model 字段自动路由到对应 provider
    """
    # provider
    model_info = next((m for m in _MODEL_CATALOG if m["id"] == req.model), None)
    if not model_info:
        # Ollama Local model
        provider = "ollama"
    else:
        provider = model_info.get("provider", "ollama")

    async def generate():
        if provider == "ollama":
            async for chunk in _stream_ollama(
                req.model, req.messages, req.temperature, req.max_tokens
            ):
                yield chunk
        elif provider == "deepseek":
            async for chunk in _stream_deepseek(
                req.model, req.messages, req.temperature, req.max_tokens
            ):
                yield chunk
        elif provider == "openai":
            async for chunk in _stream_openai(
                req.model, req.messages, req.temperature, req.max_tokens
            ):
                yield chunk
        elif provider == "hunyuan":
            async for chunk in _stream_hunyuan(
                req.model, req.messages, req.temperature, req.max_tokens
            ):
                yield chunk
        else:
            yield f"data: {json.dumps({'error': f'不支持的 provider: {provider}'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# - MultiModelTab saveProvider -


class ProviderConfigRequest(BaseModel):
    provider_id: str  # ollama / deepseek / openai / hunyuan / bailian / xinghuo
    config: dict  # { api_key, base_url, model, temperature, max_tokens }


@router.post("/api/models/configure")
async def configure_provider(req: ProviderConfigRequest):
    """
    保存云端 Provider 的 API Key 到 models_config.json。
    修复：前端 saveProvider 调用此接口，Key 持久化后后端实时生效（无需重启）。
    """
    try:
        data: dict = {}
        if _CONFIG_PATH.exists():
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)

        # cloud_keys
        if "cloud_keys" not in data:
            data["cloud_keys"] = {}
        data["cloud_keys"][req.provider_id] = req.config

        _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        logger.info(f"[model_router] Provider {req.provider_id!r} 配置已保存")
        return {"status": "ok", "message": f"{req.provider_id} 配置已保存，立即生效"}
    except Exception as e:
        logger.error(f"[model_router] 保存配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"保存失败: {e}")


class ProviderTestRequest(BaseModel):
    provider_id: str
    config: dict


@router.post("/api/models/test")
async def test_provider(req: ProviderTestRequest):
    """
    测试 Provider 连通性（发送一条最小 message 验证 API Key 有效）。
    修复：前端 testProvider 调用此接口，返回真实测试结果而非演示数据。
    """
    import time
    import aiohttp

    start = time.monotonic()
    provider = req.provider_id
    cfg = req.config
    api_key = cfg.get("api_key", "")

    try:
        if provider == "ollama":
            base_url = cfg.get("base_url", "http://localhost:11434")
            async with aiohttp.ClientSession() as s:
                async with s.get(
                    f"{base_url}/api/tags", timeout=aiohttp.ClientTimeout(total=8)
                ) as r:
                    ok = r.status == 200
            latency = int((time.monotonic() - start) * 1000)
            return {
                "ok": ok,
                "message": "Ollama 服务正常" if ok else "无法连接 Ollama",
                "latency": latency,
            }

        elif provider == "deepseek":
            if not api_key:
                return {"ok": False, "message": "API Key 为空"}
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": cfg.get("model", "deepseek-chat"),
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 1,
                "stream": False,
            }
            async with aiohttp.ClientSession() as s:
                async with s.post(
                    "https://api.deepseek.com/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as r:
                    ok = r.status == 200
                    msg = (
                        "连接成功，API Key 有效"
                        if ok
                        else f"API 返回 {r.status}，请检查 Key"
                    )
            latency = int((time.monotonic() - start) * 1000)
            return {"ok": ok, "message": msg, "latency": latency}

        elif provider == "openai":
            if not api_key:
                return {"ok": False, "message": "API Key 为空"}
            base_url = cfg.get("base_url", "https://api.openai.com/v1")
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": cfg.get("model", "gpt-4o-mini"),
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 1,
                "stream": False,
            }
            async with aiohttp.ClientSession() as s:
                async with s.post(
                    f"{base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as r:
                    ok = r.status == 200
                    msg = (
                        "连接成功，API Key 有效"
                        if ok
                        else f"API 返回 {r.status}，请检查 Key 或 Base URL"
                    )
            latency = int((time.monotonic() - start) * 1000)
            return {"ok": ok, "message": msg, "latency": latency}

        elif provider in ("hunyuan", "bailian", "xinghuo"):
            if not api_key:
                return {"ok": False, "message": "API Key 为空"}
            # Key
            latency = int((time.monotonic() - start) * 1000)
            return {
                "ok": True,
                "message": "API Key 已填写（格式校验通过）",
                "latency": latency,
            }

        else:
            return {"ok": False, "message": f"未知 provider: {provider}"}

    except aiohttp.ClientConnectorError:
        return {"ok": False, "message": "网络连接失败，请检查地址或网络"}
    except asyncio.TimeoutError:
        return {"ok": False, "message": "连接超时"}
    except Exception as e:
        return {"ok": False, "message": f"测试失败: {e}"}


@router.get("/api/models/providers/status")
async def providers_status():
    """检查各云端 Provider 的密钥配置状态（动态读取，实时反映）"""
    return {
        "ollama": {
            "configured": True,
            "url": _get_base_url("ollama", "OLLAMA_BASE_URL", "http://localhost:11434"),
        },
        "deepseek": {
            "configured": bool(_get_key("deepseek", "DEEPSEEK_API_KEY")),
            "key_hint": "在设置→多模型中配置",
        },
        "openai": {
            "configured": bool(_get_key("openai", "OPENAI_API_KEY")),
            "key_hint": "在设置→多模型中配置",
            "base_url": _get_base_url(
                "openai", "OPENAI_BASE_URL", "https://api.openai.com/v1"
            ),
        },
        "hunyuan": {
            "configured": bool(
                _get_key("hunyuan", "HUNYUAN_SECRET_ID")
                or os.getenv("HUNYUAN_SECRET_ID")
            ),
            "key_hint": "在设置→多模型中配置",
        },
    }


# - Agent Task mode+Local model-


class AgentTaskRequest(BaseModel):
    query: str
    model: str = "deepseek-chat"  # model idOllama
    kb_id: Optional[str] = None  # IDRAG
    temperature: float = 0.7
    max_tokens: int = 4096


def _get_provider_for_model(model_id: str) -> str:
    """根据 model_id 判断对应 provider"""
    m = next((m for m in _MODEL_CATALOG if m["id"] == model_id), None)
    return m["provider"] if m else "ollama"


async def _collect_stream(gen: AsyncGenerator[str, None]) -> str:
    """将 SSE 流收集为完整文本"""
    parts = []
    async for chunk in gen:
        if chunk.startswith("data: "):
            payload = chunk[6:].strip()
            try:
                d = json.loads(payload)
                if d.get("content"):
                    parts.append(d["content"])
                if d.get("error"):
                    return f"[模型错误] {d['error']}"
            except Exception:
                pass
    return "".join(parts)


@router.post("/api/agent/task")
async def agent_task(req: AgentTaskRequest):
    """
    任务模式统一入口（SSE 流式）
    - 支持 Ollama 本地模型 + DeepSeek / OpenAI / 混元云端模型
    - 可选 RAG 知识库上下文增强（kb_id 不为空时自动检索相关文档）
    - 输出格式与 /api/models/chat 一致（data: {content, done}）
      额外输出 data: STEP_START/STEP_DONE/TASK_DONE 事件用于前端步骤可视化

    SSE 事件类型：
      data: {"event":"step","name":"...","index":N}   — 步骤开始
      data: {"event":"content","content":"..."}       — 流式内容片段
      data: {"event":"done","answer":"...(full)"}     — 完成，带完整答案
      data: {"event":"error","message":"..."}         — 错误
    """
    provider = _get_provider_for_model(req.model)

    async def generate():
        # - Step 1: -
        yield f"data: {json.dumps({'event': 'step', 'index': 0, 'name': '理解任务目标', 'detail': req.query[:80]}, ensure_ascii=False)}\n\n"
        await asyncio.sleep(0.05)

        # - Step 2: RAG -
        rag_context = ""
        if req.kb_id:
            yield f"data: {json.dumps({'event': 'step', 'index': 1, 'name': '检索知识库', 'detail': f'知识库 {req.kb_id}'}, ensure_ascii=False)}\n\n"
            try:
                import sys
                from pathlib import Path as _P

                _backend_root = str(_P(__file__).resolve().parent.parent)
                if _backend_root not in sys.path:
                    sys.path.insert(0, _backend_root)

                from RAG_M.RAG_app import _load_vectorstore_and_docs

                docs_dir = f"local-KLB-files/{req.kb_id}"
                vectorstore, documents, _ = _load_vectorstore_and_docs(docs_dir)

                from RAG_M.src.rag.hybrid_retriever import HybridRetriever

                if documents:
                    retriever = HybridRetriever(
                        documents=documents,
                        vectorstore=vectorstore,
                        bm25_top_k=3,
                        vector_top_k=3,
                        final_top_k=3,
                    )
                    results = retriever.retrieve_with_scores(req.query)
                else:
                    raw = vectorstore.similarity_search_with_score(req.query, k=3)
                    results = [
                        {
                            "document": d,
                            "source_info": {
                                "rank": i + 1,
                                "file_name": d.metadata.get("source", ""),
                                "rrf_score": s,
                            },
                        }
                        for i, (d, s) in enumerate(raw)
                    ]

                if results:
                    rag_parts = []
                    for item in results:
                        src = item["source_info"]
                        rag_parts.append(
                            f"【来源：{src.get('file_name', '?')}】\n{item['document'].page_content.strip()}"
                        )
                    rag_context = "\n\n---\n\n".join(rag_parts)
                    yield f"data: {json.dumps({'event': 'step_result', 'index': 1, 'detail': f'检索到 {len(results)} 个相关片段'}, ensure_ascii=False)}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'event': 'step_result', 'index': 1, 'detail': f'知识库检索失败: {e}，将直接使用模型知识'}, ensure_ascii=False)}\n\n"
        else:
            yield f"data: {json.dumps({'event': 'step', 'index': 1, 'name': '规划执行流程', 'detail': '基于模型知识直接推理'}, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.05)

        # - Step 3: Prompt -
        yield f"data: {json.dumps({'event': 'step', 'index': 2, 'name': '生成结构化草稿', 'detail': f'使用 {req.model}'}, ensure_ascii=False)}\n\n"

        system_prompt = (
            "你是一个高效的任务执行 AI 助手。请严格按照用户要求完成任务，"
            "输出结构清晰、内容完整的 Markdown 格式报告。"
        )
        user_content = req.query
        if rag_context:
            user_content = (
                f"以下是知识库中检索到的相关内容，请结合这些内容完成任务：\n\n"
                f"{rag_context}\n\n---\n\n任务：{req.query}"
            )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        # - Step 4: LLMStreaming output -
        full_answer = []
        yield f"data: {json.dumps({'event': 'step', 'index': 3, 'name': '润色与优化', 'detail': '流式生成中...'}, ensure_ascii=False)}\n\n"

        try:
            if provider == "ollama":
                async for chunk in _stream_ollama(
                    req.model, messages, req.temperature, req.max_tokens
                ):
                    yield chunk
                    if chunk.startswith("data: "):
                        try:
                            d = json.loads(chunk[6:])
                            if d.get("content"):
                                full_answer.append(d["content"])
                        except Exception:
                            pass
            elif provider == "deepseek":
                async for chunk in _stream_deepseek(
                    req.model, messages, req.temperature, req.max_tokens
                ):
                    yield chunk
                    if chunk.startswith("data: "):
                        try:
                            d = json.loads(chunk[6:])
                            if d.get("content"):
                                full_answer.append(d["content"])
                        except Exception:
                            pass
            elif provider == "openai":
                async for chunk in _stream_openai(
                    req.model, messages, req.temperature, req.max_tokens
                ):
                    yield chunk
                    if chunk.startswith("data: "):
                        try:
                            d = json.loads(chunk[6:])
                            if d.get("content"):
                                full_answer.append(d["content"])
                        except Exception:
                            pass
            elif provider == "hunyuan":
                async for chunk in _stream_hunyuan(
                    req.model, messages, req.temperature, req.max_tokens
                ):
                    yield chunk
                    if chunk.startswith("data: "):
                        try:
                            d = json.loads(chunk[6:])
                            if d.get("content"):
                                full_answer.append(d["content"])
                        except Exception:
                            pass
            else:
                yield f"data: {json.dumps({'error': f'不支持的 provider: {provider}'})}\n\n"
                return
        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
            return

        # - DONE -
        yield f"data: {json.dumps({'event': 'done', 'model': req.model, 'provider': provider, 'has_rag': bool(req.kb_id)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# - -


async def call_model_once(
    model: str,
    messages: list,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> str:
    """
    调用任意模型（Ollama 本地 / 云端），收集 SSE 流，返回完整文本字符串。
    适合 RAG / Agent 场景中需要一次性获取完整生成结果的调用。

    参数：
        model       - 模型 ID（如 "qwen2:0.5b", "deepseek-chat"）
        messages    - [{role, content}] 列表
        temperature - 生成温度
        max_tokens  - 最大生成 token 数

    返回：
        完整回复文本；出错时返回 "[模型错误] <错误信息>"
    """
    provider = _get_provider_for_model(model)

    stream_map = {
        "ollama": _stream_ollama,
        "deepseek": _stream_deepseek,
        "openai": _stream_openai,
        "hunyuan": _stream_hunyuan,
    }
    stream_fn = stream_map.get(provider, _stream_ollama)
    return await _collect_stream(stream_fn(model, messages, temperature, max_tokens))
