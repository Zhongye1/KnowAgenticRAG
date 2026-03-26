"""
reranker.py
cross-encoder 重排序模块

功能：
  - 对 RAG 召回的 Top-N 文档片段，用 cross-encoder 模型做精排
  - 支持多种重排模型（ms-marco-MiniLM / bge-reranker-base 等）
  - 轻量降级：无 cross-encoder 依赖时退回 BM25 分数排序
  - 提供 /api/rerank 接口，可单独调用

API:
  POST /api/rerank  -- 对候选文档重排序
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rerank", tags=["RAG-cross-encoder重排"])

# ─── 模型缓存（避免重复加载） ──────────────────────────────────
_rerank_model = None
_rerank_model_name: str = ""


def _get_reranker(model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
    """懒加载 cross-encoder 模型（优先 sentence-transformers CrossEncoder）"""
    global _rerank_model, _rerank_model_name
    if _rerank_model is not None and _rerank_model_name == model_name:
        return _rerank_model
    try:
        from sentence_transformers import CrossEncoder
        logger.info(f"[Reranker] 加载 cross-encoder 模型: {model_name}")
        _rerank_model = CrossEncoder(model_name, max_length=512)
        _rerank_model_name = model_name
        return _rerank_model
    except Exception as e:
        logger.warning(f"[Reranker] 无法加载 cross-encoder，降级为分数排序: {e}")
        return None


# ─── 核心重排函数 ─────────────────────────────────────────────
def rerank_documents(
    query: str,
    candidates: List[Dict[str, Any]],
    top_k: int = 5,
    model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
) -> List[Dict[str, Any]]:
    """
    对候选文档重排序

    参数:
        query      : 用户查询
        candidates : 候选文档列表，每项需包含 "text" 字段（可附带 "score"、"metadata" 等）
        top_k      : 重排后返回的条数
        model_name : cross-encoder 模型名

    返回:
        重排后的文档列表（附带 rerank_score 字段）
    """
    if not candidates:
        return []

    model = _get_reranker(model_name)

    if model is not None:
        # cross-encoder 推理：对 (query, passage) 配对打分
        pairs = [(query, c.get("text", c.get("content", c.get("page_content", "")))) for c in candidates]
        try:
            scores = model.predict(pairs)
            scored = sorted(
                zip(candidates, scores),
                key=lambda x: float(x[1]),
                reverse=True,
            )
            result = []
            for doc, score in scored[:top_k]:
                d = dict(doc)
                d["rerank_score"] = round(float(score), 4)
                result.append(d)
            logger.debug(f"[Reranker] cross-encoder重排 {len(candidates)}→{len(result)} 条")
            return result
        except Exception as e:
            logger.warning(f"[Reranker] cross-encoder推理失败，降级: {e}")

    # 降级：按原始 score 排序
    fallback = sorted(candidates, key=lambda x: float(x.get("score", 0)), reverse=True)
    for d in fallback:
        d["rerank_score"] = d.get("score", 0.0)
    return fallback[:top_k]


# ─── FastAPI 接口 ──────────────────────────────────────────────
class RerankRequest(BaseModel):
    query: str
    candidates: List[Dict[str, Any]]   # 每项需有 "text" 或 "content" 字段
    top_k: int = 5
    model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"


@router.post("")
async def rerank_api(req: RerankRequest):
    """
    对召回的候选文档进行 cross-encoder 精排

    - 输入: query + candidates（可带 score/metadata）
    - 输出: 重排后 top_k 文档，带 rerank_score 字段
    - 无 sentence-transformers 时自动降级为按原始 score 排序
    """
    results = rerank_documents(
        query=req.query,
        candidates=req.candidates,
        top_k=req.top_k,
        model_name=req.model_name,
    )
    return {
        "query": req.query,
        "total_candidates": len(req.candidates),
        "reranked": results,
        "model": req.model_name,
    }


@router.get("/models")
async def list_rerank_models():
    """列出推荐的 cross-encoder 模型"""
    return {
        "recommended": [
            {
                "name": "cross-encoder/ms-marco-MiniLM-L-6-v2",
                "desc": "轻量英文，~67MB，速度快",
                "lang": "en",
            },
            {
                "name": "BAAI/bge-reranker-base",
                "desc": "中英双语，~278MB，推荐用于中文RAG",
                "lang": "zh/en",
            },
            {
                "name": "BAAI/bge-reranker-large",
                "desc": "中英双语大模型，~560MB，精度最高",
                "lang": "zh/en",
            },
        ]
    }
