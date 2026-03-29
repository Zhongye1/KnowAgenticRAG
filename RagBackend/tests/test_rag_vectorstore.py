"""
RAG 混合检索 + 向量化 完整流程测试（对齐实际接口）
不依赖 Ollama / MySQL / 真实 FAISS 文件，纯逻辑 + Mock 验证
"""

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(BACKEND_ROOT / "RAG_M" / "src"))


# ────────────────────────────────────────────
# Mock langchain Document langchain
# ────────────────────────────────────────────
class FakeDocument:
    """模拟 langchain Document 对象"""

    def __init__(self, page_content: str, metadata: dict = None):
        self.page_content = page_content
        self.metadata = metadata or {}


# ────────────────────────────────────────────
# 1. BM25
# ────────────────────────────────────────────
class TestBM25Core(unittest.TestCase):
    def setUp(self):
        # eval BM25 langchain
        src_path = BACKEND_ROOT / "RAG_M" / "src" / "rag" / "hybrid_retriever.py"
        source = src_path.read_text(encoding="utf-8")
        # langchain mock
        source = source.replace(
            "from langchain.docstore.document import Document", ""
        ).replace("from langchain_community.vectorstores import FAISS", "")
        ns = {
            "Document": FakeDocument,
            "FAISS": MagicMock,
            "__name__": "hybrid_retriever",
        }
        exec(compile(source, str(src_path), "exec"), ns)
        self.BM25 = ns["BM25"]
        self.HybridRetriever = ns["HybridRetriever"]
        self.reciprocal_rank_fusion = ns["reciprocal_rank_fusion"]

        self.docs = [
            FakeDocument(
                "Python 是一种高级编程语言，广泛用于机器学习", {"source": "doc1.txt"}
            ),
            FakeDocument("机器学习需要大量数据和算法支持", {"source": "doc2.txt"}),
            FakeDocument(
                "深度学习是机器学习的子领域，使用神经网络", {"source": "doc3.txt"}
            ),
            FakeDocument("Java 是企业级应用开发的主流语言", {"source": "doc4.txt"}),
        ]
        self.bm25 = self.BM25(self.docs)

    def test_bm25_instantiation(self):
        """BM25 应能正常初始化"""
        self.assertIsNotNone(self.bm25)
        self.assertIsNotNone(self.bm25.idf)

    def test_bm25_scores_not_all_zero(self):
        """BM25 对相关查询应返回非零得分"""
        scores = self.bm25.get_scores("机器学习")
        self.assertTrue(any(s > 0 for s in scores), "相关查询应有非零得分")

    def test_bm25_relevant_doc_ranks_higher(self):
        """机器学习查询：doc2/doc3 得分应高于 doc4（Java）"""
        scores = self.bm25.get_scores("机器学习")
        self.assertGreater(scores[1], scores[3], "doc2(机器学习) 应高于 doc4(Java)")
        self.assertGreater(scores[2], scores[3], "doc3(深度学习) 应高于 doc4(Java)")

    def test_bm25_retrieve_returns_list(self):
        """retrieve 方法应返回列表"""
        results = self.bm25.retrieve("编程语言", top_k=2)
        self.assertIsInstance(results, list)
        self.assertLessEqual(len(results), 2)

    def test_bm25_retrieve_has_document_and_score(self):
        """retrieve 返回的每项应是 (Document, score) 元组"""
        results = self.bm25.retrieve("机器学习", top_k=3)
        for item in results:
            self.assertEqual(len(item), 2, "每项应是 (doc, score) 二元组")
            doc, score = item
            self.assertTrue(hasattr(doc, "page_content"), "第一项应是 Document")
            self.assertIsInstance(score, float, "第二项应是 float 分数")

    def test_bm25_idf_non_negative(self):
        """IDF 值应全为非负数"""
        for token, idf in self.bm25.idf.items():
            self.assertGreaterEqual(idf, 0, f"IDF({token}) 不应为负")

    def test_bm25_empty_query_no_crash(self):
        """空查询不应崩溃"""
        try:
            results = self.bm25.retrieve("", top_k=3)
            self.assertIsInstance(results, list)
        except Exception as e:
            self.fail(f"空查询不应抛出异常: {e}")

    def test_bm25_top_k_limit(self):
        """top_k 参数应正确限制返回数量"""
        results = self.bm25.retrieve("机器学习", top_k=2)
        self.assertLessEqual(len(results), 2)


