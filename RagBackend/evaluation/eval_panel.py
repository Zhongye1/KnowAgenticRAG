"""
eval_panel.py
基于 LangChain Evaluation 的轻量化模型评测面板

功能：
  - 内置 20 条中文测试问题（涵盖知识库检索/摘要/推理/代码4个类别）
  - 三维度评分：准确率 / 响应速度 / 溯源准确率
  - 多模型对比：支持同时评测多个已配置模型
  - 评测结果持久化到 SQLite，前端 ECharts 可视化

API:
  POST /api/eval/run           -- 触发评测（指定模型列表）
  GET  /api/eval/results       -- 获取历史评测结果
  GET  /api/eval/latest        -- 获取最新一次评测结果（ECharts数据格式）
  GET  /api/eval/questions     -- 获取测试题库
  POST /api/eval/questions/add -- 添加自定义测试题
"""

from __future__ import annotations

import asyncio
import json
import logging
import sqlite3
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/eval", tags=["evaluation"])

# ─── 数据库 ──────────────────────────────────────────────
DB_PATH = Path(__file__).parent / "eval_results.db"


def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db():
    with _get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS eval_runs (
                id          TEXT PRIMARY KEY,
                model_name  TEXT NOT NULL,
                run_at      TEXT NOT NULL,
                status      TEXT DEFAULT 'running',
                total_q     INTEGER DEFAULT 0,
                passed_q    INTEGER DEFAULT 0,
                avg_latency REAL DEFAULT 0,
                accuracy    REAL DEFAULT 0,
                source_acc  REAL DEFAULT 0,
                overall     REAL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS eval_details (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id      TEXT NOT NULL,
                q_id        INTEGER,
                question    TEXT,
                category    TEXT,
                answer      TEXT,
                expected    TEXT,
                latency_ms  REAL,
                score       REAL,
                has_source  INTEGER,
                source_ok   INTEGER
            );
            CREATE TABLE IF NOT EXISTS eval_questions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                question    TEXT NOT NULL,
                expected    TEXT NOT NULL,
                category    TEXT DEFAULT 'general',
                keywords    TEXT DEFAULT '',
                active      INTEGER DEFAULT 1
            );
        """)
        # 注入内置 20 条中文测试题（如果没有）
        cur = conn.execute("SELECT COUNT(*) FROM eval_questions")
        if cur.fetchone()[0] == 0:
            _seed_questions(conn)


def _seed_questions(conn):
    """内置 20 条中文测试题"""
    questions = [
        # 知识库检索类
        ("什么是RAG技术？", "RAG（检索增强生成）是一种将外部知识库检索与大模型生成结合的技术", "retrieval", "RAG,检索,生成"),
        ("向量数据库的作用是什么？", "向量数据库用于存储和检索高维向量，支持语义相似度搜索", "retrieval", "向量,数据库,相似度"),
        ("什么是Embedding？", "Embedding是将文本转换为固定长度的稠密向量表示，用于捕捉语义信息", "retrieval", "Embedding,向量,语义"),
        ("知识库和普通数据库有什么区别？", "知识库支持语义搜索和自然语言查询，而普通数据库基于精确匹配", "retrieval", "知识库,语义,检索"),
        ("如何评估RAG系统的检索质量？", "可通过召回率、精确率、MRR、NDCG等指标评估检索质量", "retrieval", "评估,召回,精确"),
        # 摘要生成类
        ("请简述大语言模型的主要应用场景", "包括文本生成、问答系统、代码生成、翻译、摘要等自然语言处理任务", "summary", "大模型,应用,场景"),
        ("什么是Prompt Engineering？", "Prompt工程是通过设计和优化输入提示词来引导大模型生成更好输出的技术", "summary", "Prompt,工程,优化"),
        ("解释一下Fine-tuning和RAG的区别", "Fine-tuning修改模型参数，RAG在推理时动态检索外部知识，无需修改参数", "summary", "Fine-tuning,RAG,区别"),
        ("什么是上下文窗口？", "上下文窗口是模型单次处理的最大token数量，限制了输入文本的长度", "summary", "上下文,窗口,token"),
        ("如何处理长文档的知识库构建？", "通过文本分块（chunking）将长文档切割为小段，再分别向量化存储", "summary", "长文档,分块,向量化"),
        # 逻辑推理类
        ("如果知识库中没有相关信息，模型应该怎么处理？", "应该告知用户该问题超出知识库范围，避免产生幻觉", "reasoning", "幻觉,范围,告知"),
        ("为什么RAG比直接用大模型更准确？", "RAG基于实际文档检索，减少了模型的幻觉问题，答案可溯源验证", "reasoning", "准确,幻觉,溯源"),
        ("向量相似度搜索和关键词搜索各有什么优缺点？", "向量搜索理解语义但计算量大；关键词搜索快速精确但无法理解同义词", "reasoning", "相似度,关键词,优缺点"),
        ("如何提高知识库问答的响应速度？", "可通过向量缓存、减小模型规模、优化索引结构、限制topK等方式提速", "reasoning", "速度,缓存,优化"),
        ("为什么要对文档进行分块处理？", "过长的文档超出上下文窗口，分块后可精准定位相关片段，提升检索精度", "reasoning", "分块,上下文,精度"),
        # 代码/技术类
        ("LangChain是什么？", "LangChain是一个用于构建LLM应用的Python框架，提供链式调用、工具集成等功能", "technical", "LangChain,框架,Python"),
        ("什么是FAISS？", "FAISS是Facebook开发的高效向量相似度搜索库，支持十亿级别向量检索", "technical", "FAISS,向量,搜索"),
        ("FastAPI和Flask有什么区别？", "FastAPI基于异步IO，自动生成OpenAPI文档，性能更好；Flask更简单轻量", "technical", "FastAPI,Flask,异步"),
        ("什么是BM25算法？", "BM25是基于词频和文档长度的信息检索算法，是传统关键词搜索的经典方法", "technical", "BM25,词频,检索"),
        ("如何实现流式输出（Streaming）？", "通过SSE（Server-Sent Events）或WebSocket，模型生成token时逐步推送到前端", "technical", "流式,SSE,WebSocket"),
    ]
    conn.executemany(
        "INSERT INTO eval_questions (question, expected, category, keywords) VALUES (?,?,?,?)",
        questions
    )


_init_db()


# ─── 数据模型 ─────────────────────────────────────────────
class EvalRunRequest(BaseModel):
    model_names: List[str] = ["qwen2:0.5b"]
    question_ids: Optional[List[int]] = None  # None = 全部题目
    kb_id: Optional[str] = None               # 测试时使用的知识库


class AddQuestionRequest(BaseModel):
    question: str
    expected: str
    category: str = "general"
    keywords: str = ""


# ─── 评分工具函数 ──────────────────────────────────────────
def _keyword_score(answer: str, expected: str, keywords: str) -> float:
    """
    基于关键词覆盖率打分（0~1）
    综合：expected关键词覆盖率(70%) + keywords覆盖率(30%)
    """
    answer_lower = answer.lower()

    # 从 expected 提取核心词
    exp_words = [w for w in expected.replace("，", " ").replace("。", " ").split() if len(w) >= 2]
    exp_score = sum(1 for w in exp_words if w.lower() in answer_lower) / max(len(exp_words), 1)

    # keywords 字段
    kw_list = [k.strip() for k in keywords.split(",") if k.strip()]
    kw_score = sum(1 for k in kw_list if k.lower() in answer_lower) / max(len(kw_list), 1) if kw_list else exp_score

    return round(exp_score * 0.7 + kw_score * 0.3, 3)


def _source_accuracy(answer: str) -> tuple[bool, bool]:
    """
    判断答案是否包含溯源信息
    返回：(has_source, source_ok)
    """
    source_markers = ["来源", "根据", "参考", "文档", "片段", "Source", "Reference", "【", "「"]
    has_source = any(m in answer for m in source_markers)
    # 粗粒度：有溯源标记就认为 source_ok
    source_ok = has_source
    return has_source, source_ok


# ─── 核心评测逻辑 ─────────────────────────────────────────
async def _call_model(model_name: str, question: str, kb_id: Optional[str]) -> tuple[str, float]:
    """调用模型获取答案，返回 (answer, latency_ms)"""
    import httpx
    start = time.perf_counter()
    answer = ""
    try:
        # 优先走本项目的 RAG 端点
        payload = {
            "question": question,
            "kb_id": kb_id or "default",
            "model": model_name,
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post("http://localhost:8000/api/chat/ask", json=payload)
            if resp.status_code == 200:
                data = resp.json()
                answer = data.get("answer") or data.get("content") or str(data)
            else:
                # fallback: 直接问 Ollama
                ollama_payload = {
                    "model": model_name,
                    "prompt": f"请用中文简洁回答：{question}",
                    "stream": False,
                }
                resp2 = await client.post("http://localhost:11434/api/generate", json=ollama_payload)
                if resp2.status_code == 200:
                    answer = resp2.json().get("response", "")
    except Exception as e:
        answer = f"[ERROR] {e}"
    latency_ms = (time.perf_counter() - start) * 1000
    return answer, round(latency_ms, 1)


async def _run_eval_task(run_id: str, model_name: str, questions: list, kb_id: Optional[str]):
    """后台评测任务"""
    details = []
    total_score = 0.0
    total_latency = 0.0
    source_hits = 0

    for q in questions:
        answer, latency_ms = await _call_model(model_name, q["question"], kb_id)
        score = _keyword_score(answer, q["expected"], q["keywords"])
        has_source, source_ok = _source_accuracy(answer)

        details.append({
            "run_id": run_id,
            "q_id": q["id"],
            "question": q["question"],
            "category": q["category"],
            "answer": answer[:1000],  # 截断存储
            "expected": q["expected"],
            "latency_ms": latency_ms,
            "score": score,
            "has_source": int(has_source),
            "source_ok": int(source_ok),
        })
        total_score += score
        total_latency += latency_ms
        if source_ok:
            source_hits += 1

    n = len(questions)
    accuracy   = round(total_score / n, 3) if n else 0
    avg_latency = round(total_latency / n, 1) if n else 0
    source_acc  = round(source_hits / n, 3) if n else 0
    overall     = round(accuracy * 0.5 + source_acc * 0.3 + max(0, 1 - avg_latency / 10000) * 0.2, 3)

    with _get_db() as conn:
        conn.executemany(
            """INSERT INTO eval_details
               (run_id,q_id,question,category,answer,expected,latency_ms,score,has_source,source_ok)
               VALUES (:run_id,:q_id,:question,:category,:answer,:expected,:latency_ms,:score,:has_source,:source_ok)""",
            details
        )
        conn.execute(
            """UPDATE eval_runs SET status='done', total_q=?, passed_q=?, avg_latency=?,
               accuracy=?, source_acc=?, overall=? WHERE id=?""",
            (n, sum(1 for d in details if d["score"] >= 0.6), avg_latency,
             accuracy, source_acc, overall, run_id)
        )

    logger.info(f"[Eval] {model_name} run={run_id} acc={accuracy} latency={avg_latency}ms overall={overall}")


# ─── API 路由 ─────────────────────────────────────────────
@router.post("/run")
async def run_evaluation(req: EvalRunRequest, bg: BackgroundTasks):
    """触发评测，后台异步执行，立即返回 run_ids"""
    with _get_db() as conn:
        # 拉取题目
        if req.question_ids:
            placeholders = ",".join("?" * len(req.question_ids))
            qs = conn.execute(
                f"SELECT * FROM eval_questions WHERE id IN ({placeholders}) AND active=1",
                req.question_ids
            ).fetchall()
        else:
            qs = conn.execute("SELECT * FROM eval_questions WHERE active=1").fetchall()

    questions = [dict(q) for q in qs]
    if not questions:
        raise HTTPException(status_code=400, detail="No active questions found")

    run_ids = []
    with _get_db() as conn:
        for model in req.model_names:
            run_id = str(uuid.uuid4())[:8]
            conn.execute(
                "INSERT INTO eval_runs (id, model_name, run_at, total_q) VALUES (?,?,?,?)",
                (run_id, model, datetime.now().isoformat(), len(questions))
            )
            run_ids.append(run_id)
            bg.add_task(_run_eval_task, run_id, model, questions, req.kb_id)

    return {"run_ids": run_ids, "total_questions": len(questions), "status": "running"}


@router.get("/results")
async def get_results(limit: int = 20):
    """获取历史评测列表"""
    with _get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM eval_runs ORDER BY run_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return {"results": [dict(r) for r in rows]}


@router.get("/latest")
async def get_latest_echarts():
    """
    最新评测结果，返回 ECharts 可视化数据格式
    包含：
      - 模型对比雷达图数据（准确率/速度/溯源）
      - 分类准确率柱状图
      - 响应时间分布直方图
    """
    with _get_db() as conn:
        runs = conn.execute(
            "SELECT * FROM eval_runs WHERE status='done' ORDER BY run_at DESC LIMIT 5"
        ).fetchall()
        if not runs:
            return {"message": "No completed eval runs yet"}

        # 雷达图：每个模型3个维度
        radar_data = []
        for run in runs:
            # 速度分：latency越低越高分（0~10000ms 映射到 0~1）
            speed_score = round(max(0, 1 - run["avg_latency"] / 8000), 3)
            radar_data.append({
                "name": run["model_name"],
                "run_id": run["id"],
                "value": [
                    round(run["accuracy"] * 100, 1),
                    round(speed_score * 100, 1),
                    round(run["source_acc"] * 100, 1),
                ]
            })

        # 最新一次运行的分类准确率
        latest_run = runs[0]
        cat_rows = conn.execute(
            """SELECT category, AVG(score) as avg_score, COUNT(*) as cnt
               FROM eval_details WHERE run_id=? GROUP BY category""",
            (latest_run["id"],)
        ).fetchall()
        category_bar = {
            "categories": [r["category"] for r in cat_rows],
            "scores":     [round(r["avg_score"] * 100, 1) for r in cat_rows],
            "counts":     [r["cnt"] for r in cat_rows],
        }

        # 最新运行的延迟分布（直方图区间）
        latency_rows = conn.execute(
            "SELECT latency_ms FROM eval_details WHERE run_id=?", (latest_run["id"],)
        ).fetchall()
        buckets = [0] * 6  # 0-500, 500-1000, 1000-2000, 2000-4000, 4000-8000, 8000+
        for row in latency_rows:
            ms = row["latency_ms"]
            if ms < 500:       buckets[0] += 1
            elif ms < 1000:    buckets[1] += 1
            elif ms < 2000:    buckets[2] += 1
            elif ms < 4000:    buckets[3] += 1
            elif ms < 8000:    buckets[4] += 1
            else:              buckets[5] += 1
        latency_hist = {
            "labels":  ["<0.5s", "0.5-1s", "1-2s", "2-4s", "4-8s", ">8s"],
            "counts":  buckets,
        }

    return {
        "radar": {
            "indicators": [
                {"name": "准确率 (%)", "max": 100},
                {"name": "响应速度 (%)", "max": 100},
                {"name": "溯源准确率 (%)", "max": 100},
            ],
            "series": radar_data,
        },
        "category_bar": category_bar,
        "latency_hist": latency_hist,
        "latest_run": dict(latest_run),
    }


@router.get("/results/{run_id}")
async def get_run_detail(run_id: str):
    """获取单次评测详情"""
    with _get_db() as conn:
        run = conn.execute("SELECT * FROM eval_runs WHERE id=?", (run_id,)).fetchone()
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        details = conn.execute(
            "SELECT * FROM eval_details WHERE run_id=? ORDER BY score DESC", (run_id,)
        ).fetchall()
    return {
        "run": dict(run),
        "details": [dict(d) for d in details],
    }


@router.get("/questions")
async def get_questions():
    """获取题库"""
    with _get_db() as conn:
        rows = conn.execute(
            "SELECT id, question, expected, category, keywords, active FROM eval_questions ORDER BY id"
        ).fetchall()
    by_category: Dict[str, list] = {}
    for r in rows:
        cat = r["category"]
        by_category.setdefault(cat, []).append(dict(r))
    return {"total": len(rows), "by_category": by_category}


@router.post("/questions/add")
async def add_question(req: AddQuestionRequest):
    """添加自定义测试题"""
    with _get_db() as conn:
        cur = conn.execute(
            "INSERT INTO eval_questions (question, expected, category, keywords) VALUES (?,?,?,?)",
            (req.question, req.expected, req.category, req.keywords)
        )
    return {"id": cur.lastrowid, "message": "Question added"}


@router.delete("/questions/{q_id}")
async def deactivate_question(q_id: int):
    """软删除测试题"""
    with _get_db() as conn:
        conn.execute("UPDATE eval_questions SET active=0 WHERE id=?", (q_id,))
    return {"message": "Question deactivated"}
