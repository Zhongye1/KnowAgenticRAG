"""
react_agent.py — LangChain ReAct Agent 核心模块
================================================
架构：
  用户问题
     ↓
  ReAct Agent（LangGraph 驱动）
     ↓ 自主决策是否需要检索
  RAG Search Tool（BM25 + FAISS 混合检索）
     ↓
  OllamaLLM 生成最终回答

特点：
  - 基于标准 LangGraph ReAct 循环，兼容 Ollama 本地模型
  - RAG 检索被封装为 LangChain Tool，Agent 自主决定何时调用
  - 支持流式和非流式两种输出模式
  - 完全基于现有 RAGPipeline + HybridRetriever，无重复代码
"""

from __future__ import annotations

import os
import sys
import json
from typing import List, Dict, Any, Optional, Generator
from pathlib import Path

_AGENT_DIR = Path(__file__).resolve().parent
_SRC_DIR = _AGENT_DIR.parent
_RAG_M_DIR = _SRC_DIR.parent
_BACKEND_DIR = _RAG_M_DIR.parent

for _p in [str(_BACKEND_DIR), str(_SRC_DIR), str(_RAG_M_DIR)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from langchain_ollama.llms import OllamaLLM
from langchain.tools import Tool
from langchain.agents import AgentExecutor, create_react_agent
from langchain.prompts import PromptTemplate
from langchain.docstore.document import Document
from langchain_community.vectorstores import FAISS

from models.model_config import get_model_config
from src.rag.hybrid_retriever import HybridRetriever

try:
    from agent_tools.web_search_tool import build_web_search_tool
    _WEB_SEARCH_AVAILABLE = True
except ImportError:
    _WEB_SEARCH_AVAILABLE = False


# ─────────────────────────────────────────────
# ReAct Agent Prompt
# ─────────────────────────────────────────────

_REACT_PROMPT_TEMPLATE = """你是一个智能知识库助手，能够通过工具检索知识库中的相关信息或搜索互联网来回答问题。

你可以使用以下工具：
{tools}

使用以下格式推理：
Question: 用户提出的问题
Thought: 思考是否需要使用工具，以及使用哪个工具
Action: 要使用的工具名称，必须是 [{tool_names}] 之一
Action Input: 传给工具的输入
Observation: 工具返回的结果
... (可以重复 Thought/Action/Action Input/Observation 多次)
Thought: 现在我知道了最终答案
Final Answer: 给用户的最终回答（中文）

规则：
1. 优先使用 search_knowledge_base 检索本地知识库后再回答
2. 如果本地知识库没有相关内容，使用 web_search 搜索互联网获取最新信息
3. 如果工具返回了相关文档，请在回答中引用来源
4. 如果问题是简单的日常对话（如"你好"、"谢谢"），可以直接回答，无需检索
5. 回答要完整、清晰，默认使用中文

开始！

Question: {input}
Thought:{agent_scratchpad}"""

REACT_PROMPT = PromptTemplate(
    template=_REACT_PROMPT_TEMPLATE,
    input_variables=["tools", "tool_names", "input", "agent_scratchpad"],
)


# ─────────────────────────────────────────────
# RAG
# ─────────────────────────────────────────────

def build_rag_search_tool(
    vectorstore: FAISS,
    documents: Optional[List[Document]] = None,
    top_k: int = 4,
) -> Tool:
    """
    将 RAG 混合检索封装为 LangChain Tool。

    Args:
        vectorstore: 已加载的 FAISS 向量存储
        documents: 原始文档列表（用于 BM25），可为空（降级为纯向量检索）
        top_k: 返回的最大文档块数
    """
    # Initialize
    if documents:
        retriever = HybridRetriever(
            documents=documents,
            vectorstore=vectorstore,
            bm25_top_k=top_k,
            vector_top_k=top_k,
            final_top_k=top_k,
        )
        retriever_type = "混合检索(BM25+向量+RRF)"
    else:
        retriever = None
        retriever_type = "纯向量检索"

    print(f"[ReActAgent] 检索工具初始化完成，模式: {retriever_type}")

    def search_knowledge_base(query: str) -> str:
        """执行知识库检索，返回格式化的文档片段"""
        try:
            if retriever:
                # Hybrid retrieval
                results = retriever.retrieve_with_scores(query)
            else:
                # Vector retrieval
                raw = vectorstore.similarity_search_with_score(query, k=top_k)
                results = []
                for rank, (doc, score) in enumerate(raw, start=1):
                    meta = doc.metadata or {}
                    file_name = _extract_filename(meta)
                    results.append({
                        "document": doc,
                        "source_info": {
                            "rank": rank,
                            "rrf_score": float(score),
                            "file_name": file_name,
                            "page": meta.get("page"),
                            "source_path": meta.get("source", ""),
                        },
                        "content_preview": doc.page_content[:200],
                    })

            if not results:
                return "知识库中未找到与该问题相关的内容。"

            # LLM
            parts = []
            for item in results:
                src = item["source_info"]
                file_name = src.get("file_name", "未知来源")
                page = src.get("page")
                page_str = f"第 {page} 页" if page is not None else ""
                header = f"【来源 {src['rank']}：{file_name}{' ' + page_str if page_str else ''}（相关度分数: {src.get('rrf_score', 0):.4f}）】"
                content = item["document"].page_content.strip()
                parts.append(f"{header}\n{content}")

            return "\n\n---\n\n".join(parts)

        except Exception as e:
            return f"检索时发生错误: {str(e)}"

    return Tool(
        name="search_knowledge_base",
        func=search_knowledge_base,
        description=(
            "在本地知识库中搜索与问题相关的文档内容。"
            "当用户问到任何需要查阅文档、资料、数据的问题时，应该优先使用此工具。"
            "输入应为用户的问题或关键词，工具将返回相关文档片段。"
        ),
    )


# ─────────────────────────────────────────────
# ReAct Agent
# ─────────────────────────────────────────────

class ReActRAGAgent:
    """
    基于 LangChain ReAct 模式的 RAG 智能体。

    与普通 RAGPipeline 的区别：
      - RAGPipeline: 每次查询都强制执行检索
      - ReActRAGAgent: LLM 自主推理是否需要检索（更灵活，适合对话场景）
    """

    def __init__(
        self,
        vectorstore: FAISS,
        documents: Optional[List[Document]] = None,
        llm_model: Optional[str] = None,
        top_k: int = 4,
        max_iterations: int = 5,
        verbose: bool = False,
        enable_web_search: bool = True,
    ):
        """
        Args:
            vectorstore: 已加载的 FAISS 向量存储
            documents: 原始文档列表（用于 BM25 混合检索）
            llm_model: Ollama 模型名，默认从 ModelConfig 读取
            top_k: 每次检索返回的文档块数
            max_iterations: Agent 最大推理轮次（防止死循环）
            verbose: 是否打印推理过程
            enable_web_search: 是否注册联网搜索工具（默认开启）
        """
        if llm_model is None:
            config = get_model_config()
            llm_model = config.llm_model
            print(f"[ReActAgent] 使用 LLM 模型: {llm_model}")

        # Initialize LLM
        self.llm = OllamaLLM(
            model=llm_model,
            temperature=0.1,
            stop=["Observation:"],  # ReAct
        )

        self.tools = [
            build_rag_search_tool(
                vectorstore=vectorstore,
                documents=documents,
                top_k=top_k,
            )
        ]

        if enable_web_search and _WEB_SEARCH_AVAILABLE:
            self.tools.append(build_web_search_tool(max_results=5))
            print("[ReActAgent] 联网搜索工具已注册")
        elif enable_web_search and not _WEB_SEARCH_AVAILABLE:
            print("[ReActAgent] 联网搜索工具不可用（导入失败），跳过注册")

        # Agent
        self.agent = create_react_agent(
            llm=self.llm,
            tools=self.tools,
            prompt=REACT_PROMPT,
        )

        # AgentExecutor
        self.agent_executor = AgentExecutor(
            agent=self.agent,
            tools=self.tools,
            verbose=verbose,
            max_iterations=max_iterations,
            handle_parsing_errors=True,  # LLM
            return_intermediate_steps=True,
        )

        self._llm_model = llm_model
        self._top_k = top_k

    def query(self, question: str) -> Dict[str, Any]:
        """
        非流式查询。

        Returns:
            {
                "answer": str,
                "steps": list,           # Action + Observation
                "sources": list,         # steps
                "mode": "react_agent"
            }
        """
        try:
            result = self.agent_executor.invoke({"input": question})
            answer = result.get("output", "无法生成回答")

            steps = []
            sources_set = set()
            for action, observation in result.get("intermediate_steps", []):
                step = {
                    "tool": action.tool,
                    "tool_input": action.tool_input,
                    "observation_preview": str(observation)[:300],
                }
                steps.append(step)

                # observation
                if "【来源" in str(observation):
                    import re
                    matches = re.findall(r'【来源\s*\d+：([^】]+)】', str(observation))
                    for m in matches:
                        sources_set.add(m.strip())

            return {
                "answer": answer,
                "steps": steps,
                "sources": list(sources_set),
                "mode": "react_agent",
                "model": self._llm_model,
            }

        except Exception as e:
            import traceback
            return {
                "answer": f"Agent 执行失败: {str(e)}",
                "steps": [],
                "sources": [],
                "mode": "react_agent",
                "error": traceback.format_exc(),
            }

    def stream_query(self, question: str) -> Generator[str, None, None]:
        """
        流式查询（SSE 格式）。

        yield 格式：
          data: STEP: <json>    — 每个推理步骤
          data: <text>          — 回答文本片段
          data: COMPLETE        — 结束标志
        """
        yield f"data: 🤖 ReAct Agent 开始推理...\n\n"
        yield f"data: 📝 问题: {question}\n\n"

        try:
            result = self.agent_executor.invoke({"input": question})
            answer = result.get("output", "无法生成回答")

            steps = result.get("intermediate_steps", [])
            if steps:
                yield f"data: 📚 Agent 执行了 {len(steps)} 个推理步骤:\n\n"
                for i, (action, observation) in enumerate(steps, 1):
                    step_info = {
                        "step": i,
                        "action": action.tool,
                        "input": action.tool_input,
                    }
                    yield f"data: STEP: {json.dumps(step_info, ensure_ascii=False)}\n\n"
            else:
                yield "data: 💭 Agent 直接回答（无需检索）\n\n"

            yield "data: 💬 正在生成回答...\n\n"

            for paragraph in answer.split('\n'):
                if paragraph.strip():
                    yield f"data: {paragraph}\n\n"

            yield "data: COMPLETE\n\n"

        except Exception as e:
            import traceback
            yield f"data: ERROR: Agent 执行失败: {str(e)}\n\n"
            yield "data: COMPLETE\n\n"


# ─────────────────────────────────────────────
# ─────────────────────────────────────────────

def _extract_filename(meta: Dict[str, Any]) -> str:
    """从文档元数据中提取文件名"""
    import os as _os
    for key in ("source", "file_path", "path", "filename", "file_name"):
        val = meta.get(key, "")
        if val:
            return _os.path.basename(str(val))
    return "未知来源"
