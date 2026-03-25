"""
retrieval_strategy.py
检索策略路由 —— 让前端 RetrievalConfig 组件的参数真正生效于后端

支持的策略：
  - vector   : 纯向量相似度检索 (FAISS)
  - bm25     : 纯 BM25 关键词检索
  - hybrid   : BM25 + 向量，加权线性融合 (vectorWeight / bm25Weight)
  - rrf      : BM25 + 向量，Reciprocal Rank Fusion（推荐，权重无关）
  - mmr      : Maximal Marginal Relevance（向量检索后去重多样化）

参数说明：
  strategy        : 见上
  topK            : 最终返回文档块数（默认 6）
  scoreThreshold  : 最低相关度过滤（0~1，仅向量/mmr 策略有效）
  vectorWeight    : hybrid 策略向量分数权重（0~1）
  bm25Weight      : hybrid 策略 BM25 分数权重（0~1）
  rerank          : 是否对结果做二次排序（本地 cross-encoder 模拟）
  rerankTopN      : rerank 后保留的文档块数

使用方式：
  from document_processing.retrieval_strategy import RetrievalStrategyExecutor
  executor = RetrievalStrategyExecutor(vectorstore, documents)
  results = executor.retrieve(query, config)
"""

from __future__ import annotations

import math
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field

from langchain.docstore.document import Document
from langchain_community.vectorstores import FAISS

# 内部模块（容忍不同工作目录下的导入路径）
try:
    from RAG_M.src.rag.hybrid_retriever import HybridRetriever, BM25, reciprocal_rank_fusion
except ImportError:
    from src.rag.hybrid_retriever import HybridRetriever, BM25, reciprocal_rank_fusion

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────
# 检索策略配置数据类
# ─────────────────────────────────────────────────────────────────

@dataclass
class RetrievalConfig:
    strategy: str = "rrf"            # vector | bm25 | hybrid | rrf | mmr
    topK: int = 6
    scoreThreshold: float = 0.0      # 0 = 不过滤
    vectorWeight: float = 0.6        # hybrid 策略用
    bm25Weight: float = 0.4          # hybrid 策略用
    rerank: bool = False
    rerankTopN: int = 3

    @classmethod
    def from_dict(cls, d: dict) -> "RetrievalConfig":
        return cls(
            strategy=d.get("strategy", "rrf"),
            topK=int(d.get("topK", 6)),
            scoreThreshold=float(d.get("scoreThreshold", 0.0)),
            vectorWeight=float(d.get("vectorWeight", 0.6)),
            bm25Weight=float(d.get("bm25Weight", 0.4)),
            rerank=bool(d.get("rerank", False)),
            rerankTopN=int(d.get("rerankTopN", 3)),
        )


# ─────────────────────────────────────────────────────────────────
# 标准化检索结果
# ─────────────────────────────────────────────────────────────────

def _build_result_item(rank: int, doc: Document, score: float) -> Dict[str, Any]:
    meta = doc.metadata or {}
    return {
        "document": doc,
        "source_info": {
            "rank": rank,
            "score": round(score, 6),
            "file_name": _extract_filename(meta),
            "page": meta.get("page", meta.get("page_number")),
            "chunk_index": meta.get("chunk_index", meta.get("seq_num")),
            "source_path": meta.get("source", meta.get("file_path", "")),
        },
        "content_preview": doc.page_content[:200],
    }


def _extract_filename(meta: dict) -> str:
    import os
    for key in ("source", "file_path", "path", "filename", "file_name"):
        val = meta.get(key, "")
        if val:
            return os.path.basename(str(val))
    return "未知来源"


# ─────────────────────────────────────────────────────────────────
# 轻量级 Cross-Encoder 模拟（关键词重叠打分 rerank）
# 真实生产场景可替换为 sentence-transformers cross-encoder
# ─────────────────────────────────────────────────────────────────

def _lightweight_rerank(
    query: str,
    docs_with_scores: List[Dict[str, Any]],
    top_n: int,
) -> List[Dict[str, Any]]:
    """
    基于查询词与文档内容的 token 重叠率做二次排序（本地轻量版）。
    适合无 GPU 环境，可被真实 cross-encoder 替换。
    """
    query_tokens = set(query.lower().split())

    def overlap_score(item: Dict[str, Any]) -> float:
        content = item["document"].page_content.lower()
        doc_tokens = set(content.split())
        if not doc_tokens:
            return 0.0
        overlap = len(query_tokens & doc_tokens)
        return overlap / math.sqrt(len(doc_tokens))  # BM25 风格归一化

    reranked = sorted(docs_with_scores, key=overlap_score, reverse=True)
    # 重新编号 rank
    for i, item in enumerate(reranked[:top_n], start=1):
        item["source_info"]["rank"] = i
        item["source_info"]["reranked"] = True
    return reranked[:top_n]


# ─────────────────────────────────────────────────────────────────
# 核心执行器
# ─────────────────────────────────────────────────────────────────

