"""
feishu_bot.py
飞书机器人接入模块
- 接收飞书自定义机器人 Webhook 消息事件
- 调用 RAG 问答，将回答回复到飞书群/会话
- 支持 @ 机器人触发问答
- 依赖：requests（标准库外最小依赖）

飞书配置步骤（见 /api/integrations/feishu/setup-guide）:
1. 在飞书开放平台创建企业自建应用
2. 添加机器人能力
3. 设置消息事件订阅 URL = http://你的服务器:8000/api/integrations/feishu/webhook
4. 填写 App ID / App Secret / Verification Token 到本模块配置
"""

from __future__ import annotations

import os
import json
import time
import hmac
import hashlib
import logging
from typing import Optional, Dict, Any

import httpx
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)
router = APIRouter()

# - Environment variable API -
_FEISHU_CONFIG: Dict[str, str] = {
    "app_id": os.environ.get("FEISHU_APP_ID", ""),
    "app_secret": os.environ.get("FEISHU_APP_SECRET", ""),
    "verification_token": os.environ.get("FEISHU_VERIFICATION_TOKEN", ""),
    "encrypt_key": os.environ.get("FEISHU_ENCRYPT_KEY", ""),
    "default_kb_id": os.environ.get("FEISHU_DEFAULT_KB_ID", ""),
}

# API
FEISHU_API_BASE = "https://open.feishu.cn/open-apis"

# - Access Token -
_token_cache: Dict[str, Any] = {"token": "", "expires_at": 0}


async def _get_access_token() -> str:
    """获取飞书 Tenant Access Token（自动刷新）"""
    if time.time() < _token_cache["expires_at"] - 60:
        return _token_cache["token"]

    app_id = _FEISHU_CONFIG["app_id"]
    app_secret = _FEISHU_CONFIG["app_secret"]

    if not app_id or not app_secret:
        raise RuntimeError("飞书 App ID / App Secret 未配置")

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{FEISHU_API_BASE}/auth/v3/tenant_access_token/internal",
            json={"app_id": app_id, "app_secret": app_secret},
        )
        data = resp.json()

    if data.get("code") != 0:
        raise RuntimeError(f"获取飞书 Token 失败: {data.get('msg')}")

    _token_cache["token"] = data["tenant_access_token"]
    _token_cache["expires_at"] = time.time() + data.get("expire", 7200)
    logger.info("[Feishu] Access Token 已刷新")
    return _token_cache["token"]


# - -


async def _reply_text(receive_id: str, receive_id_type: str, text: str):
    """向飞书会话/用户发送文本消息"""
    try:
        token = await _get_access_token()
    except RuntimeError as e:
        logger.error(f"[Feishu] 获取 Token 失败，无法回复: {e}")
        return

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{FEISHU_API_BASE}/im/v1/messages",
            params={"receive_id_type": receive_id_type},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={
                "receive_id": receive_id,
                "msg_type": "text",
                "content": json.dumps({"text": text}),
            },
        )
    result = resp.json()
    if result.get("code") != 0:
        logger.error(f"[Feishu] 消息发送失败: {result.get('msg')}")
    else:
        logger.info(f"[Feishu] 消息已发送到 {receive_id_type}={receive_id}")


# - -


async def _handle_question(
    question: str, receive_id: str, receive_id_type: str, kb_id: Optional[str]
):
    """调用 RAG 获取回答并回复飞书"""
    try:
        if kb_id:
            # RAG pipeline
            try:
                from RAG_M.RAG_app import get_rag_answer_sync

                answer = get_rag_answer_sync(question=question, kb_id=kb_id)
            except (ImportError, Exception) as e:
                logger.warning(f"[Feishu] RAG 调用失败，降级到直接 LLM: {e}")
                answer = f"【知识库检索失败，直接回答】\n{_simple_llm_answer(question)}"
        else:
            answer = _simple_llm_answer(question)

        await _reply_text(receive_id, receive_id_type, f"🤖 {answer}")

    except Exception as e:
        logger.error(f"[Feishu] 问答处理失败: {e}", exc_info=True)
        await _reply_text(receive_id, receive_id_type, f"❌ 处理问题时出错: {str(e)}")


def _simple_llm_answer(question: str) -> str:
    """无知识库时的简单 LLM 回答（同步）"""
    try:
        from langchain_ollama.llms import OllamaLLM
        from models.model_config import get_model_config

        config = get_model_config()
        llm = OllamaLLM(model=config.llm_model, temperature=0.7)
        return llm.invoke(question)
    except Exception as e:
        return f"LLM 服务暂不可用: {e}"


# - Webhook -


def _verify_feishu_signature(
    timestamp: str, nonce: str, body: bytes, signature: str
) -> bool:
    """验证飞书 Webhook 签名（使用 encrypt_key）"""
    encrypt_key = _FEISHU_CONFIG.get("encrypt_key", "")
    if not encrypt_key:
        return True

    sign_str = timestamp + nonce + encrypt_key + body.decode("utf-8")
    expected = hashlib.sha256(sign_str.encode("utf-8")).hexdigest()
    return hmac.compare_digest(expected, signature)


# - API -


