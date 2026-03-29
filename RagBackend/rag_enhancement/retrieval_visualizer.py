"""
检索段落相似度可视化 + 人工纠错召回模块
"""

import os
import json
import sqlite3
from typing import List, Optional, Dict
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/retrieval-viz")
DB_PATH = os.path.join(os.path.dirname(__file__), "retrieval_corrections.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS retrieval_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT,
            question    TEXT,
            strategy    TEXT,
            retrieved   TEXT,   -- JSON [{doc_id, score, content, rank}]
            created_at  TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS retrieval_corrections (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            log_id      INTEGER,
            question    TEXT,
            correct_doc_id TEXT,
            correct_content TEXT,
            incorrect_doc_id TEXT,
            user_id     TEXT,
            note        TEXT,
            created_at  TEXT DEFAULT (datetime('now','localtime'))
        );
    """)
    conn.commit()
    conn.close()


init_db()


class RetrievalLog(BaseModel):
    session_id: str
    question: str
    strategy: str
    retrieved: List[Dict]  # [{doc_id, score, content, rank}]


class CorrectionSubmit(BaseModel):
    log_id: int
    question: str
    correct_doc_id: Optional[str] = None
    correct_content: Optional[str] = None
    incorrect_doc_id: Optional[str] = None
    user_id: Optional[str] = "user"
    note: Optional[str] = None


@router.post("/log")
def log_retrieval(req: RetrievalLog):
    conn = get_db()
    conn.execute(
        """
        INSERT INTO retrieval_logs (session_id, question, strategy, retrieved)
        VALUES (?,?,?,?)
    """,
        (
            req.session_id,
            req.question,
            req.strategy,
            json.dumps(req.retrieved, ensure_ascii=False),
        ),
    )
    log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()
    return {"log_id": log_id}


@router.get("/visualize/{log_id}")
def visualize_retrieval(log_id: int):
    """返回可视化所需的相似度数据"""
    conn = get_db()
    row = conn.execute("SELECT * FROM retrieval_logs WHERE id=?", (log_id,)).fetchone()
    conn.close()
    if not row:
        return {"error": "not found"}
    retrieved = json.loads(row["retrieved"] or "[]")

    # 0-100
    scores = [r.get("score", 0) for r in retrieved]
    max_s = max(scores) if scores else 1
    min_s = min(scores) if scores else 0
    range_s = max_s - min_s or 1

    viz_data = []
    for r in retrieved:
        norm_score = round((r.get("score", 0) - min_s) / range_s * 100, 1)
        viz_data.append(
            {
                "rank": r.get("rank", 0),
                "doc_id": r.get("doc_id", ""),
                "raw_score": r.get("score", 0),
                "normalized_score": norm_score,
                "content_preview": r.get("content", "")[:150],
                "bar_width": f"{norm_score}%",
                "color": _score_to_color(norm_score),
            }
        )
    return {
        "log_id": log_id,
        "question": row["question"],
        "strategy": row["strategy"],
        "items": viz_data,
    }


def _score_to_color(score: float) -> str:
    """分数 → 颜色（绿高分 → 黄中分 → 红低分）"""
    if score >= 70:
        return "#4caf50"
    if score >= 40:
        return "#ff9800"
    return "#f44336"


@router.post("/correct")
def submit_correction(req: CorrectionSubmit):
    """用户提交人工纠错"""
    conn = get_db()
    conn.execute(
        """
        INSERT INTO retrieval_corrections
        (log_id, question, correct_doc_id, correct_content,
         incorrect_doc_id, user_id, note)
        VALUES (?,?,?,?,?,?,?)
    """,
        (
            req.log_id,
            req.question,
            req.correct_doc_id,
            req.correct_content,
            req.incorrect_doc_id,
            req.user_id,
            req.note,
        ),
    )
    conn.commit()
    conn.close()
    return {"status": "correction_recorded"}


@router.get("/corrections")
def list_corrections(limit: int = 50):
    """查看所有人工纠错记录（用于后续模型优化）"""
    conn = get_db()
    rows = conn.execute(
        """
        SELECT * FROM retrieval_corrections ORDER BY created_at DESC LIMIT ?
    """,
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
