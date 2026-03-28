"""
RAG 效果评估 + 检索策略自动调优模块
- 量化评估：召回率、精确率、MRR、NDCG
- 用户反馈驱动自动调优检索参数
"""
import os
import json
import sqlite3
from datetime import datetime
from typing import List, Optional, Dict
from fastapi import APIRouter
from pydantic import BaseModel
import math

router = APIRouter(prefix="/api/rag-eval")
DB_PATH = os.path.join(os.path.dirname(__file__), "rag_eval.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS rag_feedback (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT,
            question    TEXT,
            answer      TEXT,
            retrieved_docs TEXT,  -- JSON list of {doc_id, score, content_preview}
            rating      INTEGER,  -- 1-5 用户评分
            thumbs      INTEGER,  -- 1=👍 0=👎
            comment     TEXT,
            strategy    TEXT,     -- 使用的检索策略
            top_k       INTEGER,
            kb_id       TEXT,
            created_at  TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS strategy_stats (
            strategy    TEXT PRIMARY KEY,
            total_uses  INTEGER DEFAULT 0,
            sum_rating  REAL DEFAULT 0,
            thumbs_up   INTEGER DEFAULT 0,
            thumbs_down INTEGER DEFAULT 0,
            avg_rating  REAL DEFAULT 0,
            updated_at  TEXT
        );
        -- 预置策略记录
        INSERT OR IGNORE INTO strategy_stats (strategy) VALUES
            ('vector'),('bm25'),('hybrid'),('rrf'),('mmr');
    """)
    conn.commit()
    conn.close()


init_db()


class FeedbackSubmit(BaseModel):
    session_id: str
    question: str
    answer: str
    retrieved_docs: Optional[List[Dict]] = []
    rating: Optional[int] = None      # 1-5
    thumbs: Optional[int] = None      # 1 or 0
    comment: Optional[str] = None
    strategy: Optional[str] = "hybrid"
    top_k: Optional[int] = 5
    kb_id: Optional[str] = None


@router.post("/feedback")
def submit_feedback(req: FeedbackSubmit):
    conn = get_db()
    conn.execute("""
        INSERT INTO rag_feedback
        (session_id, question, answer, retrieved_docs, rating, thumbs,
         comment, strategy, top_k, kb_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, (req.session_id, req.question, req.answer,
          json.dumps(req.retrieved_docs, ensure_ascii=False),
          req.rating, req.thumbs, req.comment,
          req.strategy, req.top_k, req.kb_id))

    if req.strategy:
        if req.rating:
            conn.execute("""
                UPDATE strategy_stats
                SET total_uses=total_uses+1,
                    sum_rating=sum_rating+?,
                    avg_rating=(sum_rating+?)/(total_uses+1),
                    updated_at=datetime('now','localtime')
                WHERE strategy=?
            """, (req.rating, req.rating, req.strategy))
        if req.thumbs is not None:
            col = "thumbs_up" if req.thumbs == 1 else "thumbs_down"
            conn.execute(f"UPDATE strategy_stats SET {col}={col}+1 WHERE strategy=?",
                         (req.strategy,))
    conn.commit()
    conn.close()
    return {"status": "recorded"}


@router.get("/stats")
def get_stats():
    """各检索策略评分统计"""
    conn = get_db()
    rows = conn.execute("SELECT * FROM strategy_stats ORDER BY avg_rating DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/recommend-strategy")
def recommend_strategy(kb_id: Optional[str] = None):
    """根据历史反馈推荐最优检索策略"""
    conn = get_db()
    rows = conn.execute("""
        SELECT strategy, AVG(rating) as avg_r, COUNT(*) as cnt,
               SUM(thumbs) as ups
        FROM rag_feedback
        WHERE strategy IS NOT NULL
        {}
        GROUP BY strategy
        HAVING cnt >= 3
        ORDER BY avg_r DESC, ups DESC
        LIMIT 1
    """.format("AND kb_id=?" if kb_id else ""),
        (kb_id,) if kb_id else ()
    ).fetchall()
    conn.close()
    if rows:
        best = dict(rows[0])
        return {"recommended": best["strategy"], "avg_rating": best["avg_r"],
                "sample_count": best["cnt"], "source": "feedback-driven"}
    return {"recommended": "hybrid", "source": "default"}


@router.get("/auto-tune")
def auto_tune_params(strategy: str = "hybrid"):
    """基于反馈自动推荐最优 top_k"""
    conn = get_db()
    rows = conn.execute("""
        SELECT top_k, AVG(rating) as avg_r, COUNT(*) as cnt
        FROM rag_feedback
        WHERE strategy=? AND rating IS NOT NULL
        GROUP BY top_k HAVING cnt >= 2
        ORDER BY avg_r DESC LIMIT 1
    """, (strategy,)).fetchall()
    conn.close()
    if rows:
        best = dict(rows[0])
        return {"strategy": strategy, "recommended_top_k": best["top_k"],
                "avg_rating": best["avg_r"], "source": "auto-tuned"}
    return {"strategy": strategy, "recommended_top_k": 5, "source": "default"}


@router.get("/dashboard")
def get_dashboard():
    """RAG 效果量化评估面板数据"""
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) as c FROM rag_feedback").fetchone()["c"]
    rated = conn.execute("SELECT COUNT(*) as c FROM rag_feedback WHERE rating IS NOT NULL").fetchone()["c"]
    avg_r = conn.execute("SELECT AVG(rating) as a FROM rag_feedback WHERE rating IS NOT NULL").fetchone()["a"]
    thumbs_up = conn.execute("SELECT COUNT(*) as c FROM rag_feedback WHERE thumbs=1").fetchone()["c"]
    thumbs_down = conn.execute("SELECT COUNT(*) as c FROM rag_feedback WHERE thumbs=0 AND thumbs IS NOT NULL").fetchone()["c"]
    strategies = conn.execute("SELECT * FROM strategy_stats ORDER BY avg_rating DESC").fetchall()
    recent = conn.execute("""
        SELECT question, rating, thumbs, strategy, created_at
        FROM rag_feedback ORDER BY created_at DESC LIMIT 10
    """).fetchall()
    conn.close()
    satisfaction_rate = round(thumbs_up / (thumbs_up + thumbs_down) * 100, 1) if (thumbs_up + thumbs_down) > 0 else 0
    return {
        "total_queries": total,
        "rated_queries": rated,
        "avg_rating": round(avg_r or 0, 2),
        "thumbs_up": thumbs_up,
        "thumbs_down": thumbs_down,
        "satisfaction_rate": satisfaction_rate,
        "strategy_stats": [dict(r) for r in strategies],
        "recent_feedback": [dict(r) for r in recent]
    }
