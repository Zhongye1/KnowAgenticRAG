"""
全文检索增强模块
- 跨知识库联想搜索
- 文档全文检索（SQLite FTS5）
- 搜索历史 + 搜索建议
"""
import os
import json
import sqlite3
from typing import List, Optional, Dict
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/fulltext-search")
DB_PATH = os.path.join(os.path.dirname(__file__), "fulltext_index.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        -- FTS5 全文检索虚拟表
        CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
            doc_id UNINDEXED,
            kb_id UNINDEXED,
            filename,
            content,
            tags UNINDEXED,
            tokenize='unicode61'
        );
        CREATE TABLE IF NOT EXISTS search_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT,
            query       TEXT,
            result_count INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS search_suggestions (
            query       TEXT PRIMARY KEY,
            frequency   INTEGER DEFAULT 1,
            updated_at  TEXT DEFAULT (datetime('now','localtime'))
        );
    """)
    conn.commit()
    conn.close()


init_db()


class IndexDoc(BaseModel):
    doc_id: str
    kb_id: str
    filename: str
    content: str
    tags: Optional[str] = ""


class SearchRequest(BaseModel):
    query: str
    kb_ids: Optional[List[str]] = None   # None =
    user_id: Optional[str] = None
    limit: int = 20
    offset: int = 0
    highlight: bool = True


@router.post("/index")
def index_document(req: IndexDoc):
    """将文档写入全文索引"""
    conn = get_db()
    conn.execute("DELETE FROM doc_fts WHERE doc_id=?", (req.doc_id,))
    conn.execute("""
        INSERT INTO doc_fts (doc_id, kb_id, filename, content, tags)
        VALUES (?,?,?,?,?)
    """, (req.doc_id, req.kb_id, req.filename, req.content, req.tags or ""))
    conn.commit()
    conn.close()
    return {"status": "indexed", "doc_id": req.doc_id}


@router.post("/search")
def fulltext_search(req: SearchRequest):
    """全文检索（支持跨知识库）"""
    conn = get_db()
    query = req.query.strip()
    if not query:
        return {"results": [], "total": 0}

    # FTS
    fts_query = " OR ".join(f'"{word}"' for word in query.split() if word)

    if req.kb_ids:
        placeholders = ",".join("?" * len(req.kb_ids))
        rows = conn.execute(f"""
            SELECT doc_id, kb_id, filename,
                   snippet(doc_fts, 3, '<mark>', '</mark>', '...', 32) as snippet,
                   rank
            FROM doc_fts
            WHERE doc_fts MATCH ? AND kb_id IN ({placeholders})
            ORDER BY rank
            LIMIT ? OFFSET ?
        """, [fts_query] + req.kb_ids + [req.limit, req.offset]).fetchall()
    else:
        rows = conn.execute("""
            SELECT doc_id, kb_id, filename,
                   snippet(doc_fts, 3, '<mark>', '</mark>', '...', 32) as snippet,
                   rank
            FROM doc_fts
            WHERE doc_fts MATCH ?
            ORDER BY rank
            LIMIT ? OFFSET ?
        """, [fts_query, req.limit, req.offset]).fetchall()

    results = [dict(r) for r in rows]

    if req.user_id:
        conn.execute("""
            INSERT INTO search_history (user_id, query, result_count)
            VALUES (?,?,?)
        """, (req.user_id, query, len(results)))

    conn.execute("""
        INSERT INTO search_suggestions (query, frequency) VALUES (?,1)
        ON CONFLICT(query) DO UPDATE SET frequency=frequency+1, updated_at=datetime('now','localtime')
    """, (query,))
    conn.commit()
    conn.close()

    return {"results": results, "total": len(results), "query": query}


@router.get("/suggest")
def search_suggestions(prefix: str, limit: int = 10):
    """搜索建议（前缀匹配 + 热度排序）"""
    conn = get_db()
    rows = conn.execute("""
        SELECT query, frequency FROM search_suggestions
        WHERE query LIKE ?
        ORDER BY frequency DESC LIMIT ?
    """, (f"{prefix}%", limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/history/{user_id}")
def search_history(user_id: str, limit: int = 20):
    conn = get_db()
    rows = conn.execute("""
        SELECT query, result_count, created_at
        FROM search_history WHERE user_id=?
        ORDER BY created_at DESC LIMIT ?
    """, (user_id, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.delete("/index/{doc_id}")
def remove_from_index(doc_id: str):
    conn = get_db()
    conn.execute("DELETE FROM doc_fts WHERE doc_id=?", (doc_id,))
    conn.commit()
    conn.close()
    return {"status": "removed"}
