"""
QQ 互联 OAuth2.0 登录模块
流程：
1. 前端点击 QQ 登录 → 后端返回 QQ 授权 URL
2. 用户在 QQ 授权页确认 → QQ 回调到 /api/qq/callback?code=xxx&state=xxx
3. 后端用 code 换取 access_token
4. 用 access_token 获取 openid
5. 用 openid + access_token 获取用户信息
6. 查询/创建本地用户 → 生成 JWT → 重定向前端
"""

import os
import uuid
import json
import logging
import hashlib
import requests
import urllib.parse

from fastapi import APIRouter
from fastapi.responses import RedirectResponse, JSONResponse

import jwt as pyjwt
from datetime import datetime, timedelta

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)
router = APIRouter()

# ─────────────────────────────
# QQ Environment variable AppID/AppKey
# ─────────────────────────────
QQ_APP_ID = os.getenv("QQ_APP_ID", "1112499674")
QQ_APP_KEY = os.getenv("QQ_APP_KEY", "RVpmB6ec9imXwvdR")

# QQ
# http://localhost:8000/api/qq/callback
QQ_REDIRECT_URI = os.getenv("QQ_REDIRECT_URI", "http://localhost:8000/api/qq/callback")

# QQ API
QQ_AUTHORIZE_URL = "https://graph.qq.com/oauth2.0/authorize"
QQ_TOKEN_URL = "https://graph.qq.com/oauth2.0/token"
QQ_OPENID_URL = "https://graph.qq.com/oauth2.0/me"
QQ_USERINFO_URL = "https://graph.qq.com/user/get_user_info"

FRONTEND_SUCCESS_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ─────────────────────────────
# Database config -
# ─────────────────────────────
from RAGF_User_Management.db_config import get_db_connection as _db_connect

JWT_SECRET = os.getenv("JWT_SECRET", "changeme_jwt_secret")


def _get_db():
    conn = _db_connect()
    cur = conn.cursor()
    cur.execute("USE rag_user_db")
    return conn, cur