@router.post("/api/integrations/feishu/webhook")
async def feishu_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    飞书消息事件 Webhook 接入点
    飞书开放平台 → 事件订阅 → 请求地址填写此 URL
    """
    body_bytes = await request.body()

    timestamp = request.headers.get("X-Lark-Request-Timestamp", "")
    nonce = request.headers.get("X-Lark-Request-Nonce", "")
    signature = request.headers.get("X-Lark-Signature", "")
    if signature and not _verify_feishu_signature(
        timestamp, nonce, body_bytes, signature
    ):
        raise HTTPException(status_code=401, detail="Webhook 签名验证失败")

    try:
        payload = json.loads(body_bytes)
    except Exception:
        raise HTTPException(status_code=400, detail="无法解析 JSON")

    # challenge
    if "challenge" in payload:
        return JSONResponse({"challenge": payload["challenge"]})

    # verification token
    verification_token = _FEISHU_CONFIG.get("verification_token", "")
    if verification_token and payload.get("token") != verification_token:
        raise HTTPException(status_code=401, detail="Verification token 不匹配")

    event_type = payload.get("header", {}).get("event_type") or payload.get(
        "event", {}
    ).get("type", "")
    logger.info(f"[Feishu] 收到事件: {event_type}")

    if event_type in ("im.message.receive_v1", "message"):
        event = payload.get("event", {})
        msg = event.get("message", {})
        msg_type = msg.get("message_type", "")

        if msg_type == "text":
            try:
                content = json.loads(msg.get("content", "{}"))
                text = content.get("text", "").strip()

                # @ @_user_1
                text = re.sub(r"@[^\s]+\s*", "", text).strip() if text else ""

                if text:
                    chat_id = event.get("message", {}).get("chat_id") or event.get(
                        "sender", {}
                    ).get("sender_id", {}).get("open_id", "")
                    id_type = (
                        "chat_id"
                        if event.get("message", {}).get("chat_id")
                        else "open_id"
                    )
                    kb_id = _FEISHU_CONFIG.get("default_kb_id") or None

                    # ""
                    await _reply_text(chat_id, id_type, "🔍 正在检索知识库，请稍候...")

                    background_tasks.add_task(
                        _handle_question, text, chat_id, id_type, kb_id
                    )

            except Exception as e:
                logger.error(f"[Feishu] 解析消息内容失败: {e}")

    return JSONResponse({"ok": True})


@router.post("/api/integrations/feishu/configure")
async def configure_feishu(
    app_id: str,
    app_secret: str,
    verification_token: str = "",
    encrypt_key: str = "",
    default_kb_id: str = "",
):
    """动态配置飞书应用凭证"""
    _FEISHU_CONFIG.update(
        {
            "app_id": app_id,
            "app_secret": app_secret,
            "verification_token": verification_token,
            "encrypt_key": encrypt_key,
            "default_kb_id": default_kb_id,
        }
    )
    # token
    _token_cache["expires_at"] = 0

    return {"success": True, "message": "飞书配置已更新"}


@router.get("/api/integrations/feishu/status")
async def feishu_status():
    """检查飞书集成配置状态"""
    configured = bool(_FEISHU_CONFIG.get("app_id") and _FEISHU_CONFIG.get("app_secret"))
    token_valid = time.time() < _token_cache.get("expires_at", 0) - 60

    return {
        "configured": configured,
        "app_id": _FEISHU_CONFIG.get("app_id", "")[:8] + "***"
        if _FEISHU_CONFIG.get("app_id")
        else "",
        "token_valid": token_valid,
        "default_kb_id": _FEISHU_CONFIG.get("default_kb_id", ""),
        "webhook_url": "POST /api/integrations/feishu/webhook",
    }


@router.get("/api/integrations/feishu/setup-guide")
async def feishu_setup_guide():
    """返回飞书集成配置步骤"""
    return {
        "steps": [
            {
                "step": 1,
                "title": "创建飞书自建应用",
                "detail": "访问 https://open.feishu.cn/app → 创建企业自建应用",
            },
            {
                "step": 2,
                "title": "添加机器人能力",
                "detail": "应用详情 → 能力 → 机器人 → 开启",
            },
            {
                "step": 3,
                "title": "申请消息权限",
                "detail": "权限管理 → 申请 'im:message' 和 'im:message:send_as_bot'",
            },
            {
                "step": 4,
                "title": "配置事件订阅",
                "detail": "事件订阅 → 请求地址 = http://你的公网IP:8000/api/integrations/feishu/webhook\n订阅事件：im.message.receive_v1",
            },
            {
                "step": 5,
                "title": "填写应用凭证",
                "detail": "调用 POST /api/integrations/feishu/configure 传入 App ID、App Secret",
                "api_example": {
                    "app_id": "cli_xxxxxxxx",
                    "app_secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
                    "default_kb_id": "你的知识库ID（可选）",
                },
            },
            {
                "step": 6,
                "title": "发布应用并邀请机器人入群",
                "detail": "版本管理 → 创建版本 → 申请发布 → 在目标群中 @ 机器人即可触发问答",
            },
        ],
        "note": "内网穿透推荐使用 ngrok: ngrok http 8000，或在有公网 IP 的服务器上部署",
    }


@router.post("/api/integrations/feishu/test")
async def test_feishu(
    receive_id: str,
    receive_id_type: str = "open_id",
    message: str = "你好！这是一条测试消息 🎉",
):
    """发送测试消息验证飞书配置"""
    try:
        await _reply_text(receive_id, receive_id_type, message)
        return {"success": True, "message": "测试消息发送成功"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
