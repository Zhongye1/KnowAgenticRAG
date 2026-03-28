"""
扩展多模型路由：新增阿里云百炼、讯飞星火、自动负载均衡、使用量统计
"""
import os
import json
import sqlite3
import time
import asyncio
from datetime import datetime
from typing import Optional, AsyncIterator, Dict, List
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/model-extended")
DB_PATH = os.path.join(os.path.dirname(__file__), "model_usage.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS model_usage (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT,
            model_id    TEXT,
            provider    TEXT,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            latency_ms  INTEGER DEFAULT 0,
            success     INTEGER DEFAULT 1,
            created_at  TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS model_config (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id    TEXT UNIQUE NOT NULL,
            provider    TEXT,
            display_name TEXT,
            enabled     INTEGER DEFAULT 1,
            priority    INTEGER DEFAULT 5,   -- 负载均衡优先级
            max_tokens  INTEGER DEFAULT 4096,
            context_window INTEGER DEFAULT 8192,
            api_key_env TEXT,               -- 环境变量名
            base_url    TEXT,
            notes       TEXT
        );
        INSERT OR IGNORE INTO model_config
        (model_id, provider, display_name, enabled, priority, context_window, api_key_env, base_url)
        VALUES
        -- 本地
        ('qwen2:0.5b',      'ollama', 'Qwen2 0.5B (本地)', 1, 10, 4096,  '', 'http://localhost:11434'),
        ('qwen:7b-chat',    'ollama', 'Qwen 7B Chat (本地)', 1, 8, 8192,  '', 'http://localhost:11434'),
        -- 阿里云百炼
        ('qwen-turbo',      'dashscope', '通义千问Turbo', 1, 7, 8192,  'DASHSCOPE_API_KEY', 'https://dashscope.aliyuncs.com/api/v1'),
        ('qwen-plus',       'dashscope', '通义千问Plus',  1, 6, 32768, 'DASHSCOPE_API_KEY', 'https://dashscope.aliyuncs.com/api/v1'),
        ('qwen-max',        'dashscope', '通义千问Max',   1, 5, 32768, 'DASHSCOPE_API_KEY', 'https://dashscope.aliyuncs.com/api/v1'),
        -- 讯飞星火
        ('spark-lite',      'xfyun',  '星火Lite',  1, 7, 8192,  'XFYUN_API_KEY', ''),
        ('spark-pro',       'xfyun',  '星火Pro',   1, 6, 32768, 'XFYUN_API_KEY', ''),
        ('spark-max',       'xfyun',  '星火Max',   1, 5, 32768, 'XFYUN_API_KEY', ''),
        -- OpenAI
        ('gpt-3.5-turbo',   'openai', 'GPT-3.5 Turbo', 1, 6, 16384, 'OPENAI_API_KEY', 'https://api.openai.com/v1'),
        ('gpt-4o',          'openai', 'GPT-4o',        1, 4, 128000,'OPENAI_API_KEY', 'https://api.openai.com/v1'),
        -- DeepSeek
        ('deepseek-chat',   'deepseek','DeepSeek Chat', 1, 7, 32768, 'DEEPSEEK_API_KEY', 'https://api.deepseek.com'),
        ('deepseek-coder',  'deepseek','DeepSeek Coder',1, 7, 16384, 'DEEPSEEK_API_KEY', 'https://api.deepseek.com'),
        -- 腾讯混元
        ('hunyuan-lite',    'hunyuan','混元Lite', 1, 8, 4096,  'HUNYUAN_SECRET_ID', ''),
        ('hunyuan-standard','hunyuan','混元Standard',1,6,32768,'HUNYUAN_SECRET_ID', ''),
        ('hunyuan-pro',     'hunyuan','混元Pro',   1, 5, 128000,'HUNYUAN_SECRET_ID', '');
    """)
    conn.commit()
    conn.close()


init_db()


# - -
class LoadBalancer:
    def __init__(self):
        self._fail_counts: Dict[str, int] = {}
        self._last_fail: Dict[str, float] = {}
        self.circuit_open_seconds = 60

    def is_available(self, model_id: str) -> bool:
        """检查模型是否可用（熔断器）"""
        fail_count = self._fail_counts.get(model_id, 0)
        if fail_count >= 3:
            last_fail = self._last_fail.get(model_id, 0)
            if time.time() - last_fail < self.circuit_open_seconds:
                return False
            else:
                self._fail_counts[model_id] = 0
        return True

    def record_success(self, model_id: str):
        self._fail_counts[model_id] = 0

    def record_failure(self, model_id: str):
        self._fail_counts[model_id] = self._fail_counts.get(model_id, 0) + 1
        self._last_fail[model_id] = time.time()

    def pick_model(self, preferred: str = None, exclude: List[str] = None) -> Optional[str]:
        """选择最优可用模型"""
        exclude = exclude or []
        conn = get_db()
        models = conn.execute("""
            SELECT model_id FROM model_config WHERE enabled=1
            ORDER BY priority DESC
        """).fetchall()
        conn.close()

        if preferred and preferred not in exclude and self.is_available(preferred):
            return preferred

        for row in models:
            mid = row["model_id"]
            if mid not in exclude and self.is_available(mid):
                key_env = conn.execute(
                    "SELECT api_key_env FROM model_config WHERE model_id=?", (mid,)
                ) if False else None
                return mid
        return None


_lb = LoadBalancer()


# - SSE -
async def stream_ollama(model_id: str, prompt: str) -> AsyncIterator[str]:
    import httpx
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream("POST", f"{base_url}/api/generate",
                                 json={"model": model_id, "prompt": prompt, "stream": True}) as resp:
            async for line in resp.aiter_lines():
                if line:
                    data = json.loads(line)
                    yield data.get("response", "")
                    if data.get("done"):
                        break


async def stream_dashscope(model_id: str, messages: List[Dict]) -> AsyncIterator[str]:
    """阿里云百炼 DashScope SSE"""
    import httpx
    api_key = os.getenv("DASHSCOPE_API_KEY", "")
    if not api_key:
        yield "[错误] DASHSCOPE_API_KEY 未配置"
        return
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
                "X-DashScope-SSE": "enable"}
    body = {"model": model_id, "input": {"messages": messages},
            "parameters": {"result_format": "message", "incremental_output": True}}
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream("POST",
                                 "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
                                 headers=headers, json=body) as resp:
            async for line in resp.aiter_lines():
                if line.startswith("data:"):
                    try:
                        data = json.loads(line[5:])
                        content = data.get("output", {}).get("choices", [{}])[0]\
                                      .get("message", {}).get("content", "")
                        if content:
                            yield content
                    except:
                        pass


async def stream_xfyun_spark(model_id: str, messages: List[Dict]) -> AsyncIterator[str]:
    """讯飞星火 WebSocket SSE"""
    import hashlib, hmac, base64
    from urllib.parse import urlencode
    api_key = os.getenv("XFYUN_API_KEY", "")
    api_secret = os.getenv("XFYUN_API_SECRET", "")
    app_id = os.getenv("XFYUN_APP_ID", "")
    if not api_key:
        yield "[错误] XFYUN_API_KEY 未配置"
        return
    # URL
    host = "spark-api.xf-yun.com"
    path_map = {"spark-lite": "/v1.1/chat", "spark-pro": "/v3.1/chat", "spark-max": "/v3.5/chat"}
    path = path_map.get(model_id, "/v1.1/chat")
    from datetime import timezone
    now = datetime.now(timezone.utc)
    date = now.strftime('%a, %d %b %Y %H:%M:%S GMT')
    sign_raw = f"host: {host}\ndate: {date}\nGET {path} HTTP/1.1"
    sign = base64.b64encode(hmac.new(api_secret.encode(), sign_raw.encode(), hashlib.sha256).digest()).decode()
    auth = base64.b64encode(f'api_key="{api_key}", algorithm="hmac-sha256", headers="host date request-line", signature="{sign}"'.encode()).decode()
    url = f"wss://{host}{path}?{urlencode({'authorization': auth, 'date': date, 'host': host})}"
    try:
        import websockets
        body = {"header": {"app_id": app_id, "uid": "user"},
                "parameter": {"chat": {"domain": model_id.replace("-", "_"), "max_tokens": 2048}},
                "payload": {"message": {"text": messages}}}
        async with websockets.connect(url) as ws:
            await ws.send(json.dumps(body))
            while True:
                msg = await ws.recv()
                data = json.loads(msg)
                choices = data.get("payload", {}).get("choices", {})
                for item in choices.get("text", []):
                    yield item.get("content", "")
                if data.get("header", {}).get("status") == 2:
                    break
    except ImportError:
        yield "[错误] 需要安装 websockets 库"
    except Exception as e:
        yield f"[星火错误] {str(e)}"


# - Chat API + -
class ChatRequest(BaseModel):
    model_id: Optional[str] = None
    messages: List[Dict]        # [{role, content}]
    user_id: Optional[str] = "anonymous"
    stream: bool = True


@router.post("/chat")
async def unified_chat(req: ChatRequest):
    model_id = _lb.pick_model(preferred=req.model_id)
    if not model_id:
        return {"error": "没有可用的模型"}

    conn = get_db()
    row = conn.execute("SELECT provider FROM model_config WHERE model_id=?",
                       (model_id,)).fetchone()
    conn.close()
    provider = row["provider"] if row else "ollama"
    start = time.time()

    async def generate():
        nonlocal model_id, provider
        total_chars = 0
        success = True
        try:
            if provider == "ollama":
                prompt = "\n".join(f"{m['role']}: {m['content']}" for m in req.messages)
                async for chunk in stream_ollama(model_id, prompt):
                    total_chars += len(chunk)
                    yield f"data: {json.dumps({'chunk': chunk, 'model': model_id})}\n\n"
            elif provider == "dashscope":
                async for chunk in stream_dashscope(model_id, req.messages):
                    total_chars += len(chunk)
                    yield f"data: {json.dumps({'chunk': chunk, 'model': model_id})}\n\n"
            elif provider == "xfyun":
                async for chunk in stream_xfyun_spark(model_id, req.messages):
                    total_chars += len(chunk)
                    yield f"data: {json.dumps({'chunk': chunk, 'model': model_id})}\n\n"
            _lb.record_success(model_id)
        except Exception as e:
            _lb.record_failure(model_id)
            success = False
            yield f"data: {json.dumps({'error': str(e), 'model': model_id})}\n\n"
        finally:
            latency = int((time.time() - start) * 1000)
            _save_usage(req.user_id, model_id, provider, total_chars, latency, success)
            yield f"data: {json.dumps({'done': True, 'latency_ms': latency})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


def _save_usage(user_id, model_id, provider, chars, latency_ms, success):
    conn = get_db()
    conn.execute("""
        INSERT INTO model_usage (user_id, model_id, provider, total_tokens, latency_ms, success)
        VALUES (?,?,?,?,?,?)
    """, (user_id, model_id, provider, chars, latency_ms, 1 if success else 0))
    conn.commit()
    conn.close()


@router.get("/models")
def list_models():
    conn = get_db()
    rows = conn.execute("SELECT * FROM model_config ORDER BY provider, priority DESC").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        # API Key
        env = d.get("api_key_env", "")
        d["key_configured"] = bool(os.getenv(env, "")) if env else True
        d["available"] = _lb.is_available(d["model_id"]) and (d["key_configured"] or d["provider"] == "ollama")
        result.append(d)
    return result


@router.get("/usage/stats")
def get_usage_stats(user_id: Optional[str] = None, days: int = 30):
    conn = get_db()
    q = """
        SELECT model_id, provider,
               COUNT(*) as calls,
               SUM(total_tokens) as total_tokens,
               AVG(latency_ms) as avg_latency,
               SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as success_count
        FROM model_usage
        WHERE created_at >= datetime('now', ?)
        {}
        GROUP BY model_id, provider
        ORDER BY calls DESC
    """.format("AND user_id=?" if user_id else "")
    params = [f"-{days} days"] + ([user_id] if user_id else [])
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]