# ────────────────────────────────────────────
# 2. RRF
# ────────────────────────────────────────────
class TestRRFFusion(unittest.TestCase):
    def setUp(self):
        src_path = BACKEND_ROOT / "RAG_M" / "src" / "rag" / "hybrid_retriever.py"
        source = (
            src_path.read_text(encoding="utf-8")
            .replace("from langchain.docstore.document import Document", "")
            .replace("from langchain_community.vectorstores import FAISS", "")
        )
        ns = {"Document": FakeDocument, "FAISS": MagicMock}
        exec(compile(source, str(src_path), "exec"), ns)
        self.rrf = ns["reciprocal_rank_fusion"]

    def test_rrf_dedup_and_boost(self):
        """出现在两路的文档分数应叠加且排名更高"""
        doc_a = FakeDocument("文档A内容", {"source": "a.txt"})
        doc_b = FakeDocument("文档B内容", {"source": "b.txt"})
        doc_c = FakeDocument("文档C内容", {"source": "c.txt"})
        list1 = [(doc_a, 0.9), (doc_b, 0.7)]
        list2 = [(doc_a, 0.8), (doc_c, 0.6)]
        result = self.rrf([list1, list2])
        top_doc, top_score = result[0]
        self.assertEqual(top_doc.page_content, "文档A内容", "两路都出现的文档应排第一")

    def test_rrf_result_is_sorted(self):
        """RRF 融合结果应按分降序排列"""
        doc_a = FakeDocument("AAAA")
        doc_b = FakeDocument("BBBB")
        doc_c = FakeDocument("CCCC")
        result = self.rrf([[(doc_a, 1.0), (doc_b, 0.8)], [(doc_b, 0.9), (doc_c, 0.5)]])
        scores = [s for _, s in result]
        self.assertEqual(scores, sorted(scores, reverse=True), "结果应降序")

    def test_rrf_score_formula(self):
        """验证 RRF 公式：rank=1 得分 > rank=2 得分"""
        k = 60
        self.assertGreater(1.0 / (k + 1), 1.0 / (k + 2))


# ────────────────────────────────────────────
# 3. HybridRetriever Mock FAISS
# ────────────────────────────────────────────
class TestHybridRetrieverIntegration(unittest.TestCase):
    def setUp(self):
        src_path = BACKEND_ROOT / "RAG_M" / "src" / "rag" / "hybrid_retriever.py"
        source = (
            src_path.read_text(encoding="utf-8")
            .replace("from langchain.docstore.document import Document", "")
            .replace("from langchain_community.vectorstores import FAISS", "")
        )
        ns = {"Document": FakeDocument, "FAISS": MagicMock}
        exec(compile(source, str(src_path), "exec"), ns)
        self.HybridRetriever = ns["HybridRetriever"]

        self.docs = [
            FakeDocument("知识图谱表示实体关系", {"source": "kg.pdf", "page": 1}),
            FakeDocument("RAG 结合检索与生成", {"source": "rag.pdf", "page": 2}),
            FakeDocument("向量数据库存储语义嵌入", {"source": "vector.txt", "page": 1}),
            FakeDocument("FAISS 是高效向量检索库", {"source": "faiss.txt", "page": 1}),
            FakeDocument("BM25 是经典信息检索算法", {"source": "bm25.txt", "page": 1}),
        ]

        # Mock FAISS vectorstore
        self.mock_vs = MagicMock()
        self.mock_vs.similarity_search_with_score.return_value = [
            (self.docs[1], 0.92),
            (self.docs[0], 0.85),
            (self.docs[2], 0.72),
        ]

        self.retriever = self.HybridRetriever(
            documents=self.docs,
            vectorstore=self.mock_vs,
            bm25_top_k=5,
            vector_top_k=5,
            final_top_k=3,
        )

    def test_retrieve_returns_documents(self):
        """retrieve() 应返回 Document 列表"""
        results = self.retriever.retrieve("RAG 检索")
        self.assertIsInstance(results, list)
        self.assertGreater(len(results), 0)
        for doc in results:
            self.assertTrue(hasattr(doc, "page_content"))

    def test_retrieve_with_scores_has_source_info(self):
        """retrieve_with_scores() 每项应包含 source_info 字段"""
        results = self.retriever.retrieve_with_scores("向量检索")
        self.assertGreater(len(results), 0)
        for r in results:
            self.assertIn("source_info", r, "缺少 source_info")
            info = r["source_info"]
            self.assertIn("file_name", info, "source_info 缺少 file_name")
            self.assertIn("rank", info, "source_info 缺少 rank")
            self.assertIn("rrf_score", info, "source_info 缺少 rrf_score")

    def test_retrieve_with_scores_rank_starts_at_1(self):
        """引用溯源的 rank 应从 1 开始"""
        results = self.retriever.retrieve_with_scores("知识图谱")
        if results:
            self.assertEqual(results[0]["source_info"]["rank"], 1)

    def test_final_top_k_respected(self):
        """final_top_k 应限制最终返回数量"""
        results = self.retriever.retrieve("检索")
        self.assertLessEqual(len(results), 3)

    def test_vectorstore_called(self):
        """verify FAISS similarity_search_with_score 被实际调用"""
        self.retriever.retrieve("测试")
        self.mock_vs.similarity_search_with_score.assert_called()

    def test_content_preview_in_results(self):
        """retrieve_with_scores 应包含 content_preview 字段"""
        results = self.retriever.retrieve_with_scores("检索")
        for r in results:
            self.assertIn("content_preview", r)


