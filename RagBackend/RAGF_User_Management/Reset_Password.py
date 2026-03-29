"""
密码重置模块
支持邮箱验证码 和 手机短信验证码 两种方式重置密码。

验证码存储：内存字典（无需 Redis），有效期 5 分钟，最多重试 5 次。
邮件发送：Python 内置 smtplib（SMTP/SSL）。
短信发送：预留接口，默认控制台打印（可替换为阿里云/腾讯云 SMS SDK）。
"""

import os
import random
import string
import hashlib
import logging
import smtplib
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

# Use the shared db_cursor() — never define DB_CONFIG locally.
from RAGF_User_Management.db_config import db_cursor


# ─────────────────────────────
# SMTP .env
# ─────────────────────────────
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.qq.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 465))
SMTP_USER = os.getenv("SMTP_USER", "")  # xxx@qq.com
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)

# ─────────────────────────────
# key → (code, expire_ts, retry_count)
# ─────────────────────────────
_CODE_STORE: Dict[str, Tuple[str, float, int]] = {}

CODE_TTL = 5 * 60  # 5
MAX_RETRY = 5  # Retry count
CODE_RESEND_INTERVAL = 60  # 60


def _gen_code(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


def _store_code(target: str, code: str):
    _CODE_STORE[target] = (code, time.time() + CODE_TTL, 0)


def _verify_code(target: str, code: str) -> bool:
    entry = _CODE_STORE.get(target)
    if not entry:
        return False
    stored_code, expire_ts, retry_count = entry
    if time.time() > expire_ts:
        del _CODE_STORE[target]
        return False
    if retry_count >= MAX_RETRY:
        del _CODE_STORE[target]
        return False
    if stored_code != code:
        _CODE_STORE[target] = (stored_code, expire_ts, retry_count + 1)
        return False
    del _CODE_STORE[target]
    return True


def _can_resend(target: str) -> bool:
    """是否可以重新发送（防刷）"""
    entry = _CODE_STORE.get(target)
    if not entry:
        return True
    _, expire_ts, _ = entry
    # 60
    remaining = expire_ts - time.time()
    return remaining < (CODE_TTL - CODE_RESEND_INTERVAL)


# ─────────────────────────────
# ─────────────────────────────
def _send_email(to_addr: str, code: str) -> bool:
    if not SMTP_USER or not SMTP_PASSWORD:
        # SMTP/
        logger.warning(
            f"[DEV] 邮件未配置 SMTP，验证码已打印到控制台: {to_addr} -> {code}"
        )
        print(f"\n{'=' * 50}")
        print(f"[邮件验证码] 发送到: {to_addr}")
        print(f"验证码: {code}  (5分钟内有效)")
        print(f"{'=' * 50}\n")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "【RAG-F】密码重置验证码"
        msg["From"] = SMTP_FROM
        msg["To"] = to_addr

        html_body = f"""
        <html><body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px;">
          <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
            <h2 style="color:#0ea5e9;margin-bottom:8px;">RAG-F </h2>
            <p style="color:#555;margin-bottom:24px;"></p>
            <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:20px;text-align:center;">
              <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#0284c7;">{code}</span>
            </div>
            <p style="color:#888;margin-top:20px;font-size:13px;"> <b>5 </b></p>
            <p style="color:#aaa;font-size:12px;margin-top:8px;"></p>
          </div>
        </body></html>
        """
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [to_addr], msg.as_string())

        logger.info(f"验证码邮件已发送至 {to_addr}")
        return True

    except Exception as e:
        logger.error(f"发送邮件失败: {e}")
        return False


# ─────────────────────────────
# ─────────────────────────────
def _send_sms(phone: str, code: str) -> bool:
    """
    短信发送占位实现。
    生产环境替换为阿里云 / 腾讯云 SMS SDK：
      - 阿里云：pip install alibabacloud_dysmsapi20170525
      - 腾讯云：pip install tencentcloud-sdk-python-sms

    所需环境变量（在 .env 中配置）：
      SMS_ACCESS_KEY_ID     = <your_key>
      SMS_ACCESS_KEY_SECRET = <your_secret>
      SMS_SIGN_NAME         = <短信签名>
      SMS_TEMPLATE_CODE     = <模板Code>
    """
    sms_key = os.getenv("SMS_ACCESS_KEY_ID", "")
    if not sms_key:
        # SMS/
        logger.warning(f"[DEV] SMS 未配置，验证码已打印到控制台: {phone} -> {code}")
        print(f"\n{'=' * 50}")
        print(f"[短信验证码] 发送到: {phone}")
        print(f"验证码: {code}  (5分钟内有效)")
        print(f"{'=' * 50}\n")
        return True

    try:
        # - SMS SDK -
        # from alibabacloud_dysmsapi20170525.client import Client
        # from alibabacloud_dysmsapi20170525 import models as sms_models
        # from alibabacloud_tea_openapi import models as open_api_models
        # config = open_api_models.Config(
        #     access_key_id=os.getenv("SMS_ACCESS_KEY_ID"),
        #     access_key_secret=os.getenv("SMS_ACCESS_KEY_SECRET"),
        # )
        # config.endpoint = "dysmsapi.aliyuncs.com"
        # client = Client(config)
        # req = sms_models.SendSmsRequest(
        #     phone_numbers=phone,
        #     sign_name=os.getenv("SMS_SIGN_NAME"),
        #     template_code=os.getenv("SMS_TEMPLATE_CODE"),
        #     template_param=f'{{"code":"{code}"}}',
        # )
        # resp = client.send_sms(req)
        # return resp.body.code == "OK"
        raise NotImplementedError("请在 _send_sms 中接入真实 SMS SDK")
    except Exception as e:
        logger.error(f"发送短信失败: {e}")
        return False


