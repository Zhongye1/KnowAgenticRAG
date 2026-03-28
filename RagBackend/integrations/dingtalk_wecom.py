"""
钉钉 / 企业微信 / WPS 深度集成模块
"""
import os
import json
import hashlib
import time
import hmac
import base64
from typing import Optional, List, Dict
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
import httpx

router = APIRouter(prefix="/api/integrations")


# ════════════════════════════════════════════════════════════
# ════════════════════════════════════════════════════════════
class DingTalkMessage(BaseModel):
    webhook_url: str
    secret: Optional[str] = None
    content: str
    msg_type: str = "text"   # text | markdown | actionCard
    title: Optional[str] = None
    at_all: bool = False
    at_mobiles: Optional[List[str]] = []


def _dingtalk_sign(secret: str) -> tuple:
    timestamp = str(round(time.time() * 1000))
    sign_raw = f"{timestamp}\n{secret}"
    sign = base64.b64encode(
        hmac.new(secret.encode("utf-8"), sign_raw.encode("utf-8"), digestmod=hashlib.sha256).digest()
    ).decode("utf-8")
    return timestamp, sign


async def send_dingtalk(req: DingTalkMessage) -> Dict:
    url = req.webhook_url
    if req.secret:
        ts, sign = _dingtalk_sign(req.secret)
        url += f"&timestamp={ts}&sign={sign}"

    if req.msg_type == "text":
        body = {
            "msgtype": "text",
            "text": {"content": req.content},
            "at": {"atMobiles": req.at_mobiles or [], "isAtAll": req.at_all}
        }
    elif req.msg_type == "markdown":
        body = {
            "msgtype": "markdown",
            "markdown": {"title": req.title or "通知", "text": req.content},
            "at": {"atMobiles": req.at_mobiles or [], "isAtAll": req.at_all}
        }
    else:
        body = {"msgtype": "text", "text": {"content": req.content}}

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json=body)
        return resp.json()


@router.post("/dingtalk/send")
async def dingtalk_send(req: DingTalkMessage):
    try:
        result = await send_dingtalk(req)
        return {"status": "sent", "result": result}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/dingtalk/test")
async def dingtalk_test(data: dict):
    req = DingTalkMessage(
        webhook_url=data.get("webhook_url", ""),
        secret=data.get("secret"),
        content="🤖 RAG-F 钉钉集成测试消息 - 连接成功！",
        msg_type="markdown",
        title="RAG-F 测试"
    )
    return await dingtalk_send(req)


# ════════════════════════════════════════════════════════════
# ════════════════════════════════════════════════════════════
class WeComMessage(BaseModel):
    webhook_url: str
    content: str
    msg_type: str = "text"   # text | markdown | news
    title: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    mentioned_list: Optional[List[str]] = []


async def send_wecom(req: WeComMessage) -> Dict:
    if req.msg_type == "text":
        body = {
            "msgtype": "text",
            "text": {"content": req.content, "mentioned_list": req.mentioned_list or []}
        }
    elif req.msg_type == "markdown":
        body = {"msgtype": "markdown", "markdown": {"content": req.content}}
    elif req.msg_type == "news":
        body = {
            "msgtype": "news",
            "news": {"articles": [{
                "title": req.title or "通知",
                "description": req.description or req.content[:100],
                "url": req.url or "",
                "picurl": ""
            }]}
        }
    else:
        body = {"msgtype": "text", "text": {"content": req.content}}

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(req.webhook_url, json=body)
        return resp.json()


@router.post("/wecom/send")
async def wecom_send(req: WeComMessage):
    try:
        result = await send_wecom(req)
        return {"status": "sent", "result": result}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/wecom/test")
async def wecom_test(data: dict):
    req = WeComMessage(
        webhook_url=data.get("webhook_url", ""),
        content="## RAG-F \n> ",
        msg_type="markdown"
    )
    return await wecom_send(req)


# ════════════════════════════════════════════════════════════
# WPS/ WPS
# ════════════════════════════════════════════════════════════
@router.post("/wps/callback")
async def wps_callback(request: Request):
    """接收 WPS 文档保存回调，自动同步到知识库"""
    try:
        body = await request.json()
        doc_id = body.get("doc_id", "")
        content = body.get("content", "")
        kb_id = body.get("kb_id", "")
        filename = body.get("filename", "document.docx")

        if content and kb_id:
            import asyncio
            asyncio.create_task(_vectorize_wps_doc(doc_id, content, kb_id, filename))
            return {"status": "received", "doc_id": doc_id}
        return {"status": "ignored", "reason": "missing content or kb_id"}
    except Exception as e:
        raise HTTPException(500, str(e))


async def _vectorize_wps_doc(doc_id: str, content: str, kb_id: str, filename: str):
    """后台向量化 WPS 文档内容"""
    try:
        from document_processing.incremental_vectorizer import vectorize_text
        await vectorize_text(doc_id=doc_id, content=content, kb_id=kb_id, filename=filename)
    except Exception as e:
        print(f"[WPS] 向量化失败: {e}")


# ════════════════════════════════════════════════════════════
# Webhook
# ════════════════════════════════════════════════════════════
class WebhookPush(BaseModel):
    url: str
    payload: Dict
    headers: Optional[Dict] = {}
    method: str = "POST"


@router.post("/webhook/push")
async def generic_webhook_push(req: WebhookPush):
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if req.method.upper() == "POST":
                resp = await client.post(req.url, json=req.payload, headers=req.headers)
            else:
                resp = await client.get(req.url, params=req.payload, headers=req.headers)
            return {"status": resp.status_code, "body": resp.text[:500]}
    except Exception as e:
        raise HTTPException(500, str(e))


# ════════════════════════════════════════════════════════════
# Config endpoint savePlatformConfig
# ════════════════════════════════════════════════════════════
_platform_configs: dict = {}


@router.post("/dingtalk/configure")
async def configure_dingtalk(data: dict):
    """保存钉钉配置"""
    _platform_configs["dingtalk"] = data
    return {"status": "ok", "platform": "dingtalk"}


@router.post("/wecom/configure")
async def configure_wecom(data: dict):
    """保存企业微信配置"""
    _platform_configs["wecom"] = data
    return {"status": "ok", "platform": "wecom"}


@router.post("/notion/configure")
async def configure_notion(data: dict):
    """保存 Notion 配置（占位）"""
    _platform_configs["notion"] = data
    return {"status": "ok", "platform": "notion"}


@router.post("/github/configure")
async def configure_github(data: dict):
    """保存 GitHub 配置（占位）"""
    _platform_configs["github"] = data
    return {"status": "ok", "platform": "github"}


@router.post("/notion/test")
async def test_notion(data: dict):
    """Notion 测试连接（占位）"""
    return {"status": "ok", "message": "Notion 配置已保存，集成功能待实现"}


@router.post("/github/test")
async def test_github(data: dict):
    """GitHub 测试连接（占位）"""
    return {"status": "ok", "message": "GitHub 配置已保存，集成功能待实现"}

