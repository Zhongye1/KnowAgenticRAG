"""
文档标签管理 + 智能分类 + 批量编辑 + 过期归档模块
"""
import os
import json
import sqlite3
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

router = APIRouter(prefix="/api/doc-tags")
DB_PATH = os.path.join(os.path.dirname(__file__), "doc_tags.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS tags (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            kb_id    TEXT NOT NULL,
            name     TEXT NOT NULL,
            color    TEXT DEFAULT '#5c6bc0',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(kb_id, name)
        );
        CREATE TABLE IF NOT EXISTS doc_tag_map (
            doc_id   TEXT NOT NULL,
            tag_id   INTEGER NOT NULL,
            PRIMARY KEY(doc_id, tag_id)
        );
        CREATE TABLE IF NOT EXISTS doc_meta (
            doc_id       TEXT PRIMARY KEY,
            kb_id        TEXT NOT NULL,
            filename     TEXT,
            category     TEXT,
            expire_at    TEXT,
            archived     INTEGER DEFAULT 0,
            archive_at   TEXT,
            created_at   TEXT DEFAULT (datetime('now','localtime'))
        );
    """)
    conn.commit()
    conn.close()


init_db()

# - CRUD -
class TagCreate(BaseModel):
    kb_id: str
    name: str
    color: Optional[str] = "#5c6bc0"


@router.post("/tags/create")
def create_tag(req: TagCreate):
    conn = get_db()
    try:
        conn.execute("INSERT INTO tags (kb_id, name, color) VALUES (?,?,?)",
                     (req.kb_id, req.name, req.color))
        conn.commit()
        tag_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.close()
        return {"id": tag_id, "name": req.name, "color": req.color}
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(400, "标签已存在")


@router.get("/tags/{kb_id}")
def list_tags(kb_id: str):
    conn = get_db()
    rows = conn.execute("SELECT * FROM tags WHERE kb_id=?", (kb_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.delete("/tags/{tag_id}")
def delete_tag(tag_id: int):
    conn = get_db()
    conn.execute("DELETE FROM doc_tag_map WHERE tag_id=?", (tag_id,))
    conn.execute("DELETE FROM tags WHERE id=?", (tag_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}


# - -
class DocTagAssign(BaseModel):
    doc_id: str
    tag_ids: List[int]


@router.post("/assign")
def assign_tags(req: DocTagAssign):
    conn = get_db()
    for tag_id in req.tag_ids:
        conn.execute("INSERT OR IGNORE INTO doc_tag_map (doc_id, tag_id) VALUES (?,?)",
                     (req.doc_id, tag_id))
    conn.commit()
    conn.close()
    return {"status": "assigned", "doc_id": req.doc_id, "tag_ids": req.tag_ids}


@router.get("/doc/{doc_id}/tags")
def get_doc_tags(doc_id: str):
    conn = get_db()
    rows = conn.execute("""
        SELECT t.* FROM tags t
        JOIN doc_tag_map m ON t.id = m.tag_id
        WHERE m.doc_id = ?
    """, (doc_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# - -
class BatchEdit(BaseModel):
    doc_ids: List[str]
    action: str          # "add_tag" | "remove_tag" | "set_category" | "set_expire" | "archive"
    tag_id: Optional[int] = None
    category: Optional[str] = None
    expire_days: Optional[int] = None


@router.post("/batch-edit")
def batch_edit(req: BatchEdit):
    conn = get_db()
    affected = 0
    for doc_id in req.doc_ids:
        if req.action == "add_tag" and req.tag_id:
            conn.execute("INSERT OR IGNORE INTO doc_tag_map (doc_id, tag_id) VALUES (?,?)",
                         (doc_id, req.tag_id))
            affected += 1
        elif req.action == "remove_tag" and req.tag_id:
            conn.execute("DELETE FROM doc_tag_map WHERE doc_id=? AND tag_id=?",
                         (doc_id, req.tag_id))
            affected += 1
        elif req.action == "set_category" and req.category:
            conn.execute("INSERT OR REPLACE INTO doc_meta (doc_id, kb_id, category) VALUES (?,''  ,?)",
                         (doc_id, req.category))
            affected += 1
        elif req.action == "set_expire" and req.expire_days:
            expire_at = (datetime.now() + timedelta(days=req.expire_days)).isoformat()
            conn.execute("""
                INSERT INTO doc_meta (doc_id, kb_id, expire_at)
                VALUES (?, '', ?)
                ON CONFLICT(doc_id) DO UPDATE SET expire_at=excluded.expire_at
            """, (doc_id, expire_at))
            affected += 1
        elif req.action == "archive":
            conn.execute("""
                INSERT INTO doc_meta (doc_id, kb_id, archived, archive_at)
                VALUES (?, '', 1, datetime('now','localtime'))
                ON CONFLICT(doc_id) DO UPDATE SET archived=1, archive_at=datetime('now','localtime')
            """, (doc_id,))
            affected += 1
    conn.commit()
    conn.close()
    return {"status": "done", "affected": affected}


# - +-
def auto_classify(filename: str, content_preview: str = "") -> str:
    """简单规则分类，生产环境可替换为LLM分类"""
    text = (filename + " " + content_preview).lower()
    rules = [
        (["合同", "协议", "agreement", "contract"], "合同文件"),
        (["报告", "分析", "report", "analysis"], "分析报告"),
        (["会议", "纪要", "minutes", "meeting"], "会议记录"),
        (["技术", "架构", "api", "代码", "code", "spec"], "技术文档"),
        (["产品", "需求", "prd", "feature"], "产品文档"),
        (["财务", "预算", "账单", "finance", "budget"], "财务文件"),
        (["培训", "手册", "教程", "tutorial", "guide"], "培训材料"),
    ]
    for keywords, category in rules:
        if any(k in text for k in keywords):
            return category
    return "未分类"


@router.post("/auto-classify")
def classify_doc(data: dict):
    """自动分类单个文档"""
    filename = data.get("filename", "")
    content = data.get("content_preview", "")
    category = auto_classify(filename, content)
    return {"category": category}


# - -
@router.post("/run-archive")
def run_archive():
    """检查过期文档并自动归档（建议每日凌晨调用）"""
    conn = get_db()
    now = datetime.now().isoformat()
    rows = conn.execute("""
        SELECT doc_id FROM doc_meta
        WHERE expire_at IS NOT NULL AND expire_at < ? AND archived = 0
    """, (now,)).fetchall()
    archived_ids = [r["doc_id"] for r in rows]
    if archived_ids:
        conn.execute(f"""
            UPDATE doc_meta SET archived=1, archive_at=datetime('now','localtime')
            WHERE doc_id IN ({','.join('?' * len(archived_ids))})
        """, archived_ids)
        conn.commit()
    conn.close()
    return {"archived_count": len(archived_ids), "doc_ids": archived_ids}