# ─────────────────────────────
# ─────────────────────────────
def _email_exists(email: str) -> bool:
    try:
        with db_cursor() as cur:
            cur.execute("SELECT id FROM user WHERE email = %s", (email,))
            return cur.fetchone() is not None
    except Exception as e:
        logger.error(f"_email_exists error: {e}")
        return False


def _phone_exists(phone: str) -> bool:
    try:
        with db_cursor() as cur:
            cur.execute("DESCRIBE user")
            cols = [r[0] for r in cur.fetchall()]
            if "phone" not in cols:
                return False
            cur.execute("SELECT id FROM user WHERE phone = %s", (phone,))
            return cur.fetchone() is not None
    except Exception as e:
        logger.error(f"_phone_exists error: {e}")
        return False


def _reset_password_by_email(email: str, new_password: str) -> bool:
    try:
        hashed = hashlib.sha256(new_password.encode()).hexdigest()
        with db_cursor() as cur:
            cur.execute(
                "UPDATE user SET password = %s WHERE email = %s", (hashed, email)
            )
            return cur.rowcount > 0
    except Exception as e:
        logger.error(f"_reset_password_by_email error: {e}")
        return False


def _reset_password_by_phone(phone: str, new_password: str) -> bool:
    try:
        hashed = hashlib.sha256(new_password.encode()).hexdigest()
        with db_cursor() as cur:
            cur.execute(
                "UPDATE user SET password = %s WHERE phone = %s", (hashed, phone)
            )
            return cur.rowcount > 0
    except Exception as e:
        logger.error(f"_reset_password_by_phone error: {e}")
        return False


# ─────────────────────────────
# Pydantic
# ─────────────────────────────
class SendEmailCodeRequest(BaseModel):
    email: str


class SendSmsCodeRequest(BaseModel):
    phone: str


class ResetPasswordRequest(BaseModel):
    method: str  # "email" "phone"
    target: str
    code: str
    new_password: str
    confirm_password: str


# ─────────────────────────────
# ─────────────────────────────
@router.post("/api/reset/send-email-code", response_model=dict, tags=["密码重置"])
async def send_email_code(req: SendEmailCodeRequest):
    """
    发送邮箱验证码
    - 邮箱必须已注册
    - 60 秒内不能重发
    """
    email = req.email.strip().lower()

    if not _email_exists(email):
        raise HTTPException(status_code=404, detail="该邮箱未注册")

    if not _can_resend(email):
        raise HTTPException(status_code=429, detail="发送过于频繁，请 60 秒后重试")

    code = _gen_code()
    _store_code(email, code)

    if not _send_email(email, code):
        _CODE_STORE.pop(email, None)
        raise HTTPException(status_code=500, detail="验证码发送失败，请稍后重试")

    return {"status": "success", "message": "验证码已发送到邮箱，5 分钟内有效"}


@router.post("/api/reset/send-sms-code", response_model=dict, tags=["密码重置"])
async def send_sms_code(req: SendSmsCodeRequest):
    """
    发送手机短信验证码
    - 手机号必须已绑定账号
    - 60 秒内不能重发
    """
    phone = req.phone.strip()

    if not _phone_exists(phone):
        raise HTTPException(status_code=404, detail="该手机号未绑定账号")

    if not _can_resend(phone):
        raise HTTPException(status_code=429, detail="发送过于频繁，请 60 秒后重试")

    code = _gen_code()
    _store_code(phone, code)

    if not _send_sms(phone, code):
        _CODE_STORE.pop(phone, None)
        raise HTTPException(status_code=500, detail="短信发送失败，请稍后重试")

    return {"status": "success", "message": "验证码已发送到手机，5 分钟内有效"}


@router.post("/api/reset/password", response_model=dict, tags=["密码重置"])
async def reset_password(req: ResetPasswordRequest):
    """
    重置密码（验证码校验 + 密码更新）
    method: "email" 或 "phone"
    """
    if req.method not in ("email", "phone"):
        raise HTTPException(status_code=400, detail="method 必须为 'email' 或 'phone'")

    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=400, detail="两次输入的密码不一致")

    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="密码长度不能少于 6 位")

    target = req.target.strip()
    if req.method == "email":
        target = target.lower()

    if not _verify_code(target, req.code.strip()):
        raise HTTPException(status_code=400, detail="验证码错误或已过期")

    if req.method == "email":
        success = _reset_password_by_email(target, req.new_password)
    else:
        success = _reset_password_by_phone(target, req.new_password)

    if not success:
        raise HTTPException(status_code=500, detail="密码重置失败，请稍后重试")

    return {"status": "success", "message": "密码已成功重置，请重新登录"}


@router.get("/api/reset/check-email", response_model=dict, tags=["密码重置"])
async def check_email_registered(email: str):
    """
    检查邮箱是否已注册（前端实时验证用）
    """
    exists = _email_exists(email.strip().lower())
    return {"exists": exists}
