"""
超长上下文处理 + 对话记忆持久化模块
- 突破小模型上下文窗口限制（滑动窗口 + 摘要压缩）
- 对话记忆持久化，跨会话精准溯源
"""
import os
import json
import sqlite3
import hashlib
from datetime import datetime
from typing import List, Optional, Dict
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/memory")
DB_PATH = os.path.join(os.path.dirname(__file__), "conversation_memory.db")

# 小模型上下文窗口（token 估算：1字≈1.5token）
DEFAULT_MAX_TOKENS = 2048
DEFAULT_WINDOW_TOKENS = 1500  # 保留给上下文的 token 预算


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS conversations (
            id          TEXT PRIMARY KEY,
            user_id     TEXT,
            kb_ids      TEXT DEFAULT '[]',
            title       TEXT,
            summary     TEXT,
            turn_count  INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            updated_at  TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            conv_id     TEXT NOT NULL,
            role        TEXT NOT NULL,   -- user | assistant | system
            content     TEXT NOT NULL,
            sources     TEXT DEFAULT '[]',  -- JSON: 引用来源列表
            token_est   INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY(conv_id) REFERENCES conversations(id)
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conv_id, id);
    """)
    conn.commit()
    conn.close()


init_db()


def estimate_tokens(text: str) -> int:
    """粗略估算 token 数（中文约 1.5 token/字）"""
    cn_count = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    en_count = len(text) - cn_count
    return int(cn_count * 1.5 + en_count * 0.3)


def summarize_messages(messages: List[Dict], model: str = None) -> str:
    """将超出窗口的消息压缩为摘要（LLM调用 or 简单截断）"""
    try:
        import httpx, os
        ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        model = model or os.getenv("MODEL", "qwen2:0.5b")
        history_text = "\n".join(
            f"{'用户' if m['role']=='user' else 'AI'}：{m['content'][:200]}"
            for m in messages
        )
        prompt = f"请用3-5句话总结以下对话的核心内容：\n{history_text}"
        resp = httpx.post(f"{ollama_url}/api/generate",
                          json={"model": model, "prompt": prompt, "stream": False},
                          timeout=30)
        return resp.json().get("response", "")
    except:
        # 降级：取最后几条消息的前100字拼接
        snippets = [f"{m['role']}: {m['content'][:100]}" for m in messages[-5:]]
        return "历史摘要：" + " | ".join(snippets)


# ── API ─────────────────────────────────────────────────────
class ConvCreate(BaseModel):
    user_id: str
    kb_ids: Optional[List[str]] = []
    title: Optional[str] = "新对话"


class MessageAdd(BaseModel):
    conv_id: str
    role: str
    content: str
    sources: Optional[List[Dict]] = []


@router.post("/conversations/create")
def create_conversation(req: ConvCreate):
    import uuid
    conv_id = str(uuid.uuid4())
    conn = get_db()
    conn.execute("""
        INSERT INTO conversations (id, user_id, kb_ids, title)
        VALUES (?,?,?,?)
    """, (conv_id, req.user_id, json.dumps(req.kb_ids), req.title))
    conn.commit()
    conn.close()
    return {"conv_id": conv_id}


@router.post("/messages/add")
def add_message(req: MessageAdd):
    token_est = estimate_tokens(req.content)
    conn = get_db()
    conn.execute("""
        INSERT INTO messages (conv_id, role, content, sources, token_est)
        VALUES (?,?,?,?,?)
    """, (req.conv_id, req.role, req.content,
          json.dumps(req.sources, ensure_ascii=False), token_est))
    conn.execute("""
        UPDATE conversations
        SET turn_count=turn_count+1, updated_at=datetime('now','localtime')
        WHERE id=?
    """, (req.conv_id,))
    conn.commit()
    conn.close()
    return {"status": "added", "token_est": token_est}


@router.get("/conversations/{conv_id}/context")
def get_context_window(conv_id: str, max_tokens: int = DEFAULT_WINDOW_TOKENS):
    """
    返回适合模型上下文窗口的消息列表：
    - 超出窗口的历史消息压缩为摘要注入
    - 保证最近 N 条完整消息在窗口内
    """
    conn = get_db()
    conv = conn.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
    if not conv:
        return {"messages": [], "summary": None}
    all_msgs = conn.execute("""
        SELECT role, content, sources, token_est
        FROM messages WHERE conv_id=? ORDER BY id ASC
    """, (conv_id,)).fetchall()
    conn.close()

    messages = [dict(m) for m in all_msgs]
    if not messages:
        return {"messages": [], "summary": None}

    # 从最新消息往前累计 token，超出的部分压缩
    window_msgs = []
    used_tokens = 0
    cutoff_idx = len(messages)

    for i in range(len(messages) - 1, -1, -1):
        t = messages[i]["token_est"] or estimate_tokens(messages[i]["content"])
        if used_tokens + t <= max_tokens:
            window_msgs.insert(0, messages[i])
            used_tokens += t
            cutoff_idx = i
        else:
            break

    summary = None
    if cutoff_idx > 0:
        old_msgs = messages[:cutoff_idx]
        summary = summarize_messages(old_msgs)

    return {
        "messages": window_msgs,
        "summary": summary,
        "total_turns": len(messages),
        "window_turns": len(window_msgs),
        "used_tokens": used_tokens
    }


@router.get("/conversations/{user_id}/list")
def list_conversations(user_id: str, limit: int = 20):
    conn = get_db()
    rows = conn.execute("""
        SELECT id, title, turn_count, updated_at, summary
        FROM conversations WHERE user_id=?
        ORDER BY updated_at DESC LIMIT ?
    """, (user_id, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/messages/{conv_id}/sources")
def get_all_sources(conv_id: str):
    """聚合对话中所有 AI 引用的来源（精准溯源）"""
    conn = get_db()
    rows = conn.execute("""
        SELECT sources, created_at FROM messages
        WHERE conv_id=? AND role='assistant' AND sources != '[]'
        ORDER BY id ASC
    """, (conv_id,)).fetchall()
    conn.close()
    all_sources = []
    seen = set()
    for row in rows:
        sources = json.loads(row["sources"] or "[]")
        for s in sources:
            key = s.get("doc_id", "") + s.get("chunk_id", "")
            if key not in seen:
                seen.add(key)
                all_sources.append({**s, "cited_at": row["created_at"]})
    return all_sources
