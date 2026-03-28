"""
商业化能力：定价体系、付费服务、开发者文档、工单系统
"""
import os
import json
import sqlite3
from datetime import datetime, timedelta
from typing import Optional, List, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/billing")
DB_PATH = os.path.join(os.path.dirname(__file__), "billing.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS plans (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            display_name TEXT,
            price_monthly REAL DEFAULT 0,
            price_yearly  REAL DEFAULT 0,
            features    TEXT DEFAULT '{}',   -- JSON 功能权益
            quota       TEXT DEFAULT '{}',   -- JSON 资源配额
            is_active   INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS subscriptions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT NOT NULL,
            tenant_id   TEXT NOT NULL,
            plan_id     TEXT NOT NULL,
            status      TEXT DEFAULT 'active',  -- active|expired|cancelled
            started_at  TEXT,
            expires_at  TEXT,
            auto_renew  INTEGER DEFAULT 1,
            created_at  TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS tickets (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT,
            tenant_id   TEXT,
            title       TEXT NOT NULL,
            description TEXT,
            category    TEXT,    -- bug|feature|billing|other
            priority    TEXT DEFAULT 'normal',  -- low|normal|high|urgent
            status      TEXT DEFAULT 'open',    -- open|in_progress|resolved|closed
            assigned_to TEXT,
            resolution  TEXT,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            updated_at  TEXT,
            resolved_at TEXT
        );
        CREATE TABLE IF NOT EXISTS ticket_replies (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id   INTEGER NOT NULL,
            author_id   TEXT,
            author_name TEXT,
            is_staff    INTEGER DEFAULT 0,
            content     TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now','localtime'))
        );
        -- 预置价格方案
        INSERT OR IGNORE INTO plans VALUES
        ('free', 'free', '免费版', 0, 0,
         '{"rag_queries":true,"basic_kb":true,"max_kb":3,"max_docs_per_kb":20,"models":["qwen2:0.5b"],"voice":false,"agent":false,"api_access":false}',
         '{"kb_count":3,"doc_count":60,"query_per_month":200,"storage_mb":500}',
         1),
        ('pro', 'pro', 'Pro 版', 39, 390,
         '{"rag_queries":true,"advanced_kb":true,"max_kb":20,"max_docs_per_kb":200,"models":["qwen2:0.5b","qwen-turbo","deepseek-chat"],"voice":true,"agent":true,"api_access":true,"priority_support":true}',
         '{"kb_count":20,"doc_count":4000,"query_per_month":5000,"storage_mb":10240}',
         1),
        ('enterprise', 'enterprise', '企业版', 0, 0,
         '{"all_features":true,"custom_models":true,"sso":true,"multi_tenant":true,"audit":true,"compliance":true,"dedicated_support":true,"custom_integration":true}',
         '{"kb_count":-1,"doc_count":-1,"query_per_month":-1,"storage_mb":-1}',
         1);
    """)
    conn.commit()
    conn.close()


init_db()


# - -
@router.get("/plans")
def list_plans():
    conn = get_db()
    rows = conn.execute("SELECT * FROM plans WHERE is_active=1 ORDER BY price_monthly").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["features"] = json.loads(d.get("features") or "{}")
        d["quota"] = json.loads(d.get("quota") or "{}")
        result.append(d)
    return result


@router.get("/plans/{plan_id}")
def get_plan(plan_id: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM plans WHERE id=?", (plan_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "方案不存在")
    d = dict(row)
    d["features"] = json.loads(d.get("features") or "{}")
    d["quota"] = json.loads(d.get("quota") or "{}")
    return d


# - -
class SubscribeRequest(BaseModel):
    user_id: str
    tenant_id: str
    plan_id: str
    billing_cycle: str = "monthly"  # monthly | yearly
    auto_renew: bool = True


@router.post("/subscribe")
def subscribe(req: SubscribeRequest):
    conn = get_db()
    plan = conn.execute("SELECT * FROM plans WHERE id=?", (req.plan_id,)).fetchone()
    if not plan:
        conn.close()
        raise HTTPException(404, "方案不存在")

    conn.execute("""
        UPDATE subscriptions SET status='cancelled'
        WHERE user_id=? AND tenant_id=? AND status='active'
    """, (req.user_id, req.tenant_id))

    now = datetime.now()
    days = 365 if req.billing_cycle == "yearly" else 30
    expires_at = (now + timedelta(days=days)).isoformat()

    conn.execute("""
        INSERT INTO subscriptions (user_id, tenant_id, plan_id, started_at, expires_at, auto_renew)
        VALUES (?,?,?,?,?,?)
    """, (req.user_id, req.tenant_id, req.plan_id,
          now.isoformat(), expires_at, 1 if req.auto_renew else 0))
    conn.commit()
    sub_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return {"subscription_id": sub_id, "plan_id": req.plan_id, "expires_at": expires_at}


@router.get("/subscription/{user_id}")
def get_subscription(user_id: str):
    conn = get_db()
    row = conn.execute("""
        SELECT s.*, p.display_name, p.features, p.quota
        FROM subscriptions s JOIN plans p ON s.plan_id=p.id
        WHERE s.user_id=? AND s.status='active'
        ORDER BY s.created_at DESC LIMIT 1
    """, (user_id,)).fetchone()
    conn.close()
    if not row:
        return {"plan": "free", "status": "no_subscription"}
    d = dict(row)
    d["features"] = json.loads(d.get("features") or "{}")
    d["quota"] = json.loads(d.get("quota") or "{}")
    return d


# - -
class TicketCreate(BaseModel):
    user_id: str
    tenant_id: Optional[str] = "default"
    title: str
    description: str
    category: str = "other"    # bug|feature|billing|other
    priority: str = "normal"   # low|normal|high|urgent


class TicketReply(BaseModel):
    ticket_id: int
    author_id: str
    author_name: str
    is_staff: bool = False
    content: str


@router.post("/tickets/create")
def create_ticket(req: TicketCreate):
    conn = get_db()
    conn.execute("""
        INSERT INTO tickets (user_id, tenant_id, title, description, category, priority)
        VALUES (?,?,?,?,?,?)
    """, (req.user_id, req.tenant_id, req.title, req.description, req.category, req.priority))
    ticket_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()
    return {"ticket_id": ticket_id, "status": "open"}


@router.get("/tickets/{user_id}")
def list_tickets(user_id: str, status: Optional[str] = None):
    conn = get_db()
    q = "SELECT * FROM tickets WHERE user_id=?"
    params = [user_id]
    if status:
        q += " AND status=?"
        params.append(status)
    q += " ORDER BY created_at DESC"
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/tickets/reply")
def reply_ticket(req: TicketReply):
    conn = get_db()
    conn.execute("""
        INSERT INTO ticket_replies (ticket_id, author_id, author_name, is_staff, content)
        VALUES (?,?,?,?,?)
    """, (req.ticket_id, req.author_id, req.author_name, 1 if req.is_staff else 0, req.content))
    conn.execute("UPDATE tickets SET updated_at=datetime('now','localtime') WHERE id=?",
                 (req.ticket_id,))
    conn.commit()
    conn.close()
    return {"status": "replied"}


@router.patch("/tickets/{ticket_id}/status")
def update_ticket_status(ticket_id: int, status: str, resolution: Optional[str] = None):
    conn = get_db()
    if status == "resolved":
        conn.execute("""
            UPDATE tickets SET status=?, resolution=?, resolved_at=datetime('now','localtime'),
            updated_at=datetime('now','localtime') WHERE id=?
        """, (status, resolution, ticket_id))
    else:
        conn.execute("UPDATE tickets SET status=?, updated_at=datetime('now','localtime') WHERE id=?",
                     (status, ticket_id))
    conn.commit()
    conn.close()
    return {"status": "updated"}


@router.get("/tickets/{ticket_id}/replies")
def get_ticket_replies(ticket_id: int):
    conn = get_db()
    rows = conn.execute("""
        SELECT * FROM ticket_replies WHERE ticket_id=? ORDER BY created_at
    """, (ticket_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]
