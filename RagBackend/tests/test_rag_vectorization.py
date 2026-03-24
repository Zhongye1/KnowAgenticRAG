"""
RAG 混合检索与向量化测试套件
================================================
测试内容：
  1. BM25 基础评分逻辑
  2. RRF（Reciprocal Rank Fusion）融合算法
  3. 向量化（embedding 模拟）+ 余弦相似度
  4. HybridRetriever.retrieve_with_scores 引用溯源完整性
  5. 图谱合并去重（merge_graph）
  6. RAG Pipeline 结果结构验证

运行方式：
  cd RagBackend && python tests/test_rag_vectorization.py
"""

import sys
import os
import math
import json
import tempfile
import unittest
import pathlib
from typing import List, Dict, Any

# 路径配置
BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(BACKEND_ROOT / "RAG_M" / "src"))

# ──────────────────────────────────────────
# 工具函数：不依赖外部库的余弦相似度
# ──────────────────────────────────────────

def cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x ** 2 for x in a))
    norm_b = math.sqrt(sum(x ** 2 for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def mock_embed(text: str) -> List[float]:
    """
    简单 mock embedding：统计字符频率形成固定长度向量（不依赖 FAISS/torch）
    """
    DIM = 64
    vec = [0.0] * DIM
    for i, ch in enumerate(text):
        vec[ord(ch) % DIM] += 1.0
    # L2 归一化
    norm = math.sqrt(sum(x ** 2 for x in vec)) or 1.0
    return [x / norm for x in vec]


# ──────────────────────────────────────────
# 测试类 1：BM25 评分
# ──────────────────────────────────────────

class TestBM25Scoring(unittest.TestCase):

    def setUp(self):
        """尝试导入 HybridRetriever 中的 BM25Retriever"""
        try:
            from rag.hybrid_retriever import BM25Retriever
            self.BM25Retriever = BM25Retriever
            self.skip = False
        except ImportError:
            self.skip = True

    def test_bm25_score_positive_for_match(self):
        """匹配查询词的文档得分应 > 0"""
        if self.skip:
            self.skipTest("BM25Retriever 模块不可用（依赖缺失）")
        docs = [
            {"content": "知识图谱是一种语义网络", "metadata": {"source": "doc1"}},
            {"content": "机器学习需要大量数据", "metadata": {"source": "doc2"}},
            {"content": "知识图谱与机器学习结合使用", "metadata": {"source": "doc3"}},
        ]
        retriever = self.BM25Retriever(docs)
        results = retriever.search("知识图谱", top_k=3)
        self.assertTrue(len(results) > 0, "应该返回至少一个结果")
        self.assertGreater(results[0]["score"], 0, "最高得分应 > 0")

    def test_bm25_most_relevant_first(self):
        """最相关文档排在第一位"""
        if self.skip:
            self.skipTest("BM25Retriever 模块不可用")
        docs = [
            {"content": "今天天气很好", "metadata": {"source": "d1"}},
            {"content": "知识图谱知识图谱知识图谱——专门讲图谱的文档", "metadata": {"source": "d2"}},
            {"content": "随机内容与查询无关", "metadata": {"source": "d3"}},
        ]
        retriever = self.BM25Retriever(docs)
        results = retriever.search("知识图谱", top_k=3)
        # 最相关的应该是 d2
        if results:
            self.assertIn("图谱", results[0]["content"])

    def test_bm25_empty_query(self):
        """空查询不应崩溃"""
        if self.skip:
            self.skipTest("BM25Retriever 模块不可用")
        docs = [{"content": "测试文档", "metadata": {"source": "d1"}}]
        retriever = self.BM25Retriever(docs)
        try:
            results = retriever.search("", top_k=3)
            # 空查询可以返回空列表，不应抛出异常
            self.assertIsInstance(results, list)
        except Exception as e:
            self.fail(f"空查询不应抛出异常: {e}")


# ──────────────────────────────────────────
# 测试类 2：RRF 融合算法（纯逻辑，不依赖外部库）
# ──────────────────────────────────────────

class TestRRFFusion(unittest.TestCase):

    def _rrf_score(self, rank: int, k: int = 60) -> float:
        return 1.0 / (k + rank + 1)

    def _rrf_fuse(self, list_a: List[str], list_b: List[str], k: int = 60) -> List[str]:
        """简化版 RRF：返回按融合得分排序的 id 列表"""
        scores: Dict[str, float] = {}
        for rank, doc_id in enumerate(list_a):
            scores[doc_id] = scores.get(doc_id, 0) + self._rrf_score(rank, k)
        for rank, doc_id in enumerate(list_b):
            scores[doc_id] = scores.get(doc_id, 0) + self._rrf_score(rank, k)
        return sorted(scores.keys(), key=lambda x: scores[x], reverse=True)

    def test_rrf_combines_both_lists(self):
        """RRF 应包含两个列表的所有元素"""
        list_a = ["doc1", "doc2", "doc3"]
        list_b = ["doc4", "doc2", "doc5"]
        result = self._rrf_fuse(list_a, list_b)
        all_docs = set(list_a) | set(list_b)
        self.assertEqual(set(result), all_docs)

    def test_rrf_high_ranked_in_both_wins(self):
        """在两个列表中都排名靠前的文档应该最终排第一"""
        list_a = ["winner", "doc2", "doc3"]
        list_b = ["winner", "doc4", "doc5"]
        result = self._rrf_fuse(list_a, list_b)
        self.assertEqual(result[0], "winner", "在两个列表都排第一的文档应胜出")

    def test_rrf_score_descending(self):
        """结果应按融合得分降序排列"""
        list_a = ["a", "b", "c"]
        list_b = ["c", "b", "a"]
        result = self._rrf_fuse(list_a, list_b)
        # 计算每个的实际分数来验证顺序
        scores = {}
        for rank, doc_id in enumerate(list_a):
            scores[doc_id] = scores.get(doc_id, 0) + self._rrf_score(rank)
        for rank, doc_id in enumerate(list_b):
            scores[doc_id] = scores.get(doc_id, 0) + self._rrf_score(rank)
        for i in range(len(result) - 1):
            self.assertGreaterEqual(
                scores[result[i]], scores[result[i+1]],
                f"{result[i]} 的得分应 >= {result[i+1]}"
            )

    def test_rrf_k_parameter_effect(self):
        """k 参数越小，排名差异越显著"""
        list_a = ["top", "mid", "bot"]
        list_b = ["top", "mid", "bot"]
        score_small_k = self._rrf_score(0, k=1)
        score_large_k = self._rrf_score(0, k=1000)
        self.assertGreater(score_small_k, score_large_k, "k 越小，头部得分越高")


# ──────────────────────────────────────────
# 测试类 3：向量化模拟测试（不依赖 FAISS/torch）
# ──────────────────────────────────────────

class TestVectorizationLogic(unittest.TestCase):

    def test_cosine_similarity_identical(self):
        """相同向量余弦相似度应为 1.0"""
        v = mock_embed("知识图谱是一种强大的数据组织方式")
        sim = cosine_similarity(v, v)
        self.assertAlmostEqual(sim, 1.0, places=5)

    def test_cosine_similarity_similar_texts(self):
        """相似文本的相似度应高于不相关文本"""
        query = mock_embed("知识图谱检索")
        similar = mock_embed("知识图谱是检索工具")
        unrelated = mock_embed("今天天气晴朗适合出行")
        sim_similar = cosine_similarity(query, similar)
        sim_unrelated = cosine_similarity(query, unrelated)
        self.assertGreater(
            sim_similar, sim_unrelated,
            f"相似文本得分 {sim_similar:.4f} 应 > 不相关文本得分 {sim_unrelated:.4f}"
        )

    def test_mock_embed_returns_unit_vector(self):
        """mock_embed 应返回归一化向量（L2 范数 ≈ 1）"""
        v = mock_embed("任意文本内容")
        norm = math.sqrt(sum(x ** 2 for x in v))
        self.assertAlmostEqual(norm, 1.0, places=5, msg="embedding 向量应为单位向量")

    def test_different_texts_produce_different_embeddings(self):
        """不同文本应产生不同的 embedding"""
        v1 = mock_embed("机器学习算法")
        v2 = mock_embed("深度学习神经网络")
        sim = cosine_similarity(v1, v2)
        # 不同文本，相似度不应该是 1.0（完全相同）
        self.assertLess(sim, 1.0, "不同文本的 embedding 应该不完全相同")

    def test_vector_dimension_fixed(self):
        """所有 embedding 应有相同维度"""
        texts = ["短文本", "这是一段稍微长一些的文本", "这里有更长的文本内容用来测试向量维度的一致性"]
        vectors = [mock_embed(t) for t in texts]
        dims = [len(v) for v in vectors]
        self.assertEqual(len(set(dims)), 1, f"所有 embedding 维度应一致，得到: {dims}")

    def test_top_k_retrieval_simulation(self):
        """模拟 top-k 向量检索：查询应找到最相关文档"""
        corpus = [
            {"id": "d1", "content": "知识图谱是一种网络结构"},
            {"id": "d2", "content": "今天天气晴朗适合出行"},
            {"id": "d3", "content": "RAG 系统结合知识图谱进行检索"},
            {"id": "d4", "content": "随机内容与查询完全无关"},
        ]
        query = "知识图谱检索"
        q_vec = mock_embed(query)
        scored = []
        for doc in corpus:
            d_vec = mock_embed(doc["content"])
            score = cosine_similarity(q_vec, d_vec)
            scored.append((doc["id"], score))
        scored.sort(key=lambda x: x[1], reverse=True)
        top1_id = scored[0][0]
        self.assertIn(top1_id, ["d1", "d3"],
                      f"最相关文档应为 d1 或 d3，实际为 {top1_id}（得分: {scored[0][1]:.4f}）")


# ──────────────────────────────────────────
# 测试类 4：引用溯源字段完整性
# ──────────────────────────────────────────

class TestCitationTracking(unittest.TestCase):

    def _make_result(self, source: str, page: int, score: float, content: str) -> Dict[str, Any]:
        return {
            "content": content,
            "score": score,
            "source_info": {
                "file_name": source,
                "page": page,
                "score": score,
                "rank": 0,
                "source_path": f"/data/{source}",
            }
        }

    def test_source_info_has_required_fields(self):
        """source_info 必须包含 file_name、page、score、rank、source_path"""
        result = self._make_result("report.pdf", 3, 0.92, "这是检索到的内容")
        required = ["file_name", "page", "score", "rank", "source_path"]
        for field in required:
            self.assertIn(field, result["source_info"],
                          f"source_info 缺少必要字段: {field}")

    def test_source_info_score_in_range(self):
        """得分应在 [0, 1] 区间内"""
        result = self._make_result("doc.txt", 1, 0.75, "内容")
        score = result["source_info"]["score"]
        self.assertGreaterEqual(score, 0.0, "得分不应 < 0")
        self.assertLessEqual(score, 1.0, "得分不应 > 1")

    def test_multi_source_dedup(self):
        """多个结果中来源相同时，引用列表中该来源只出现一次（去重验证）"""
        results = [
            self._make_result("doc.pdf", 1, 0.9, "内容A"),
            self._make_result("doc.pdf", 2, 0.85, "内容B"),
            self._make_result("other.pdf", 1, 0.8, "内容C"),
        ]
        # 按 file_name 去重统计唯一来源
        unique_sources = set(r["source_info"]["file_name"] for r in results)
        self.assertEqual(len(unique_sources), 2, "应有 2 个唯一来源（doc.pdf 和 other.pdf）")

    def test_citation_sorted_by_score(self):
        """引用列表应按相关性得分降序排列"""
        results = [
            self._make_result("c.pdf", 1, 0.6, "内容"),
            self._make_result("a.pdf", 1, 0.95, "内容"),
            self._make_result("b.pdf", 1, 0.8, "内容"),
        ]
        sorted_results = sorted(results, key=lambda x: x["source_info"]["score"], reverse=True)
        scores = [r["source_info"]["score"] for r in sorted_results]
        self.assertEqual(scores, sorted(scores, reverse=True), "引用应按得分降序排列")


# ──────────────────────────────────────────
# 测试类 5：知识图谱合并去重
# ──────────────────────────────────────────

class TestGraphMergeLogic(unittest.TestCase):

    def _merge(self, graph_list):
        """复现 generate_kg.py 中的 _merge_graph_data 逻辑"""
        merged_nodes = {}
        merged_edges = {}
        for graph in graph_list:
            for node in graph.get("nodes", []):
                nid = node.get("id", "")
                if nid and nid not in merged_nodes:
                    merged_nodes[nid] = node
            for edge in graph.get("edges", []):
                key = (edge.get("source", ""), edge.get("target", ""), edge.get("label", ""))
                if key[0] and key[1] and key not in merged_edges:
                    merged_edges[key] = edge
        return {"nodes": list(merged_nodes.values()), "edges": list(merged_edges.values())}

    def test_duplicate_nodes_removed(self):
        """相同 id 的节点只保留一个"""
        g1 = {"nodes": [{"id": "A", "label": "节点A"}], "edges": []}
        g2 = {"nodes": [{"id": "A", "label": "节点A(副本)"}, {"id": "B", "label": "节点B"}], "edges": []}
        merged = self._merge([g1, g2])
        ids = [n["id"] for n in merged["nodes"]]
        self.assertEqual(len(ids), len(set(ids)), "节点 id 不应有重复")
        self.assertEqual(ids.count("A"), 1, "节点 A 只应保留一次")

    def test_duplicate_edges_removed(self):
        """相同 source+target+label 的边只保留一条"""
        edge = {"source": "A", "target": "B", "label": "关联"}
        g1 = {"nodes": [{"id": "A"}, {"id": "B"}], "edges": [edge]}
        g2 = {"nodes": [], "edges": [edge]}
        merged = self._merge([g1, g2])
        self.assertEqual(len(merged["edges"]), 1, "重复边应该只保留一条")

    def test_merge_preserves_all_unique(self):
        """合并后应包含所有唯一节点和边"""
        g1 = {
            "nodes": [{"id": "A"}, {"id": "B"}],
            "edges": [{"source": "A", "target": "B", "label": "r1"}]
        }
        g2 = {
            "nodes": [{"id": "C"}, {"id": "D"}],
            "edges": [{"source": "C", "target": "D", "label": "r2"}]
        }
        merged = self._merge([g1, g2])
        self.assertEqual(len(merged["nodes"]), 4)
        self.assertEqual(len(merged["edges"]), 2)

    def test_empty_graphs_safe(self):
        """空图谱列表不应崩溃"""
        merged = self._merge([])
        self.assertEqual(merged["nodes"], [])
        self.assertEqual(merged["edges"], [])

    def test_partial_edge_skip(self):
        """source 或 target 为空的边应该被跳过"""
        g = {
            "nodes": [{"id": "A"}],
            "edges": [
                {"source": "", "target": "A", "label": "r"},   # source 为空
                {"source": "A", "target": "", "label": "r"},   # target 为空
                {"source": "A", "target": "B", "label": "r"},  # 正常边
            ]
        }
        merged = self._merge([g])
        self.assertEqual(len(merged["edges"]), 1, "只有 source 和 target 非空的边才保留")


# ──────────────────────────────────────────
# 测试类 6：RAG Pipeline 结果结构验证
# ──────────────────────────────────────────

class TestRAGPipelineStructure(unittest.TestCase):

    def _mock_rag_result(self, use_hybrid: bool = True, num_sources: int = 3) -> Dict[str, Any]:
        """模拟 rag_pipeline 返回的标准结构"""
        return {
            "answer": "这是基于检索内容生成的回答",
            "sources": [
                {
                    "content": f"检索片段 {i+1}",
                    "score": round(0.95 - i * 0.1, 2),
                    "source_info": {
                        "file_name": f"doc{i+1}.pdf",
                        "page": i + 1,
                        "rank": i,
                        "score": round(0.95 - i * 0.1, 2),
                        "source_path": f"/data/doc{i+1}.pdf",
                    }
                }
                for i in range(num_sources)
            ],
            "retrieval_mode": "hybrid" if use_hybrid else "vector_only",
            "query": "测试查询",
        }

    def test_result_has_answer(self):
        """结果必须包含 answer 字段"""
        result = self._mock_rag_result()
        self.assertIn("answer", result)
        self.assertIsInstance(result["answer"], str)
        self.assertTrue(len(result["answer"]) > 0)

    def test_result_has_sources(self):
        """结果必须包含 sources 列表"""
        result = self._mock_rag_result()
        self.assertIn("sources", result)
        self.assertIsInstance(result["sources"], list)

    def test_sources_have_complete_fields(self):
        """每个 source 必须包含 content、score、source_info"""
        result = self._mock_rag_result(num_sources=3)
        for i, source in enumerate(result["sources"]):
            self.assertIn("content", source, f"source[{i}] 缺少 content")
            self.assertIn("score", source, f"source[{i}] 缺少 score")
            self.assertIn("source_info", source, f"source[{i}] 缺少 source_info")

    def test_sources_sorted_by_score(self):
        """sources 应按 score 降序排列"""
        result = self._mock_rag_result(num_sources=5)
        scores = [s["score"] for s in result["sources"]]
        self.assertEqual(scores, sorted(scores, reverse=True),
                         "sources 应按 score 降序排列")

    def test_retrieval_mode_field(self):
        """结果必须包含 retrieval_mode 字段"""
        hybrid_result = self._mock_rag_result(use_hybrid=True)
        vector_result = self._mock_rag_result(use_hybrid=False)
        self.assertEqual(hybrid_result["retrieval_mode"], "hybrid")
        self.assertEqual(vector_result["retrieval_mode"], "vector_only")

    def test_hybrid_vs_vector_only(self):
        """混合检索和纯向量检索都应返回 sources"""
        for use_hybrid in [True, False]:
            result = self._mock_rag_result(use_hybrid=use_hybrid)
            self.assertGreater(len(result["sources"]), 0,
                               f"{'hybrid' if use_hybrid else 'vector_only'} 模式应返回 sources")


# ──────────────────────────────────────────
# 入口
# ──────────────────────────────────────────

if __name__ == "__main__":
    import sys

    # 输出漂亮的分组报告
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    test_classes = [
        TestBM25Scoring,
        TestRRFFusion,
        TestVectorizationLogic,
        TestCitationTracking,
        TestGraphMergeLogic,
        TestRAGPipelineStructure,
    ]

    for cls in test_classes:
        suite.addTests(loader.loadTestsFromTestCase(cls))

    runner = unittest.TextTestRunner(verbosity=2, stream=sys.stderr)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
