"""
User_settings.py — User profile CRUD endpoints.

All database access uses db_cursor() from db_config, which handles
connect / commit / rollback / close automatically and raises HTTP 503
when MySQL is unreachable instead of crashing with UnboundLocalError.
"""

import base64
import logging
import os
import uuid
from datetime import datetime

import aiofiles
import jwt
import pymysql
from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel

from RAGF_User_Management.db_config import db_cursor

logger = logging.getLogger(__name__)
router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

DEFAULT_AVATAR = (
    "https://pic3.zhimg.com/80/v2-71152904edf11db5c8885548393ace6a_720w.webp"
)


# ── JWT helper ───────────────────────────────────────────────────────────────

def _verify_jwt(token: str) -> dict:
    secret = os.getenv("JWT_SECRET", "changeme_jwt_secret")
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return {"error": "Token has expired"}
    except jwt.InvalidTokenError:
        return {"error": "Invalid token"}


def _require_jwt(token: str) -> str:
    """Decode JWT and return email, or raise HTTP 401."""
    payload = _verify_jwt(token)
    if "error" in payload:
        raise HTTPException(status_code=401, detail=payload["error"])
    return payload["sub"]


# ── GET /api/user/GetUserData ────────────────────────────────────────────────

@router.get("/api/user/GetUserData")
async def get_user_data(token: str = Depends(oauth2_scheme)):
    """Return the profile for the authenticated user."""
    email = _require_jwt(token)

    with db_cursor() as cur:
        # Ensure social_media column exists (migration guard)
        try:
            cur.execute("SELECT social_media FROM user_profile LIMIT 1")
        except pymysql.Error as e:
            if "Unknown column" in str(e):
                cur.execute(
                    "ALTER TABLE user_profile ADD COLUMN social_media VARCHAR(500) DEFAULT ''"
                )

        cur.execute("SELECT id FROM user WHERE email = %s", (email,))
        row = cur.fetchone()
        if not row:
            return {"status": "error", "message": "User not found"}
        user_id = row[0]

        cur.execute(
            "SELECT user_id, name, signature, social_media, avatar "
            "FROM user_profile WHERE user_id = %s",
            (user_id,),
        )
        profile = cur.fetchone()

        if profile:
            return {
                "status": "success",
                "data": {
                    "user_id": profile[0],
                    "name": profile[1] or "",
                    "signature": profile[2] or "",
                    "social_media": profile[3] or "",
                    "avatar": profile[4] or DEFAULT_AVATAR,
                    "email": email,
                },
            }

        # Profile row missing — create it now
        cur.execute(
            "INSERT IGNORE INTO user_profile (user_id, name, signature, social_media, avatar) "
            "VALUES (%s, %s, %s, %s, %s)",
            (user_id, "New User", "", "", DEFAULT_AVATAR),
        )
        return {
            "status": "success",
            "data": {
                "user_id": user_id,
                "name": "New User",
                "signature": "",
                "social_media": "",
                "avatar": DEFAULT_AVATAR,
                "email": email,
            },
        }


# ── POST /api/UpdateUserData ─────────────────────────────────────────────────

class UserDataUpdate(BaseModel):
    avatar: str
    email: str
    name: str
    signature: str
    social_media: str


@router.post("/api/UpdateUserData")
async def update_user_data(
    token: str = Depends(oauth2_scheme),
    user_data: UserDataUpdate = Body(...),
):
    """Update name / signature / social_media / avatar for the authenticated user."""
    email = _require_jwt(token)

    # Handle base64 avatar upload
    if user_data.avatar.startswith("data:image"):
        header, encoded = user_data.avatar.split(",", 1)
        ext = ".png"
        if "jpeg" in header:
            ext = ".jpg"
        elif "gif" in header:
            ext = ".gif"
        elif "webp" in header:
            ext = ".webp"

        upload_dir = os.path.join("local-KLB-files", "avatars")
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"avatar_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}{ext}"
        path = os.path.join(upload_dir, filename)

        async with aiofiles.open(path, "wb") as f:
            await f.write(base64.b64decode(encoded))

        avatar_url = f"/static/avatars/{filename}"
    else:
        avatar_url = user_data.avatar

    with db_cursor() as cur:
        cur.execute(
            "UPDATE user_profile SET name=%s, signature=%s, avatar=%s, social_media=%s "
            "WHERE user_id = (SELECT id FROM user WHERE email = %s)",
            (user_data.name, user_data.signature, avatar_url, user_data.social_media, email),
        )
        if cur.rowcount > 0:
            return {"status": "success", "message": "Profile updated"}
        return {"status": "error", "message": "User not found or nothing changed"}


# ── POST /api/user/UpdateAvatar ──────────────────────────────────────────────

@router.post("/api/user/UpdateAvatar")
async def update_avatar(
    token: str = Depends(oauth2_scheme),
    avatar_file: UploadFile = File(...),
):
    """Upload a new avatar image file for the authenticated user."""
    email = _require_jwt(token)

    upload_dir = os.path.join("local-KLB-files", "avatars")
    os.makedirs(upload_dir, exist_ok=True)

    ext = os.path.splitext(avatar_file.filename)[1]
    filename = f"avatar_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}{ext}"
    path = os.path.join(upload_dir, filename)

    async with aiofiles.open(path, "wb") as f:
        await f.write(await avatar_file.read())

    avatar_url = f"/static/avatars/{filename}"

    with db_cursor() as cur:
        cur.execute(
            "UPDATE user_profile SET avatar = %s "
            "WHERE user_id = (SELECT id FROM user WHERE email = %s)",
            (avatar_url, email),
        )
        if cur.rowcount > 0:
            return {"status": "success", "message": "Avatar updated", "avatar_url": avatar_url}
        return {"status": "error", "message": "User not found"}


# ── DELETE /api/user/DeleteUserData ─────────────────────────────────────────

@router.delete("/api/user/DeleteUserData")
async def delete_user_data(token: str = Depends(oauth2_scheme)):
    """Permanently delete the authenticated user's account."""
    email = _require_jwt(token)

    with db_cursor() as cur:
        cur.execute("DELETE FROM user WHERE email = %s", (email,))
        if cur.rowcount > 0:
            logger.info(f"User deleted: {email}")
            return {"status": "success", "message": "Account deleted"}
        return {"status": "error", "message": "User not found"}


# ── GET /api/user/GetUserAllData ─────────────────────────────────────────────

@router.get("/api/user/GetUserAllData")
async def get_user_all_data():
    """Return all user records (admin/debug endpoint)."""
    with db_cursor() as cur:
        cur.execute("SELECT id, email, created_at FROM user")
        rows = cur.fetchall()

    if not rows:
        raise HTTPException(status_code=400, detail="No users found")

    return {"status": "success", "data": rows}
