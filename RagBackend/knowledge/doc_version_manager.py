"""
文档版本管理模块
- 每次文档更新自动保存历史版本
- 支持版本对比、回滚、变更记录
"""
import os
import json
import hashlib
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import sqlite3

router = APIRouter(prefix="/api/doc-versions")

DB_PATH = os.path.join(os.path.dirname(__file__), "doc_versions.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS doc_versions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id      TEXT NOT NULL,
            kb_id       TEXT NOT NULL,
            version     INTEGER NOT NULL,
            filename    TEXT,
            content_hash TEXT,
            content_snapshot TEXT,
            change_summary TEXT,
            created_by  TEXT,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            is_current  INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON doc_versions(doc_id, version);
    """)
    conn.commit()
    conn.close()


init_db()


class VersionCreate(BaseModel):
    doc_id: str
    kb_id: str
    filename: str
    content: str
    change_summary: Optional[str] = "自动保存"
    created_by: Optional[str] = "system"


class RollbackRequest(BaseModel):
    doc_id: str
    target_version: int


@router.post("/save")
def save_version(req: VersionCreate):
    """保存文档新版本"""
    conn = get_db()
    content_hash = hashlib.sha256(req.content.encode()).hexdigest()

    # 检查内容是否变化
    cur = conn.execute(
        "SELECT content_hash FROM doc_versions WHERE doc_id=? AND is_current=1",
        (req.doc_id,)
    )
    row = cur.fetchone()
    if row and row["content_hash"] == content_hash:
        conn.close()
        return {"status": "unchanged", "message": "内容未变化，无需保存新版本"}

    # 获取下一个版本号
    cur = conn.execute(
        "SELECT MAX(version) as max_v FROM doc_versions WHERE doc_id=?",
        (req.doc_id,)
    )
    row = cur.fetchone()
    next_version = (row["max_v"] or 0) + 1

    # 取消旧的当前版本标记
    conn.execute("UPDATE doc_versions SET is_current=0 WHERE doc_id=?", (req.doc_id,))

    # 插入新版本（只存前 5000 字快照节省空间）
    conn.execute("""
        INSERT INTO doc_versions (doc_id, kb_id, version, filename, content_hash,
                                  content_snapshot, change_summary, created_by, is_current)
        VALUES (?,?,?,?,?,?,?,?,1)
    """, (req.doc_id, req.kb_id, next_version, req.filename,
          content_hash, req.content[:5000], req.change_summary, req.created_by))
    conn.commit()
    conn.close()
    return {"status": "saved", "version": next_version}


@router.get("/{doc_id}")
def list_versions(doc_id: str):
    """获取文档所有历史版本列表"""
    conn = get_db()
    rows = conn.execute("""
        SELECT id, version, filename, change_summary, created_by, created_at, is_current, content_hash
        FROM doc_versions WHERE doc_id=? ORDER BY version DESC
    """, (doc_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/{doc_id}/{version}")
def get_version(doc_id: str, version: int):
    """获取指定版本内容快照"""
    conn = get_db()
    row = conn.execute("""
        SELECT * FROM doc_versions WHERE doc_id=? AND version=?
    """, (doc_id, version)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "版本不存在")
    return dict(row)


@router.post("/rollback")
def rollback_version(req: RollbackRequest):
    """回滚到指定版本"""
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM doc_versions WHERE doc_id=? AND version=?",
        (req.doc_id, req.target_version)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "目标版本不存在")
    conn.execute("UPDATE doc_versions SET is_current=0 WHERE doc_id=?", (req.doc_id,))
    conn.execute("UPDATE doc_versions SET is_current=1 WHERE doc_id=? AND version=?",
                 (req.doc_id, req.target_version))
    conn.commit()
    conn.close()
    return {"status": "rolled_back", "version": req.target_version}


@router.get("/{doc_id}/diff/{v1}/{v2}")
def diff_versions(doc_id: str, v1: int, v2: int):
    """简单对比两个版本的文本差异（行级）"""
    import difflib
    conn = get_db()
    row1 = conn.execute("SELECT content_snapshot FROM doc_versions WHERE doc_id=? AND version=?",
                        (doc_id, v1)).fetchone()
    row2 = conn.execute("SELECT content_snapshot FROM doc_versions WHERE doc_id=? AND version=?",
                        (doc_id, v2)).fetchone()
    conn.close()
    if not row1 or not row2:
        raise HTTPException(404, "版本不存在")
    lines1 = (row1["content_snapshot"] or "").splitlines()
    lines2 = (row2["content_snapshot"] or "").splitlines()
    diff = list(difflib.unified_diff(lines1, lines2,
                                     fromfile=f"v{v1}", tofile=f"v{v2}", lineterm=""))
    return {"diff": diff, "additions": sum(1 for l in diff if l.startswith('+')),
            "deletions": sum(1 for l in diff if l.startswith('-'))}
