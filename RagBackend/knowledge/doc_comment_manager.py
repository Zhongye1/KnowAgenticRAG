"""
文档评论区 + AI 问答模块
- 用户可在文档任意位置留评论
- AI 可在评论区直接回答问题
"""
import os
import sqlite3
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/doc-comments")
DB_PATH = os.path.join(os.path.dirname(__file__), "doc_comments.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS comments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id      TEXT NOT NULL,
            kb_id       TEXT NOT NULL,
            parent_id   INTEGER DEFAULT NULL,
            user_id     TEXT,
            user_name   TEXT,
            content     TEXT NOT NULL,
            anchor_text TEXT,         -- 锚定的文档原文片段
            anchor_pos  INTEGER,      -- 字符位置
            is_ai       INTEGER DEFAULT 0,
            resolved    INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            updated_at  TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_comments_doc ON comments(doc_id);
    """)
    conn.commit()
    conn.close()


init_db()


class CommentCreate(BaseModel):
    doc_id: str
    kb_id: str
    content: str
    user_id: Optional[str] = "anonymous"
    user_name: Optional[str] = "匿名用户"
    parent_id: Optional[int] = None
    anchor_text: Optional[str] = None
    anchor_pos: Optional[int] = None


class AICommentRequest(BaseModel):
    doc_id: str
    kb_id: str
    question: str
    anchor_text: Optional[str] = None
    user_id: Optional[str] = "user"


@router.post("/add")
def add_comment(req: CommentCreate):
    conn = get_db()
    conn.execute("""
        INSERT INTO comments (doc_id, kb_id, parent_id, user_id, user_name,
                              content, anchor_text, anchor_pos)
        VALUES (?,?,?,?,?,?,?,?)
    """, (req.doc_id, req.kb_id, req.parent_id, req.user_id, req.user_name,
          req.content, req.anchor_text, req.anchor_pos))
    conn.commit()
    comment_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return {"status": "created", "id": comment_id}


@router.get("/{doc_id}")
def list_comments(doc_id: str):
    conn = get_db()
    rows = conn.execute("""
        SELECT * FROM comments WHERE doc_id=? ORDER BY created_at ASC
    """, (doc_id,)).fetchall()
    conn.close()
    # 构建树形结构
    comments = [dict(r) for r in rows]
    tree = []
    by_id = {c["id"]: {**c, "replies": []} for c in comments}
    for c in comments:
        if c["parent_id"] and c["parent_id"] in by_id:
            by_id[c["parent_id"]]["replies"].append(by_id[c["id"]])
        else:
            tree.append(by_id[c["id"]])
    return tree


@router.post("/ai-answer")
async def ai_answer_in_comment(req: AICommentRequest):
    """AI 在评论区直接回答问题，结合文档上下文"""
    from fastapi.responses import StreamingResponse
    import httpx, json, os

    # 构建 Prompt
    context = f'用户在文档中标注了这段话："{req.anchor_text}"\n\n' if req.anchor_text else ""
    prompt = f"{context}用户提问：{req.question}\n\n请基于文档内容简洁回答。"

    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model = os.getenv("MODEL", "qwen2:0.5b")

    # 保存AI评论占位
    conn = get_db()
    conn.execute("""
        INSERT INTO comments (doc_id, kb_id, user_id, user_name, content, anchor_text, is_ai)
        VALUES (?,?,?,?,?,?,1)
    """, (req.doc_id, req.kb_id, "ai", "AI助手", "（生成中...）", req.anchor_text))
    conn.commit()
    ai_comment_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()

    async def stream_and_save():
        full_text = ""
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream("POST", f"{ollama_url}/api/generate",
                                     json={"model": model, "prompt": prompt, "stream": True}) as resp:
                async for line in resp.aiter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            chunk = data.get("response", "")
                            full_text += chunk
                            yield f"data: {json.dumps({'chunk': chunk})}\n\n"
                            if data.get("done"):
                                break
                        except:
                            pass
        # 更新评论内容
        db = get_db()
        db.execute("UPDATE comments SET content=?, updated_at=datetime('now','localtime') WHERE id=?",
                   (full_text, ai_comment_id))
        db.commit()
        db.close()
        yield f"data: {json.dumps({'done': True, 'comment_id': ai_comment_id})}\n\n"

    return StreamingResponse(stream_and_save(), media_type="text/event-stream")


@router.patch("/{comment_id}/resolve")
def resolve_comment(comment_id: int):
    conn = get_db()
    conn.execute("UPDATE comments SET resolved=1 WHERE id=?", (comment_id,))
    conn.commit()
    conn.close()
    return {"status": "resolved"}


@router.delete("/{comment_id}")
def delete_comment(comment_id: int):
    conn = get_db()
    conn.execute("DELETE FROM comments WHERE id=? OR parent_id=?", (comment_id, comment_id))
    conn.commit()
    conn.close()
    return {"status": "deleted"}