# ────────────────────────────────────────────
# 4. vector_store.py
# ────────────────────────────────────────────
class TestVectorStoreStructure(unittest.TestCase):
    def setUp(self):
        self.vs_path = (
            BACKEND_ROOT / "RAG_M" / "src" / "vectorstore" / "vector_store.py"
        )

    def test_file_exists(self):
        self.assertTrue(self.vs_path.exists(), "vector_store.py 应存在")

    def test_syntax_valid(self):
        import ast

        try:
            ast.parse(self.vs_path.read_text(encoding="utf-8"))
        except SyntaxError as e:
            self.fail(f"语法错误: {e}")

    def test_has_vectorstore_class_or_functions(self):
        """应有 VectorStore 相关类或函数"""
        import ast

        tree = ast.parse(self.vs_path.read_text(encoding="utf-8"))
        names = {
            n.name
            for n in ast.walk(tree)
            if isinstance(n, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
        }
        # initialize_vectorstore, create_vectorstore, load_vectorstore
        has_create = any(
            "vectorstore" in n.lower() or "vector" in n.lower() for n in names
        )
        self.assertTrue(has_create, f"应有向量存储相关方法/类，实际：{names}")

    def test_has_create_vectorstore(self):
        """应有 create_vectorstore 方法"""
        import ast

        tree = ast.parse(self.vs_path.read_text(encoding="utf-8"))
        names = {
            n.name
            for n in ast.walk(tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        self.assertIn(
            "create_vectorstore", names, f"应有 create_vectorstore 方法，实际：{names}"
        )

    def test_has_load_vectorstore(self):
        """应有 load_vectorstore 方法"""
        import ast

        tree = ast.parse(self.vs_path.read_text(encoding="utf-8"))
        names = {
            n.name
            for n in ast.walk(tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        self.assertIn(
            "load_vectorstore", names, f"应有 load_vectorstore 方法，实际：{names}"
        )


# ────────────────────────────────────────────
# 5. RAG Pipeline v2
# ────────────────────────────────────────────
class TestRAGPipelineStructure(unittest.TestCase):
    def setUp(self):
        self.pipeline_path = BACKEND_ROOT / "RAG_M" / "src" / "rag" / "rag_pipeline.py"

    def test_file_exists(self):
        self.assertTrue(self.pipeline_path.exists())

    def test_syntax_valid(self):
        import ast

        try:
            ast.parse(self.pipeline_path.read_text(encoding="utf-8"))
        except SyntaxError as e:
            self.fail(f"rag_pipeline.py 语法错误: {e}")

    def test_has_stream_query_method(self):
        """pipeline 应有 stream_query 流式方法"""
        import ast

        tree = ast.parse(self.pipeline_path.read_text(encoding="utf-8"))
        methods = {
            n.name
            for n in ast.walk(tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        self.assertIn(
            "stream_query", methods, f"pipeline 应有 stream_query，实际方法：{methods}"
        )

    def test_has_process_query_method(self):
        """pipeline 应有 process_query 同步方法"""
        import ast

        tree = ast.parse(self.pipeline_path.read_text(encoding="utf-8"))
        methods = {
            n.name
            for n in ast.walk(tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        self.assertIn(
            "process_query",
            methods,
            f"pipeline 应有 process_query，实际方法：{methods}",
        )

    def test_imports_hybrid_retriever(self):
        """rag_pipeline.py 应导入 HybridRetriever"""
        content = self.pipeline_path.read_text(encoding="utf-8")
        self.assertIn("HybridRetriever", content, "应导入 HybridRetriever")

    def test_citation_in_pipeline(self):
        """pipeline 应包含 source_info 引用溯源逻辑"""
        content = self.pipeline_path.read_text(encoding="utf-8")
        self.assertIn("source_info", content, "应有 source_info 引用溯源字段")

    def test_rag_app_sync_endpoint(self):
        """RAG_app.py 应包含 /RAG_query_sync 接口"""
        app_path = BACKEND_ROOT / "RAG_M" / "RAG_app.py"
        content = app_path.read_text(encoding="utf-8")
        self.assertIn("RAG_query_sync", content, "RAG_app 应有 RAG_query_sync 接口")


# ────────────────────────────────────────────
# 6. Knowledge graph
# ────────────────────────────────────────────
class TestKnowledgeGraphMerge(unittest.TestCase):
    def _load_merge_func(self):
        import ast

        src_path = BACKEND_ROOT / "knowledge_graph" / "generate_kg.py"
        source = src_path.read_text(encoding="utf-8")
        tree = ast.parse(source)
        lines = source.split("\n")
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == "_merge_graph_data":
                func_code = "\n".join(lines[node.lineno - 1 : node.end_lineno])
                ns = {}
                exec(f"from typing import List\n{func_code}", ns)
                return ns["_merge_graph_data"]
        return None

    def test_merge_function_exists(self):
        fn = self._load_merge_func()
        self.assertIsNotNone(fn, "_merge_graph_data 函数应存在")

    def test_merge_node_dedup(self):
        fn = self._load_merge_func()
        if not fn:
            self.skipTest("无法加载")
        g1 = {"nodes": [{"id": "A"}, {"id": "B"}], "edges": []}
        g2 = {"nodes": [{"id": "A"}, {"id": "C"}], "edges": []}
        result = fn([g1, g2])
        ids = [n["id"] for n in result["nodes"]]
        self.assertEqual(len(ids), len(set(ids)), "节点不应重复")
        self.assertEqual(set(ids), {"A", "B", "C"})

    def test_merge_edge_dedup(self):
        fn = self._load_merge_func()
        if not fn:
            self.skipTest("无法加载")
        edge = {"source": "A", "target": "B", "label": "关联"}
        g1 = {"nodes": [{"id": "A"}, {"id": "B"}], "edges": [edge]}
        g2 = {"nodes": [{"id": "A"}, {"id": "B"}], "edges": [edge]}
        result = fn([g1, g2])
        self.assertEqual(len(result["edges"]), 1, "重复边只保留 1 条")

    def test_merge_empty_input(self):
        fn = self._load_merge_func()
        if not fn:
            self.skipTest("无法加载")
        result = fn([])
        self.assertEqual(result["nodes"], [])
        self.assertEqual(result["edges"], [])

    def test_new_kg_api_endpoints_registered(self):
        """generate_kg.py 应注册新的三个 API 端点"""
        content = (BACKEND_ROOT / "knowledge_graph" / "generate_kg.py").read_text(
            encoding="utf-8"
        )
        self.assertIn("get-kb-merged-graph", content)
        self.assertIn("search-nodes", content)
        self.assertIn("graph-stats", content)


# ────────────────────────────────────────────
# ────────────────────────────────────────────
if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    for cls in [
        TestBM25Core,
        TestRRFFusion,
        TestHybridRetrieverIntegration,
        TestVectorStoreStructure,
        TestRAGPipelineStructure,
        TestKnowledgeGraphMerge,
    ]:
        suite.addTests(loader.loadTestsFromTestCase(cls))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
