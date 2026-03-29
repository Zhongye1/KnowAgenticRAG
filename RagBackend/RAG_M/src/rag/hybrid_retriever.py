"""
hybrid_retriever.py
混合检索器：BM25 关键词检索 + FAISS 向量语义检索
使用 Reciprocal Rank Fusion (RRF) 融合两路结果
支持引用溯源（返回来源文件、页码等元数据）
"""

from __future__ import annotations

import math
import re
from typing import List, Tuple, Dict, Any

from langchain.docstore.document import Document
from langchain_community.vectorstores import FAISS


# - BM25 -


class BM25:
    """
    内存版 BM25 检索器（无需额外依赖）
    k1=1.5, b=0.75  （标准 Okapi BM25 参数）
    """

    def __init__(self, documents: List[Document], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.documents = documents
        self.corpus: List[List[str]] = [
            self._tokenize(d.page_content) for d in documents
        ]
        self._build_index()

    # - +
    @staticmethod
    def _tokenize(text: str) -> List[str]:
        text = text.lower()
        tokens = re.findall(r"[\u4e00-\u9fff]|[a-z0-9]+", text)
        return tokens

    def _build_index(self):
        N = len(self.corpus)
        self.avgdl = sum(len(d) for d in self.corpus) / max(N, 1)
        df: Dict[str, int] = {}
        for doc_tokens in self.corpus:
            for token in set(doc_tokens):
                df[token] = df.get(token, 0) + 1
        # IDF
        self.idf: Dict[str, float] = {}
        for token, freq in df.items():
            self.idf[token] = math.log((N - freq + 0.5) / (freq + 0.5) + 1)

    def get_scores(self, query: str) -> List[float]:
        query_tokens = self._tokenize(query)
        scores = []
        for doc_tokens in self.corpus:
            score = 0.0
            doc_len = len(doc_tokens)
            tf_map: Dict[str, int] = {}
            for t in doc_tokens:
                tf_map[t] = tf_map.get(t, 0) + 1
            for token in query_tokens:
                if token not in self.idf:
                    continue
                tf = tf_map.get(token, 0)
                idf = self.idf[token]
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (
                    1 - self.b + self.b * doc_len / self.avgdl
                )
                score += idf * numerator / denominator
            scores.append(score)
        return scores

    def retrieve(self, query: str, top_k: int = 5) -> List[Tuple[Document, float]]:
        scores = self.get_scores(query)
        ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)[:top_k]
        return [(self.documents[i], s) for i, s in ranked if s > 0]


# - RRF -


def reciprocal_rank_fusion(
    ranked_lists: List[List[Tuple[Document, float]]], k: int = 60
) -> List[Tuple[Document, float]]:
    """
    Reciprocal Rank Fusion
    ranked_lists: 多个排序结果列表，每项是 (document, score) 元组
    k: RRF 常数（默认 60）
    返回：融合后的 (document, rrf_score) 列表（降序）
    """
    # page_content
    rrf_scores: Dict[str, float] = {}
    doc_map: Dict[str, Document] = {}

    for ranked in ranked_lists:
        for rank, (doc, _) in enumerate(ranked, start=1):
            key = doc.page_content[:200]  # 200 key
            rrf_scores[key] = rrf_scores.get(key, 0.0) + 1.0 / (k + rank)
            doc_map[key] = doc

    fused = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)
    return [(doc_map[key], score) for key, score in fused]


# - Hybrid retrieval -


class HybridRetriever:
    """
    混合检索器：BM25 + FAISS 向量检索，RRF 融合
    支持引用溯源（source、page 等元数据自动附加到结果）
    """

    def __init__(
        self,
        documents: List[Document],
        vectorstore: FAISS,
        bm25_top_k: int = 5,
        vector_top_k: int = 5,
        final_top_k: int = 4,
    ):
        self.vectorstore = vectorstore
        self.bm25_top_k = bm25_top_k
        self.vector_top_k = vector_top_k
        self.final_top_k = final_top_k

        print(f"[HybridRetriever] 构建 BM25 索引，共 {len(documents)} 个文档块...")
        self.bm25 = BM25(documents)
        print("[HybridRetriever] BM25 索引构建完成")

    def retrieve(self, query: str) -> List[Document]:
        """执行混合检索，返回融合排序后的 top-k 文档"""
        # - 1. BM25
        bm25_results = self.bm25.retrieve(query, top_k=self.bm25_top_k)

        # ── 2. Vector retrieval
        vector_raw = self.vectorstore.similarity_search_with_score(
            query, k=self.vector_top_k
        )
        vector_results = [(doc, score) for doc, score in vector_raw]

        # - 3. RRF
        fused = reciprocal_rank_fusion([bm25_results, vector_results])

        # - 4. top-k
        top_docs = [doc for doc, _ in fused[: self.final_top_k]]

        return top_docs

    def retrieve_with_scores(self, query: str) -> List[Dict[str, Any]]:
        """
        检索并返回带引用溯源信息的结果列表
        每项：{document, rrf_score, source_info}
        source_info 包含：file_name、page、chunk_id 等
        """
        bm25_results = self.bm25.retrieve(query, top_k=self.bm25_top_k)
        vector_raw = self.vectorstore.similarity_search_with_score(
            query, k=self.vector_top_k
        )
        vector_results = [(doc, score) for doc, score in vector_raw]

        fused = reciprocal_rank_fusion([bm25_results, vector_results])

        results = []
        for rank, (doc, rrf_score) in enumerate(fused[: self.final_top_k], start=1):
            meta = doc.metadata or {}
            source_info = {
                "rank": rank,
                "rrf_score": round(rrf_score, 6),
                "file_name": _extract_filename(meta),
                "page": meta.get("page", meta.get("page_number", None)),
                "chunk_index": meta.get("chunk_index", meta.get("seq_num", None)),
                "source_path": meta.get(
                    "source", meta.get("file_path", meta.get("path", ""))
                ),
            }
            results.append(
                {
                    "document": doc,
                    "source_info": source_info,
                    "content_preview": doc.page_content[:200],
                }
            )
        return results


def _extract_filename(meta: Dict[str, Any]) -> str:
    """从元数据中提取文件名"""
    for key in ("source", "file_path", "path", "filename", "file_name"):
        val = meta.get(key, "")
        if val:
            import os

            return os.path.basename(str(val))
    return "未知来源"