def _gen_jwt(email: str) -> str:
    payload = {
        "sub": email,
        "exp": datetime.utcnow() + timedelta(hours=24),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _ensure_qq_column():
    """确保 user 表有 qq_openid 列（首次调用时自动 ALTER）"""
    try:
        conn, cur = _get_db()
        cur.execute("DESCRIBE user")
        cols = [r[0] for r in cur.fetchall()]
        if "qq_openid" not in cols:
            cur.execute(
                "ALTER TABLE user ADD COLUMN qq_openid VARCHAR(100) DEFAULT NULL"
            )
            conn.commit()
            logger.info("已添加 qq_openid 列")
    except Exception as e:
        logger.warning(f"_ensure_qq_column: {e}")
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass


_ensure_qq_column()


# ─────────────────────────────
# Step 1: QQ URL
# ─────────────────────────────
@router.get("/api/qq/authorize")
def qq_authorize():
    """
    前端调用此接口，获取 QQ 授权 URL，然后前端做跳转
    """
    state = uuid.uuid4().hex  # CSRF Status code session
    params = {
        "response_type": "code",
        "client_id": QQ_APP_ID,
        "redirect_uri": QQ_REDIRECT_URI,
        "scope": "get_user_info",
        "state": state,
    }
    url = QQ_AUTHORIZE_URL + "?" + urllib.parse.urlencode(params)
    return JSONResponse({"authorize_url": url, "state": state})


# ─────────────────────────────
# Step 2: QQ
# ─────────────────────────────
@router.get("/api/qq/callback")
def qq_callback(code: str, state: str = ""):
    """
    QQ 回调接口：用 code 换 token → 获取 openid → 获取用户信息 → 生成 JWT → 重定向前端
    """
    # - 2a: code access_token -
    token_params = {
        "grant_type": "authorization_code",
        "client_id": QQ_APP_ID,
        "client_secret": QQ_APP_KEY,
        "code": code,
        "redirect_uri": QQ_REDIRECT_URI,
        "fmt": "json",  # JSON query string
    }
    try:
        resp = requests.get(QQ_TOKEN_URL, params=token_params, timeout=10)
        # QQ query string JSON
        try:
            token_data = resp.json()
        except Exception:
            token_data = dict(urllib.parse.parse_qsl(resp.text))

        access_token = token_data.get("access_token")
        if not access_token:
            logger.error(f"获取 access_token 失败: {token_data}")
            return _redirect_fail("获取 QQ access_token 失败")
    except Exception as e:
        logger.error(f"请求 QQ token 出错: {e}")
        return _redirect_fail("QQ 网络请求失败")

    # - 2b: openid -
    try:
        openid_resp = requests.get(
            QQ_OPENID_URL,
            params={"access_token": access_token, "fmt": "json"},
            timeout=10,
        )
        try:
            openid_data = openid_resp.json()
        except Exception:
            # callback( {"client_id":"...","openid":"..."} )
            raw = openid_resp.text.strip()
            if raw.startswith("callback("):
                raw = raw[9:].rstrip(");").strip()
            openid_data = json.loads(raw)

        openid = openid_data.get("openid")
        if not openid:
            logger.error(f"获取 openid 失败: {openid_data}")
            return _redirect_fail("获取 QQ openid 失败")
    except Exception as e:
        logger.error(f"请求 QQ openid 出错: {e}")
        return _redirect_fail("QQ openid 请求失败")

    # - 2c: / -
    nickname = f"QQ用户_{openid[-6:]}"
    avatar = ""
    try:
        userinfo_resp = requests.get(
            QQ_USERINFO_URL,
            params={
                "access_token": access_token,
                "oauth_consumer_key": QQ_APP_ID,
                "openid": openid,
            },
            timeout=10,
        )
        userinfo = userinfo_resp.json()
        if userinfo.get("ret") == 0:
            nickname = userinfo.get("nickname", nickname)
            avatar = userinfo.get("figureurl_qq_2") or userinfo.get(
                "figureurl_qq_1", ""
            )
    except Exception as e:
        logger.warning(f"获取 QQ 用户信息失败（不影响登录）: {e}")

    # - 2d: / -
    # QQ qq_{openid}@qq.oauth email
    fake_email = f"qq_{openid}@qq.oauth"
    fake_passwd = hashlib.sha256(f"qq_oauth_{openid}".encode()).hexdigest()

    try:
        conn, cur = _get_db()

        # qq_openid
        cur.execute("SELECT id, email FROM user WHERE qq_openid = %s", (openid,))
        row = cur.fetchone()

        if row:
            user_id = row[0]
            user_email = row[1]
        else:
            # fake_email
            cur.execute("SELECT id, email FROM user WHERE email = %s", (fake_email,))
            row = cur.fetchone()
            if row:
                user_id = row[0]
                user_email = row[1]
                # qq_openid
                cur.execute(
                    "UPDATE user SET qq_openid=%s WHERE id=%s", (openid, user_id)
                )
                conn.commit()
            else:
                cur.execute(
                    "INSERT INTO user (email, password, qq_openid) VALUES (%s, %s, %s)",
                    (fake_email, fake_passwd, openid),
                )
                conn.commit()
                user_id = cur.lastrowid
                user_email = fake_email

                # Initialize profile
                cur.execute(
                    """
                    INSERT IGNORE INTO user_profile (user_id, name, signature, social_media, avatar)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (user_id, nickname, "通过QQ登录", "", avatar),
                )
                conn.commit()

        jwt_token = _gen_jwt(user_email)

    except Exception as e:
        logger.error(f"QQ 登录数据库操作失败: {e}")
        return _redirect_fail("服务器内部错误，请稍后重试")
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

    # - 2e: token -
    redirect_url = (
        f"{FRONTEND_SUCCESS_URL}/LogonOrRegister"
        f"?oauth_token={urllib.parse.quote(jwt_token)}"
        f"&oauth_type=qq"
        f"&nickname={urllib.parse.quote(nickname)}"
    )
    return RedirectResponse(url=redirect_url, status_code=302)


def _redirect_fail(msg: str):
    """登录失败时重定向到前端错误页"""
    url = (
        f"{FRONTEND_SUCCESS_URL}/LogonOrRegister?oauth_error={urllib.parse.quote(msg)}"
    )
    return RedirectResponse(url=url, status_code=302)
