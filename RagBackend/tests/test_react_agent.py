"""
test_react_agent.py — ReAct Agent 单元测试
不依赖 Ollama 真实服务，使用 Mock 验证

测试范围：
  1. react_agent.py 语法合法性
  2. ReActRAGAgent 类结构（有 query / stream_query 方法）
  3. RAG 检索工具构建（build_rag_search_tool）
  4. 工具返回格式正确性
  5. RAG_app.py 新增接口注册正确性
"""

import sys
import os
import ast
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))
sys.path.insert(0, str(BACKEND_ROOT / "RAG_M" / "src"))
sys.path.insert(0, str(BACKEND_ROOT / "RAG_M"))


class FakeDocument:
    """模拟 langchain Document"""
    def __init__(self, page_content: str, metadata: dict = None):
        self.page_content = page_content
        self.metadata = metadata or {}


# ─────────────────────────────────────────────────────
# Test 1: react_agent.py 语法合法性
# ─────────────────────────────────────────────────────
class TestReactAgentSyntax(unittest.TestCase):

    def setUp(self):
        self.agent_path = BACKEND_ROOT / "RAG_M" / "src" / "agent" / "react_agent.py"

    def test_file_exists(self):
        self.assertTrue(self.agent_path.exists(), "react_agent.py 应存在")

    def test_syntax_valid(self):
        """react_agent.py 语法必须合法"""
        try:
            ast.parse(self.agent_path.read_text(encoding="utf-8"))
        except SyntaxError as e:
            self.fail(f"react_agent.py 语法错误: {e}")

    def test_has_react_rag_agent_class(self):
        """应有 ReActRAGAgent 类"""
        tree = ast.parse(self.agent_path.read_text(encoding="utf-8"))
        class_names = {n.name for n in ast.walk(tree) if isinstance(n, ast.ClassDef)}
        self.assertIn("ReActRAGAgent", class_names, "应有 ReActRAGAgent 类")

    def test_has_query_method(self):
        """ReActRAGAgent 应有 query 方法"""
        content = self.agent_path.read_text(encoding="utf-8")
        self.assertIn("def query(", content, "应有 query 方法")

    def test_has_stream_query_method(self):
        """ReActRAGAgent 应有 stream_query 方法"""
        content = self.agent_path.read_text(encoding="utf-8")
        self.assertIn("def stream_query(", content, "应有 stream_query 方法")

    def test_has_build_rag_search_tool(self):
        """应有 build_rag_search_tool 工厂函数"""
        content = self.agent_path.read_text(encoding="utf-8")
        self.assertIn("def build_rag_search_tool(", content, "应有 build_rag_search_tool")

    def test_uses_ollama_llm(self):
        """应使用 OllamaLLM"""
        content = self.agent_path.read_text(encoding="utf-8")
        self.assertIn("OllamaLLM", content, "应使用 OllamaLLM")

    def test_uses_langchain_tool(self):
        """应使用 LangChain Tool"""
        content = self.agent_path.read_text(encoding="utf-8")
        self.assertIn("Tool", content, "应使用 LangChain Tool")

    def test_react_prompt_present(self):
        """应包含 ReAct Prompt 模板"""
        content = self.agent_path.read_text(encoding="utf-8")
        self.assertIn("Thought:", content, "Prompt 应包含 Thought:")
        self.assertIn("Action:", content, "Prompt 应包含 Action:")
        self.assertIn("Final Answer:", content, "Prompt 应包含 Final Answer:")


# ─────────────────────────────────────────────────────
# Test 2: RAG_app.py 新接口注册
# ─────────────────────────────────────────────────────
class TestRAGAppNewEndpoints(unittest.TestCase):

    def setUp(self):
        self.app_path = BACKEND_ROOT / "RAG_M" / "RAG_app.py"
        self.content = self.app_path.read_text(encoding="utf-8")

    def test_agent_query_endpoint_exists(self):
        """RAG_app.py 应包含 /agent_query 接口"""
        self.assertIn("agent_query", self.content, "应有 agent_query 接口")

    def test_agent_query_sync_endpoint_exists(self):
        """RAG_app.py 应包含 /agent_query_sync 接口"""
        self.assertIn("agent_query_sync", self.content, "应有 agent_query_sync 接口")

    def test_react_agent_imported(self):
        """RAG_app.py 应导入 ReActRAGAgent"""
        self.assertIn("ReActRAGAgent", self.content, "应导入 ReActRAGAgent")

    def test_health_includes_react_agent_feature(self):
        """health 接口应包含 react_agent 特性标记"""
        self.assertIn("react_agent", self.content, "health 应包含 react_agent 特性")

    def test_syntax_still_valid(self):
        """添加 Agent 接口后 RAG_app.py 语法仍然合法"""
        try:
            ast.parse(self.content)
        except SyntaxError as e:
            self.fail(f"RAG_app.py 语法错误: {e}")


