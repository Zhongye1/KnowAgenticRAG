"""
rag_pipeline.py
RAG 核心流水线 v2
新增：
  - 混合检索（HybridRetriever：BM25 + 向量 + RRF 融合）
  - 引用溯源（返回 sources 列表，含文件名、页码、得分）
  - 流式回答生成（generator 模式，配合 SSE 使用）
"""

from __future__ import annotations

import os
import sys
from typing import List, Dict, Any, Generator, Optional

from langchain_ollama.llms import OllamaLLM
from langchain_community.vectorstores import FAISS
from langchain.docstore.document import Document
from langchain.prompts import PromptTemplate

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from models.model_config import get_model_config
from src.rag.hybrid_retriever import HybridRetriever


# ── 系统 Prompt 模板
_PROMPT_TEMPLATE = """你是知识管理助手，专门回答基于文档的问题。

规则：
1. 优先基于"参考文档"中的内容回答
2. 如果文档信息不足，在回答末尾注明"（以上部分内容基于通用知识补充）"
3. 回答时自然引用来源，例如："根据《文件名》中的内容，..."
4. 用户未指定语言时默认使用中文
5. 回答要完整、清晰，如涉及代码/公式/表格则给出对应示例
6. 与上下文完全无关的问题，说明无关并给出通用参考信息

参考文档（已按相关度排序）：
{context}

用户问题：{question}

回答："""

PROMPT = PromptTemplate(
    template=_PROMPT_TEMPLATE,
    input_variables=["context", "question"],
)


def _format_context(docs_with_sources: List[Dict[str, Any]]) -> str:
    """将检索结果格式化为 LLM 可用的上下文字符串，附带来源标注"""
    parts = []
    for item in docs_with_sources:
        src = item["source_info"]
        file_name = src.get("file_name", "未知来源")
        page = src.get("page")
        page_str = f"第 {page} 页" if page is not None else ""
        header = f"【来源 {src['rank']}：{file_name}{' ' + page_str if page_str else ''}】"
        content = item["document"].page_content.strip()
        parts.append(f"{header}\n{content}")
    return "\n\n---\n\n".join(parts)


class RAGPipeline:
    """
    RAG 流水线 v2
    支持：混合检索、引用溯源、流式/非流式两种输出模式
    """

    def __init__(
        self,
        llm_model: Optional[str] = None,
        vectorstore: Optional[FAISS] = None,
        documents: Optional[List[Document]] = None,
        use_hybrid: bool = True,
    ):
        # 获取模型配置
        if llm_model is None:
            model_config = get_model_config()
            llm_model = model_config.llm_model
            print(f"[RAGPipeline] 使用默认 LLM 模型: {llm_model}")

        self.llm = OllamaLLM(model=llm_model)
        self.vectorstore = vectorstore
        self.use_hybrid = use_hybrid

        # 构建混合检索器（需要 documents 列表用于 BM25）
        self._hybrid_retriever: Optional[HybridRetriever] = None
        if use_hybrid and vectorstore is not None and documents:
            print(f"[RAGPipeline] 初始化混合检索器，文档块数量: {len(documents)}")
            self._hybrid_retriever = HybridRetriever(
                documents=documents,
                vectorstore=vectorstore,
            )
        elif use_hybrid and vectorstore is not None:
            # 没有传 documents，降级为纯向量检索
            print("[RAGPipeline] 未传入 documents，混合检索降级为纯向量检索")
            self.use_hybrid = False

    # ── 检索
    def _retrieve(self, query: str) -> List[Dict[str, Any]]:
        if self.use_hybrid and self._hybrid_retriever:
            return self._hybrid_retriever.retrieve_with_scores(query)
        # 降级：纯向量检索
        raw = self.vectorstore.similarity_search_with_score(query, k=4)
        results = []
        for rank, (doc, score) in enumerate(raw, start=1):
            meta = doc.metadata or {}
            results.append({
                "document": doc,
                "source_info": {
                    "rank": rank,
                    "rrf_score": float(score),
                    "file_name": _extract_filename_from_meta(meta),
                    "page": meta.get("page"),
                    "chunk_index": meta.get("chunk_index"),
                    "source_path": meta.get("source", ""),
                },
                "content_preview": doc.page_content[:200],
            })
        return results

    # ── 非流式查询（一次性返回）
    def process_query(self, query: str) -> Dict[str, Any]:
        """
        处理查询，返回：
          answer: str
          sources: list[dict]  — 引用溯源列表
          retrieval_mode: str
        """
        docs_with_sources = self._retrieve(query)

        if not docs_with_sources:
            return {
                "answer": "未找到相关文档，无法回答该问题。",
                "sources": [],
                "retrieval_mode": "hybrid" if self.use_hybrid else "vector",
            }

        context = _format_context(docs_with_sources)
        prompt_text = PROMPT.format(context=context, question=query)

        answer = self.llm.invoke(prompt_text)

        sources = [
            {
                "rank": item["source_info"]["rank"],
                "file_name": item["source_info"]["file_name"],
                "page": item["source_info"]["page"],
                "source_path": item["source_info"]["source_path"],
                "rrf_score": item["source_info"].get("rrf_score"),
                "content_preview": item["content_preview"],
            }
            for item in docs_with_sources
        ]

        return {
            "answer": answer,
            "sources": sources,
            "retrieval_mode": "hybrid" if self.use_hybrid else "vector",
        }

    # ── 流式查询（generator，配合 SSE 使用）
    def stream_query(self, query: str) -> Generator[str, None, None]:
        """
        流式查询生成器
        yield 格式：SSE data 行，以 '\\n\\n' 结尾
        特殊行：
          SOURCES: <json>   — 检索来源信息
          COMPLETE           — 流式输出结束标志
        """
        import json

        yield f"data: 正在执行{'混合' if self.use_hybrid else '向量'}检索...\n\n"

        docs_with_sources = self._retrieve(query)

        if not docs_with_sources:
            yield "data: 未找到相关文档\n\n"
            yield "data: COMPLETE\n\n"
            return

        yield f"data: 检索完成，获取到 {len(docs_with_sources)} 个相关文档块\n\n"

        # 发送来源信息
        sources = [
            {
                "rank": item["source_info"]["rank"],
                "file_name": item["source_info"]["file_name"],
                "page": item["source_info"]["page"],
                "source_path": item["source_info"]["source_path"],
                "content_preview": item["content_preview"],
            }
            for item in docs_with_sources
        ]
        yield f"data: SOURCES: {json.dumps(sources, ensure_ascii=False)}\n\n"

        # 构建 prompt 并流式生成回答
        context = _format_context(docs_with_sources)
        prompt_text = PROMPT.format(context=context, question=query)

        yield "data: 正在生成回答...\n\n"

        # OllamaLLM 流式输出
        try:
            for chunk in self.llm.stream(prompt_text):
                if chunk:
                    yield f"data: {chunk}\n\n"
        except Exception as e:
            # 降级：非流式
            answer = self.llm.invoke(prompt_text)
            for paragraph in answer.split('\n'):
                if paragraph.strip():
                    yield f"data: {paragraph}\n\n"

        yield "data: COMPLETE\n\n"


def _extract_filename_from_meta(meta: Dict[str, Any]) -> str:
    import os as _os
    for key in ("source", "file_path", "path", "filename", "file_name"):
        val = meta.get(key, "")
        if val:
            return _os.path.basename(str(val))
    return "未知来源"
