"""
开放 API 体系 - API Key 管理 + 验证中间件
支持外部系统通过 API Key 调用受保护接口
"""
from fastapi import APIRouter, HTTPException, Header, Depends, Query
from pydantic import BaseModel
from typing import Optional
import sqlite3
import secrets
import hashlib
import time
import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)
router = APIRouter()

# - API Key -
APIKEY_DB_PATH = Path(__file__).parent.parent / "metadata" / "api_keys.db"

def _get_conn():
    conn = sqlite3.connect(str(APIKEY_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def ensure_apikey_table():
    try:
        with _get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS api_keys (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key_hash TEXT NOT NULL UNIQUE,
                    key_prefix TEXT NOT NULL,
                    user_id TEXT,
                    user_email TEXT,
                    name TEXT NOT NULL,
                    description TEXT,
                    created_at REAL NOT NULL,
                    expires_at REAL,
                    last_used_at REAL,
                    usage_count INTEGER DEFAULT 0,
                    rate_limit INTEGER DEFAULT 1000,
                    is_active INTEGER DEFAULT 1,
                    permissions TEXT DEFAULT '["read", "query"]'
                )
            """)
            conn.commit()
        logger.info("API Key 表初始化完成")
    except Exception as e:
        logger.warning(f"API Key 表初始化失败: {e}")


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def verify_api_key(key: str) -> Optional[dict]:
    """验证 API Key，返回 key 信息或 None"""
    try:
        key_hash = _hash_key(key)
        with _get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1", (key_hash,)
            ).fetchone()
            if not row:
                return None
            row_dict = dict(row)
            if row_dict.get("expires_at") and time.time() > row_dict["expires_at"]:
                return None
            conn.execute(
                "UPDATE api_keys SET last_used_at = ?, usage_count = usage_count + 1 WHERE key_hash = ?",
                (time.time(), key_hash)
            )
            conn.commit()
            return row_dict
    except Exception as e:
        logger.error(f"API Key 验证失败: {e}")
        return None


# - Pydantic -
class CreateApiKeyRequest(BaseModel):
    name: str
    description: Optional[str] = None
    expires_days: Optional[int] = None     # None =
    rate_limit: int = 1000
    permissions: list[str] = ["read", "query"]
    user_id: Optional[str] = None
    user_email: Optional[str] = None


class ApiKeyResponse(BaseModel):
    id: int
    key_prefix: str
    name: str
    description: Optional[str]
    created_at: float
    expires_at: Optional[float]
    last_used_at: Optional[float]
    usage_count: int
    rate_limit: int
    is_active: bool
    permissions: list[str]


# - API -
@router.post("/api/apikeys/create")
async def create_api_key(req: CreateApiKeyRequest):
    """创建新的 API Key"""
    # ragf_ + 32
    raw_key = f"ragf_{secrets.token_urlsafe(32)}"
    key_prefix = raw_key[:12] + "..."
    key_hash = _hash_key(raw_key)
    expires_at = time.time() + req.expires_days * 86400 if req.expires_days else None

    try:
        with _get_conn() as conn:
            cursor = conn.execute("""
                INSERT INTO api_keys (key_hash, key_prefix, user_id, user_email, name, description,
                    created_at, expires_at, rate_limit, permissions)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                key_hash, key_prefix, req.user_id, req.user_email,
                req.name, req.description, time.time(), expires_at,
                req.rate_limit, str(req.permissions).replace("'", '"')
            ))
            conn.commit()
            key_id = cursor.lastrowid

        return {
            "id": key_id,
            "api_key": raw_key,
            "key_prefix": key_prefix,
            "name": req.name,
            "expires_at": expires_at,
            "message": "API Key 已创建。请妥善保存，该密钥仅显示一次。"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建 API Key 失败: {e}")


@router.get("/api/apikeys/list")
async def list_api_keys(user_email: Optional[str] = None):
    """获取 API Key 列表（不返回原始密钥，只返回前缀）"""
    try:
        conditions = []
        params = []
        if user_email:
            conditions.append("user_email = ?")
            params.append(user_email)
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        with _get_conn() as conn:
            rows = conn.execute(
                f"SELECT * FROM api_keys {where} ORDER BY created_at DESC", params
            ).fetchall()
        return {"keys": [dict(r) for r in rows]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取 API Key 列表失败: {e}")


@router.patch("/api/apikeys/{key_id}/toggle")
async def toggle_api_key(key_id: int):
    """启用/禁用 API Key"""
    try:
        with _get_conn() as conn:
            row = conn.execute("SELECT is_active FROM api_keys WHERE id = ?", (key_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="API Key 不存在")
            new_status = 0 if row["is_active"] else 1
            conn.execute("UPDATE api_keys SET is_active = ? WHERE id = ?", (new_status, key_id))
            conn.commit()
        return {"id": key_id, "is_active": bool(new_status)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"操作失败: {e}")


@router.delete("/api/apikeys/{key_id}")
async def delete_api_key(key_id: int):
    """删除 API Key"""
    try:
        with _get_conn() as conn:
            conn.execute("DELETE FROM api_keys WHERE id = ?", (key_id,))
            conn.commit()
        return {"message": "API Key 已删除", "id": key_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {e}")


@router.post("/api/apikeys/verify")
async def verify_key_endpoint(x_api_key: str = Header(..., alias="X-API-Key")):
    """验证 API Key 是否有效（用于外部系统测试连通性）"""
    info = verify_api_key(x_api_key)
    if not info:
        raise HTTPException(status_code=401, detail="API Key 无效或已过期")
    return {
        "valid": True,
        "name": info["name"],
        "user_email": info.get("user_email"),
        "permissions": info.get("permissions", []),
        "usage_count": info["usage_count"],
    }