# ─────────────────────────────────────────────────────
# Test 3: 检索工具逻辑测试（Mock FAISS）
# ─────────────────────────────────────────────────────
class TestRAGSearchTool(unittest.TestCase):

    def setUp(self):
        """动态加载 build_rag_search_tool，替换 langchain 依赖为 Mock"""
        agent_path = BACKEND_ROOT / "RAG_M" / "src" / "agent" / "react_agent.py"
        source = agent_path.read_text(encoding="utf-8")

        # 替换外部依赖为 Mock
        source = source.replace(
            "from langchain_ollama.llms import OllamaLLM", ""
        ).replace(
            "from langchain.tools import Tool", ""
        ).replace(
            "from langchain.agents import AgentExecutor, create_react_agent", ""
        ).replace(
            "from langchain.prompts import PromptTemplate", ""
        ).replace(
            "from langchain.docstore.document import Document", ""
        ).replace(
            "from langchain_community.vectorstores import FAISS", ""
        ).replace(
            "from src.rag.hybrid_retriever import HybridRetriever", ""
        ).replace(
            "from models.model_config import get_model_config", ""
        )

        class FakeTool:
            def __init__(self, name, func, description):
                self.name = name
                self.func = func
                self.description = description

        class FakeTemplate:
            def __init__(self, template, input_variables):
                pass

        ns = {
            "OllamaLLM": MagicMock,
            "Tool": FakeTool,
            "AgentExecutor": MagicMock,
            "create_react_agent": MagicMock,
            "PromptTemplate": FakeTemplate,
            "Document": FakeDocument,
            "FAISS": MagicMock,
            "HybridRetriever": MagicMock,
            "get_model_config": MagicMock,
            "__name__": "react_agent",
            "__file__": str(agent_path),  # 注入 __file__ 供路径计算使用
        }

        exec(compile(source, str(agent_path), "exec"), ns)
        self.build_tool = ns["build_rag_search_tool"]
        self._extract_filename = ns["_extract_filename"]

        # 构建 Mock FAISS
        self.mock_vs = MagicMock()
        self.docs = [
            FakeDocument("Python 机器学习入门", {"source": "ml.pdf", "page": 1}),
            FakeDocument("深度学习神经网络", {"source": "dl.txt", "page": 2}),
        ]
        self.mock_vs.similarity_search_with_score.return_value = [
            (self.docs[0], 0.92),
            (self.docs[1], 0.85),
        ]

    def test_tool_creation(self):
        """build_rag_search_tool 应能正常创建 Tool"""
        tool = self.build_tool(vectorstore=self.mock_vs)
        self.assertIsNotNone(tool)
        self.assertEqual(tool.name, "search_knowledge_base")

    def test_tool_search_returns_string(self):
        """工具搜索应返回字符串格式的文档内容"""
        tool = self.build_tool(vectorstore=self.mock_vs)
        result = tool.func("机器学习")
        self.assertIsInstance(result, str)
        self.assertTrue(len(result) > 0)

    def test_tool_search_contains_source_info(self):
        """工具返回结果应包含来源标注"""
        tool = self.build_tool(vectorstore=self.mock_vs)
        result = tool.func("机器学习")
        self.assertIn("来源", result, "工具返回结果应包含来源信息")

    def test_extract_filename_from_source_key(self):
        """_extract_filename 应从 source 键提取文件名"""
        meta = {"source": "/path/to/document.pdf"}
        result = self._extract_filename(meta)
        self.assertEqual(result, "document.pdf")

    def test_extract_filename_from_file_path_key(self):
        """_extract_filename 应从 file_path 键提取文件名"""
        meta = {"file_path": "/another/path/report.docx"}
        result = self._extract_filename(meta)
        self.assertEqual(result, "report.docx")

    def test_extract_filename_empty_meta(self):
        """空元数据应返回 '未知来源'"""
        result = self._extract_filename({})
        self.assertEqual(result, "未知来源")


# ─────────────────────────────────────────────────────
# Test 4: __init__.py 文件存在性
# ─────────────────────────────────────────────────────
class TestAgentPackageStructure(unittest.TestCase):

    def test_agent_init_exists(self):
        """agent/__init__.py 应存在"""
        init_path = BACKEND_ROOT / "RAG_M" / "src" / "agent" / "__init__.py"
        self.assertTrue(init_path.exists(), "agent/__init__.py 应存在")

    def test_agent_react_file_exists(self):
        """agent/react_agent.py 应存在"""
        agent_path = BACKEND_ROOT / "RAG_M" / "src" / "agent" / "react_agent.py"
        self.assertTrue(agent_path.exists(), "react_agent.py 应存在")


# ─────────────────────────────────────────────────────
# 主程序
# ─────────────────────────────────────────────────────
if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    for cls in [
        TestReactAgentSyntax,
        TestRAGAppNewEndpoints,
        TestRAGSearchTool,
        TestAgentPackageStructure,
    ]:
        suite.addTests(loader.loadTestsFromTestCase(cls))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