class RetrievalStrategyExecutor:
    """
    统一的检索策略执行器。
    根据 RetrievalConfig 动态选择检索策略并返回标准化结果列表。
    """

    def __init__(
        self,
        vectorstore: FAISS,
        documents: Optional[List[Document]] = None,
    ):
        self.vectorstore = vectorstore
        self.documents = documents or []
        self._bm25: Optional[BM25] = None

    def _get_bm25(self) -> BM25:
        if self._bm25 is None:
            if not self.documents:
                raise ValueError("BM25 检索需要提供 documents 列表")
            self._bm25 = BM25(self.documents)
        return self._bm25

    # ── 各策略实现 ──────────────────────────────────────────────

    def _vector_search(
        self, query: str, top_k: int, score_threshold: float
    ) -> List[Dict[str, Any]]:
        raw = self.vectorstore.similarity_search_with_score(query, k=top_k * 2)
        results = []
        for rank, (doc, score) in enumerate(raw, start=1):
            # FAISS L2 距离 → 转为相似度（越小越好，归一化到 0~1）
            similarity = 1.0 / (1.0 + float(score))
            if similarity < score_threshold:
                continue
            results.append(_build_result_item(rank, doc, similarity))
            if len(results) >= top_k:
                break
        return results

    def _bm25_search(self, query: str, top_k: int) -> List[Dict[str, Any]]:
        bm25 = self._get_bm25()
        raw = bm25.retrieve(query, top_k=top_k)
        return [_build_result_item(i + 1, doc, score) for i, (doc, score) in enumerate(raw)]

    def _hybrid_search(
        self, query: str, config: RetrievalConfig
    ) -> List[Dict[str, Any]]:
        """加权线性融合：score = vectorWeight * v_score + bm25Weight * b_score"""
        bm25 = self._get_bm25()
        bm25_raw = bm25.retrieve(query, top_k=config.topK * 2)
        vector_raw = self.vectorstore.similarity_search_with_score(query, k=config.topK * 2)

        # 归一化 BM25 分数
        b_scores: Dict[str, float] = {}
        b_docs: Dict[str, Document] = {}
        max_bm25 = max((s for _, s in bm25_raw), default=1.0) or 1.0
        for doc, score in bm25_raw:
            key = doc.page_content[:200]
            b_scores[key] = score / max_bm25
            b_docs[key] = doc

        # 归一化向量分数（L2 距离 → 相似度）
        v_scores: Dict[str, float] = {}
        v_docs: Dict[str, Document] = {}
        for doc, dist in vector_raw:
            key = doc.page_content[:200]
            v_scores[key] = 1.0 / (1.0 + float(dist))
            v_docs[key] = doc

        # 融合
        all_keys = set(b_scores) | set(v_scores)
        fused = []
        for key in all_keys:
            b_s = b_scores.get(key, 0.0)
            v_s = v_scores.get(key, 0.0)
            combined = config.vectorWeight * v_s + config.bm25Weight * b_s
            doc = v_docs.get(key) or b_docs.get(key)
            fused.append((doc, combined))

        fused.sort(key=lambda x: x[1], reverse=True)
        return [
            _build_result_item(i + 1, doc, score)
            for i, (doc, score) in enumerate(fused[: config.topK])
        ]

    def _rrf_search(self, query: str, config: RetrievalConfig) -> List[Dict[str, Any]]:
        """RRF 融合"""
        bm25 = self._get_bm25()
        bm25_raw = bm25.retrieve(query, top_k=config.topK)
        vector_raw = self.vectorstore.similarity_search_with_score(query, k=config.topK)
        vector_list = [(doc, score) for doc, score in vector_raw]

        fused = reciprocal_rank_fusion([bm25_raw, vector_list])
        return [
            _build_result_item(i + 1, doc, score)
            for i, (doc, score) in enumerate(fused[: config.topK])
        ]

    def _mmr_search(
        self, query: str, config: RetrievalConfig
    ) -> List[Dict[str, Any]]:
        """Maximal Marginal Relevance（FAISS 原生支持）"""
        try:
            docs = self.vectorstore.max_marginal_relevance_search(
                query,
                k=config.topK,
                fetch_k=config.topK * 3,
                lambda_mult=0.5,   # 0=最多样, 1=最相关
            )
            return [_build_result_item(i + 1, doc, 0.0) for i, doc in enumerate(docs)]
        except Exception as e:
            logger.warning(f"[MMR] 失败，降级为向量检索: {e}")
            return self._vector_search(query, config.topK, config.scoreThreshold)

    # ── 统一入口 ────────────────────────────────────────────────

    def retrieve(
        self,
        query: str,
        config: Optional[RetrievalConfig] = None,
    ) -> List[Dict[str, Any]]:
        """
        根据策略配置执行检索，返回标准化结果列表。
        每项包含 document / source_info / content_preview。
        """
        if config is None:
            config = RetrievalConfig()  # 默认 RRF

        logger.info(
            f"[RetrievalStrategy] 策略={config.strategy}, topK={config.topK}, "
            f"threshold={config.scoreThreshold}, rerank={config.rerank}"
        )

        strategy = config.strategy.lower()

        if strategy == "vector":
            results = self._vector_search(query, config.topK, config.scoreThreshold)
        elif strategy == "bm25":
            results = self._bm25_search(query, config.topK)
        elif strategy == "hybrid":
            results = self._hybrid_search(query, config)
        elif strategy == "rrf":
            results = self._rrf_search(query, config)
        elif strategy == "mmr":
            results = self._mmr_search(query, config)
        else:
            logger.warning(f"[RetrievalStrategy] 未知策略 '{strategy}'，使用 RRF")
            results = self._rrf_search(query, config)

        # ── rerank（可选二次排序）
        if config.rerank and results:
            results = _lightweight_rerank(query, results, top_n=config.rerankTopN)

        return results
