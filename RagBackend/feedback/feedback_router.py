"""
feedback_router.py — 用户反馈提交接口
将反馈内容通过邮件发送到 13425121993@163.com
"""

import logging
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/feedback")

# - Environment variable.env SMTP mailto -
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.163.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")  # /
FEEDBACK_TO = "13425121993@163.com"


class FeedbackRequest(BaseModel):
    type: str  # bug / feature / ui / other
    title: str
    content: str
    email: Optional[str] = ""
    to: Optional[str] = FEEDBACK_TO


TYPE_LABELS = {
    "bug": "🐛 Bug 报告",
    "feature": "💡 功能建议",
    "ui": "🎨 UI 改进",
    "other": "💬 其他",
}


@router.post("/submit", summary="提交用户反馈")
async def submit_feedback(req: FeedbackRequest):
    """
    将反馈内容通过 SMTP 发送邮件到 FEEDBACK_TO。
    若 SMTP 未配置，返回成功（前端用 mailto 兜底）。
    """
    type_label = TYPE_LABELS.get(req.type, req.type)
    subject = f"[RAG-F 用户反馈][{type_label}] {req.title}"
    body = f"""
RAG-F 用户反馈
═══════════════════════════════════════

反馈类型：{type_label}
标　　题：{req.title}
提交时间：{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
用户邮箱：{req.email or "（未填写）"}

────────────────────────────────────
详细描述：
{req.content}

════════════════════════════════════
此邮件由 RAG-F 系统自动发送
    """.strip()

    # SMTP mailto
    if not SMTP_USER or not SMTP_PASS:
        logger.info("[Feedback] SMTP 未配置，反馈内容已记录：%s", subject)
        return {"status": "ok", "message": "feedback_received_no_smtp"}

    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_USER
        msg["To"] = FEEDBACK_TO
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain", "utf-8"))

        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, FEEDBACK_TO, msg.as_string())

        logger.info("[Feedback] 邮件已发送：%s", subject)
        return {"status": "ok", "message": "email_sent"}

    except Exception as e:
        logger.error("[Feedback] 发送邮件失败: %s", e)
        raise HTTPException(status_code=500, detail=f"邮件发送失败: {str(e)}")
