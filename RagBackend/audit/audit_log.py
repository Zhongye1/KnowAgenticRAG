"""
审计日志模块
记录用户操作行为（API调用、文件上传、查询、删除等），写入 SQLite 文件
"""
from fastapi import APIRouter, Request, Depends, Query, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import sqlite3
import time
import json
import os
import logging
from pathlib import Path
from functools import wraps

logger = logging.getLogger(__name__)
router = APIRouter()

# ── 审计日志数据库 ─────────────────────────────────────────────
AUDIT_DB_PATH = Path(__file__).parent.parent / "metadata" / "audit_log.db"

def _get_conn():
    conn = sqlite3.connect(str(AUDIT_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def ensure_audit_table():
    """确保审计日志表存在"""
    try:
        with _get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL NOT NULL,
                    user_id TEXT,
                    user_email TEXT,
                    action TEXT NOT NULL,
                    resource_type TEXT,
                    resource_id TEXT,
                    resource_name TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    request_path TEXT,
                    request_method TEXT,
                    status_code INTEGER,
                    detail TEXT,
                    duration_ms REAL
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)")
            conn.commit()
        logger.info("审计日志表初始化完成")
    except Exception as e:
        logger.warning(f"审计日志表初始化失败: {e}")


def write_audit_log(
    action: str,
    user_id: str = None,
    user_email: str = None,
    resource_type: str = None,
    resource_id: str = None,
    resource_name: str = None,
    ip_address: str = None,
    user_agent: str = None,
    request_path: str = None,
    request_method: str = None,
    status_code: int = None,
    detail: str = None,
    duration_ms: float = None,
):
    """写入一条审计记录（非阻塞，失败不抛出）"""
    try:
        with _get_conn() as conn:
            conn.execute("""
                INSERT INTO audit_logs (
                    timestamp, user_id, user_email, action, resource_type, resource_id,
                    resource_name, ip_address, user_agent, request_path, request_method,
                    status_code, detail, duration_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                time.time(), user_id, user_email, action, resource_type, resource_id,
                resource_name, ip_address, user_agent, request_path, request_method,
                status_code, detail, duration_ms
            ))
            conn.commit()
    except Exception as e:
        logger.debug(f"写入审计日志失败（不影响业务）: {e}")


# ── 从 JWT 提取用户信息的辅助函数 ──────────────────────────────
def _extract_user_from_request(request: Request) -> dict:
    """从 Authorization header 的 JWT 中提取用户信息"""
    user = {"user_id": None, "user_email": None}
    try:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            import PyJWT as jwt_lib
            token = auth[7:]
            secret = os.getenv("JWT_SECRET", "default_secret")
            payload = jwt_lib.decode(token, secret, algorithms=["HS256"])
            user["user_id"] = str(payload.get("user_id") or payload.get("sub", ""))
            user["user_email"] = payload.get("email", "")
    except Exception:
        pass
    return user


# ── FastAPI 中间件：自动记录所有 API 调用 ──────────────────────
class AuditMiddleware:
    """ASGI 中间件，自动记录 API 调用审计日志"""
    def __init__(self, app, skip_paths: list = None):
        self.app = app
        self.skip_paths = skip_paths or ["/static", "/docs", "/openapi.json", "/redoc", "/"]

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        # 跳过静态资源和文档
        if any(path.startswith(p) for p in self.skip_paths):
            await self.app(scope, receive, send)
            return

        start_time = time.time()
        method = scope.get("method", "")
        
        # 获取客户端 IP
        client = scope.get("client")
        ip = client[0] if client else "unknown"
        
        # 获取 headers
        headers = dict(scope.get("headers", []))
        user_agent = headers.get(b"user-agent", b"").decode("utf-8", errors="ignore")
        auth_header = headers.get(b"authorization", b"").decode("utf-8", errors="ignore")
        
        # 提取用户信息
        user_info = {"user_id": None, "user_email": None}
        if auth_header.startswith("Bearer "):
            try:
                import PyJWT as jwt_lib
                token = auth_header[7:]
                secret = os.getenv("JWT_SECRET", "default_secret")
                payload = jwt_lib.decode(token, secret, algorithms=["HS256"])
                user_info["user_id"] = str(payload.get("user_id") or payload.get("sub", ""))
                user_info["user_email"] = payload.get("email", "")
            except Exception:
                pass

        status_code = 500
        
        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = (time.time() - start_time) * 1000
            # 推断操作类型
            action = _infer_action(method, path)
            resource_type, resource_id = _infer_resource(path)
            write_audit_log(
                action=action,
                user_id=user_info["user_id"],
                user_email=user_info["user_email"],
                resource_type=resource_type,
                resource_id=resource_id,
                ip_address=ip,
                user_agent=user_agent[:200] if user_agent else None,
                request_path=path,
                request_method=method,
                status_code=status_code,
                duration_ms=round(duration_ms, 2),
            )


def _infer_action(method: str, path: str) -> str:
    """根据 HTTP 方法和路径推断操作名称"""
    method = method.upper()
    if "/login" in path or "/register" in path:
        return "AUTH"
    if "/upload" in path or method == "POST" and "/documents" in path:
        return "FILE_UPLOAD"
    if method == "DELETE":
        return "DELETE"
    if method == "POST" and ("/query" in path or "/RAG" in path or "/chat" in path):
        return "QUERY"
    if method == "POST":
        return "CREATE"
    if method in ("PUT", "PATCH"):
        return "UPDATE"
    if method == "GET":
        return "READ"
    return method


def _infer_resource(path: str) -> tuple:
    """从路径推断资源类型和 ID"""
    parts = [p for p in path.split("/") if p]
    resource_type = None
    resource_id = None
    if "knowledge" in path or "klb" in path.lower():
        resource_type = "knowledge_base"
    elif "document" in path or "file" in path:
        resource_type = "document"
    elif "chat" in path:
        resource_type = "chat"
    elif "user" in path:
        resource_type = "user"
    elif "RAG" in path:
        resource_type = "rag_query"
    # 尝试提取最后一个类 UUID/数字 segment 作为 resource_id
    for part in reversed(parts):
        if len(part) > 4 and (part.replace("-", "").isalnum()):
            resource_id = part
            break
    return resource_type, resource_id


# ── 查询审计日志 API ───────────────────────────────────────────
@router.get("/api/audit/logs")
async def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    user_email: Optional[str] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None,
):
    """查询审计日志（分页）"""
    try:
        conditions = []
        params = []
        if user_email:
            conditions.append("user_email LIKE ?")
            params.append(f"%{user_email}%")
        if action:
            conditions.append("action = ?")
            params.append(action)
        if resource_type:
            conditions.append("resource_type = ?")
            params.append(resource_type)
        if start_time:
            conditions.append("timestamp >= ?")
            params.append(start_time)
        if end_time:
            conditions.append("timestamp <= ?")
            params.append(end_time)

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        offset = (page - 1) * page_size

        with _get_conn() as conn:
            total = conn.execute(f"SELECT COUNT(*) FROM audit_logs {where}", params).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM audit_logs {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
                params + [page_size, offset]
            ).fetchall()

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "logs": [dict(row) for row in rows],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询审计日志失败: {e}")


@router.get("/api/audit/stats")
async def audit_stats():
    """审计日志统计摘要"""
    try:
        with _get_conn() as conn:
            total = conn.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0]
            today_start = time.time() - 86400
            today = conn.execute("SELECT COUNT(*) FROM audit_logs WHERE timestamp >= ?", (today_start,)).fetchone()[0]
            top_actions = conn.execute(
                "SELECT action, COUNT(*) as cnt FROM audit_logs GROUP BY action ORDER BY cnt DESC LIMIT 10"
            ).fetchall()
            top_users = conn.execute(
                "SELECT user_email, COUNT(*) as cnt FROM audit_logs WHERE user_email IS NOT NULL GROUP BY user_email ORDER BY cnt DESC LIMIT 10"
            ).fetchall()
        return {
            "total_logs": total,
            "today_logs": today,
            "top_actions": [dict(r) for r in top_actions],
            "top_users": [dict(r) for r in top_users],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取审计统计失败: {e}")


@router.delete("/api/audit/logs/clean")
async def clean_old_logs(days: int = Query(90, ge=7, le=365)):
    """清理超过指定天数的审计日志"""
    cutoff = time.time() - days * 86400
    try:
        with _get_conn() as conn:
            result = conn.execute("DELETE FROM audit_logs WHERE timestamp < ?", (cutoff,))
            conn.commit()
        return {"deleted_count": result.rowcount, "days": days}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清理审计日志失败: {e}")
