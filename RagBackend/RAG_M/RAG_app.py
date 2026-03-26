"""
RAG_app.py  — RAG 服务路由 v2
新增：
  - /RAG_query  使用混合检索 + 流式输出 + 引用溯源
  - /RAG_query_sync  同步查询（用于测试）
  - /ingest     文档向量化（SSE 流式）
  - /init       项目初始化
  - /health     健康检查
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from functools import lru_cache
import os
import json
import asyncio
from pathlib import Path
from dotenv import load_dotenv

from fastapi.responses import StreamingResponse
import io
import contextlib
import sys

# 导入核心组件
project_root = str(Path(__file__).parent)
sys.path.append(project_root)

from src.rag.rag_pipeline import RAGPipeline
from src.vectorstore.vector_store import VectorStoreManager
from src.agent.react_agent import ReActRAGAgent

load_dotenv()

router = APIRouter()

# ────────────────────────────────────────────────────────────
# 全局 VectorStoreManager 缓存
# 问题根因：每次请求都 new VectorStoreManager()，导致每次都重新加载
# HuggingFaceEmbeddings 模型（~1-3 秒），频繁查询时累积极慢。
# 修复：以 docs_dir 为 key 缓存 manager 实例，模型只加载一次。
# ────────────────────────────────────────────────────────────
_vsm_cache: dict = {}

def _get_or_create_vsm(docs_dir: str) -> "VectorStoreManager":
    """
    获取或创建 VectorStoreManager 实例（全局缓存，避免重复加载 embedding 模型）。
    同一 docs_dir 只初始化一次 HuggingFaceEmbeddings 模型。
    """
    global _vsm_cache
    if docs_dir not in _vsm_cache:
        _vsm_cache[docs_dir] = VectorStoreManager(docs_dir=docs_dir)
    return _vsm_cache[docs_dir]


class QueryRequest(BaseModel):
    query: str
    docs_dir: str = None
    use_hybrid: bool = True  # 新增：是否使用混合检索，默认开启


class IngestRequest(BaseModel):
    docs_dir: str


# ────────────────────────────────────────────────────────────
# 辅助：加载向量存储 + 文档列表（用于混合检索）
# ────────────────────────────────────────────────────────────

def _load_vectorstore_and_docs(docs_dir: str):
    """
    加载向量存储，同时返回文档列表（供 BM25 使用）。
    使用全局缓存的 VectorStoreManager，避免每次请求重新加载 embedding 模型。
    """
    vector_store_manager = _get_or_create_vsm(docs_dir)
    vectorstore_path = os.path.join(docs_dir, "vectorstore")

    if not os.path.exists(vectorstore_path):
        raise FileNotFoundError(f"向量存储路径不存在: {vectorstore_path}")

    vectorstore = vector_store_manager.load_vectorstore(vectorstore_path, trust_source=True)

    # 尝试从 FAISS 内部 docstore 提取文档列表，用于 BM25
    documents = []
    try:
        if hasattr(vectorstore, 'docstore') and hasattr(vectorstore.docstore, '_dict'):
            documents = list(vectorstore.docstore._dict.values())
            print(f"[RAG_app] 从 docstore 提取到 {len(documents)} 个文档块，启用混合检索")
    except Exception as e:
        print(f"[RAG_app] 提取 docstore 失败（{e}），混合检索降级为纯向量检索")

    return vectorstore, documents, vector_store_manager


# ────────────────────────────────────────────────────────────
# stdout 捕获（用于 ingest 进度流）
# ────────────────────────────────────────────────────────────

@contextlib.contextmanager
def capture_stdout():
    stdout_buffer = io.StringIO()
    original_stdout = sys.stdout

    class DualOutput:
        def write(self, text):
            original_stdout.write(text)
            stdout_buffer.write(text)
        def flush(self):
            original_stdout.flush()
            stdout_buffer.flush()

    sys.stdout = DualOutput()
    try:
        yield stdout_buffer
    finally:
        sys.stdout = original_stdout


# ────────────────────────────────────────────────────────────
# POST /RAG_query  — 流式混合检索问答
# ────────────────────────────────────────────────────────────

@router.post("/RAG_query")
async def process_query(query_body: QueryRequest):
    """
    RAG 智能查询（SSE 流式）
    - 混合检索（BM25 + 向量 + RRF）
    - 流式生成回答
    - 附带引用溯源（SOURCES: 行）
    """

    async def generate():
        try:
            yield f"data: 开始处理查询: {query_body.query}\n\n"

            # 确定文档目录
            if query_body.docs_dir:
                docs_dir = query_body.docs_dir
            else:
                vectorstore_path = os.getenv("VECTORSTORE_PATH", "")
                # 尝试从环境变量路径推导 docs_dir
                docs_dir = str(Path(vectorstore_path).parent) if vectorstore_path else ""

            if not docs_dir or not os.path.exists(docs_dir):
                yield "data: ERROR: 文档目录未指定或不存在\n\n"
                return

            yield "data: 正在加载向量存储...\n\n"
            try:
                vectorstore, documents, _ = _load_vectorstore_and_docs(docs_dir)
            except FileNotFoundError as e:
                yield f"data: ERROR: {str(e)}\n\n"
                return

            yield f"data: 向量存储加载完成，文档块数量: {len(documents)}\n\n"

            use_hybrid = query_body.use_hybrid and bool(documents)
            yield f"data: 检索模式: {'混合检索(BM25+向量)' if use_hybrid else '纯向量检索'}\n\n"

            # 初始化 RAG Pipeline
            model_name = os.getenv("MODEL")
            rag = RAGPipeline(
                llm_model=model_name,
                vectorstore=vectorstore,
                documents=documents if use_hybrid else None,
                use_hybrid=use_hybrid,
            )

            # 流式输出
            loop = asyncio.get_event_loop()

            def _stream_sync():
                return list(rag.stream_query(query_body.query))

            # 在线程池中运行同步生成器，避免阻塞事件循环
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                chunks_future = loop.run_in_executor(pool, _stream_sync)
                chunks = await chunks_future

            for chunk in chunks:
                yield chunk
                await asyncio.sleep(0)  # 让事件循环喘气

        except Exception as e:
            import traceback
            yield f"data: ERROR: {str(e)}\n{traceback.format_exc()}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ────────────────────────────────────────────────────────────
# POST /RAG_query_sync  — 同步查询（测试/调试用）
# ────────────────────────────────────────────────────────────

@router.post("/RAG_query_sync")
async def process_query_sync(query_body: QueryRequest):
    """同步查询接口（非流式，用于测试和调试）"""
    try:
        if not query_body.docs_dir or not os.path.exists(query_body.docs_dir):
            raise HTTPException(status_code=400, detail="文档目录未指定或不存在")

        vectorstore, documents, _ = _load_vectorstore_and_docs(query_body.docs_dir)
        use_hybrid = query_body.use_hybrid and bool(documents)

        rag = RAGPipeline(
            llm_model=os.getenv("MODEL"),
            vectorstore=vectorstore,
            documents=documents if use_hybrid else None,
            use_hybrid=use_hybrid,
        )

        result = rag.process_query(query_body.query)
        return {
            "status": "success",
            **result,
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}\n{traceback.format_exc()}")


# ────────────────────────────────────────────────────────────
# POST /ingest  — 文档向量化（SSE 流式）
# ────────────────────────────────────────────────────────────

@router.post("/ingest")
async def ingest_documents(ingest_body: IngestRequest):
    """文档导入接口（SSE 流式进度输出）"""

    def generate():
        with capture_stdout():
            print(f"Starting document ingestion from directory: {ingest_body.docs_dir}")
            try:
                from src.ingestion.document_loader import DocumentLoader
                from src.vectorstore.vector_store import VectorStoreManager

                # 向量化完成后旧缓存已过期，清除对应缓存项让下次查询重新绑定
                _vsm_cache.pop(ingest_body.docs_dir, None)
                vector_store_manager = VectorStoreManager(docs_dir=ingest_body.docs_dir)
                vectorstore_path = ingest_body.docs_dir + "/vectorstore"

                yield f"data: Using vector store path: {vectorstore_path}\n\n"

                if not os.path.exists(ingest_body.docs_dir):
                    yield f"data: Directory does not exist: {ingest_body.docs_dir}\n\n"
                    raise ValueError(f"Directory does not exist: {ingest_body.docs_dir}")

                yield "data: Initializing DocumentLoader\n\n"
                loader = DocumentLoader(docs_dir=ingest_body.docs_dir)
                documents = []
                processed_count = skipped_count = error_count = 0

                yield "data: Walking through directory to process files\n\n"

                for root, dirs, files in os.walk(ingest_body.docs_dir):
                    dirs[:] = [d for d in dirs if d not in loader.IGNORED_DIRECTORIES]
                    if 'vectorstore' in os.path.basename(root):
                        yield f"data: Skipping vectorstore directory: {root}\n\n"
                        continue

                    yield f"data: Found {len(files)} files in {root}\n\n"

                    for file in files:
                        file_path = os.path.join(root, file)
                        try:
                            should_skip, skip_reason = loader.should_skip_file(file_path)
                            if should_skip:
                                yield f"data: Skipping file: {file} ({skip_reason})\n\n"
                                skipped_count += 1
                                continue

                            yield f"data: Processing file: {file_path}\n\n"
                            docs = loader.load_document(file_path)
                            yield f"data: Successfully loaded {len(docs)} document chunks from {file_path}\n\n"
                            documents.extend(docs)
                            processed_count += 1

                        except ValueError as ve:
                            if "Skipped file" in str(ve):
                                yield f"data: Skipping file: {file} ({str(ve)})\n\n"
                                skipped_count += 1
                            else:
                                yield f"data: Unsupported file type {file_path}: {str(ve)}\n\n"
                                error_count += 1
                        except Exception as e:
                            yield f"data: Error processing {file_path}: {str(e)}\n\n"
                            error_count += 1

                yield f"data: Processing summary: {processed_count} processed, {skipped_count} skipped, {error_count} errors\n\n"

                if not documents:
                    yield "data: No documents were processed successfully\n\n"
                    raise ValueError("No documents were processed successfully")

                yield f"data: Creating vector store with {len(documents)} document chunks\n\n"
                vector_store_manager.create_vectorstore(documents, vectorstore_path)
                yield f"data: Vector store successfully created and saved to {vectorstore_path}\n\n"

                result = {
                    "message": f"Successfully ingested {len(documents)} document chunks",
                    "documents_count": len(documents),
                    "vectorstore_path": vectorstore_path,
                    "stats": {
                        "processed": processed_count,
                        "skipped": skipped_count,
                        "errors": error_count,
                    },
                }
                yield f"data: {json.dumps(result)}\n\n"

            except Exception as e:
                import traceback
                error_msg = f"Document ingestion failed: {str(e)}\n{traceback.format_exc()}"
                yield f"data: ERROR: {error_msg}\n\n"
                raise HTTPException(status_code=500, detail=error_msg)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ────────────────────────────────────────────────────────────
# POST /init  — 项目初始化
# ────────────────────────────────────────────────────────────

@router.post("/init")
async def init_project():
    """项目初始化"""
    try:
        from src.scripts.init_project import init_project as init_func
        init_func()
        return {"message": "Project initialized successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Project initialization failed: {str(e)}")


# ────────────────────────────────────────────────────────────
# GET /health  — 健康检查
# ────────────────────────────────────────────────────────────

@router.get("/health")
async def rag_health_check():
    """RAG 服务健康检查"""
    model = os.getenv("MODEL")
    vectorstore_path = os.getenv("VECTORSTORE_PATH")
    return {
        "status": "healthy",
        "service": "RAG Query Service v2",
        "model": model,
        "vectorstore_path": vectorstore_path,
        "vectorstore_exists": os.path.exists(vectorstore_path) if vectorstore_path else False,
        "features": ["hybrid_retrieval", "bm25+vector+rrf", "citation_tracking", "streaming", "react_agent"],
    }


# ────────────────────────────────────────────────────────────
# POST /agent_query  — ReAct Agent 流式问答
# ────────────────────────────────────────────────────────────

class AgentQueryRequest(BaseModel):
    query: str
    docs_dir: str = None
    use_hybrid: bool = True
    max_iterations: int = 5


@router.post("/agent_query")
async def agent_query(query_body: AgentQueryRequest):
    """
    ReAct Agent 智能问答（SSE 流式）

    与 /RAG_query 的区别：
    - RAG_query: 强制每次检索文档后生成回答
    - agent_query: LLM 自主推理是否需要检索（更智能，适合多轮对话）
    """

    async def generate():
        try:
            yield f"data: 🤖 启动 ReAct Agent 模式...\n\n"

            # 确定文档目录
            if query_body.docs_dir:
                docs_dir = query_body.docs_dir
            else:
                vectorstore_path = os.getenv("VECTORSTORE_PATH", "")
                docs_dir = str(Path(vectorstore_path).parent) if vectorstore_path else ""

            if not docs_dir or not os.path.exists(docs_dir):
                yield "data: ERROR: 文档目录未指定或不存在\n\n"
                return

            yield "data: 📂 正在加载向量存储...\n\n"
            try:
                vectorstore, documents, _ = _load_vectorstore_and_docs(docs_dir)
            except FileNotFoundError as e:
                yield f"data: ERROR: {str(e)}\n\n"
                return

            yield f"data: ✅ 向量存储加载完成，文档块: {len(documents)} 个\n\n"

            # 初始化 Agent
            model_name = os.getenv("MODEL")
            agent = ReActRAGAgent(
                vectorstore=vectorstore,
                documents=documents if query_body.use_hybrid else None,
                llm_model=model_name,
                max_iterations=query_body.max_iterations,
                verbose=False,
            )

            # 流式输出
            loop = asyncio.get_event_loop()

            def _run_agent():
                return list(agent.stream_query(query_body.query))

            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                chunks_future = loop.run_in_executor(pool, _run_agent)
                chunks = await chunks_future

            for chunk in chunks:
                yield chunk
                await asyncio.sleep(0)

        except Exception as e:
            import traceback
            yield f"data: ERROR: {str(e)}\n{traceback.format_exc()}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ────────────────────────────────────────────────────────────
# POST /agent_query_sync  — ReAct Agent 同步问答（测试用）
# ────────────────────────────────────────────────────────────

# ────────────────────────────────────────────────────────────
# 原生 RAG 路由（不依赖 LangChain，与上方 LangChain 路由并列）
# ────────────────────────────────────────────────────────────

class NativeIngestRequest(BaseModel):
    docs_dir: str


class NativeQueryRequest(BaseModel):
    query: str
    docs_dir: str
    use_hybrid: bool = True


@router.post("/native_ingest")
async def native_ingest_documents(req: NativeIngestRequest):
    """
    原生文档向量化（SSE 流式）
    不依赖 LangChain：使用 pypdf / docx2txt + sentence-transformers + faiss-cpu
    """
    def generate():
        try:
            from src.rag.native_rag import (
                load_documents_from_dir,
                split_documents,
                NativeVectorStore,
            )
            import os, json

            yield f"data: [原生RAG] 开始向量化，目录: {req.docs_dir}\n\n"

            if not os.path.exists(req.docs_dir):
                yield f"data: [ERROR] 目录不存在: {req.docs_dir}\n\n"
                return

            # 1. 加载文档
            yield "data: [原生RAG] 正在加载文档...\n\n"
            raw_docs = load_documents_from_dir(req.docs_dir)
            if not raw_docs:
                yield "data: [ERROR] 未找到可加载的文档\n\n"
                return
            yield f"data: [原生RAG] 加载完成，共 {len(raw_docs)} 页原始文档\n\n"

            # 2. 分块
            yield "data: [原生RAG] 正在分块...\n\n"
            chunks = split_documents(raw_docs, chunk_size=1000, chunk_overlap=200)
            yield f"data: [原生RAG] 分块完成，共 {len(chunks)} 个文本块\n\n"

            # 3. 向量化
            yield "data: [原生RAG] 正在计算向量（sentence-transformers）...\n\n"
            vs = NativeVectorStore(model_name="sentence-transformers/all-MiniLM-L6-v2")
            vs.build_index(chunks)

            # 4. 保存
            save_path = os.path.join(req.docs_dir, "native_vectorstore")
            vs.save(save_path)
            yield f"data: [原生RAG] 向量存储已保存至: {save_path}\n\n"

            result = {
                "message": f"[原生RAG] 向量化完成，共 {len(chunks)} 个文本块",
                "documents_count": len(chunks),
                "vectorstore_path": save_path,
            }
            yield f"data: {json.dumps(result, ensure_ascii=False)}\n\n"

        except Exception as e:
            import traceback
            yield f"data: [ERROR] 原生向量化失败: {e}\n{traceback.format_exc()}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/native_query")
async def native_query(req: NativeQueryRequest):
    """
    原生 RAG 查询（SSE 流式）
    不依赖 LangChain：直接调用 Ollama /api/generate + faiss-cpu 检索
    """
    async def generate():
        try:
            from src.rag.native_rag import NativeVectorStore, NativeRAGPipeline
            import os

            yield f"data: [原生RAG] 收到查询: {req.query}\n\n"

            # 加载向量存储
            vs_path = os.path.join(req.docs_dir, "native_vectorstore")
            if not NativeVectorStore.exists(vs_path):
                yield f"data: [ERROR] 原生向量存储不存在，请先执行原生向量化: {vs_path}\n\n"
                return

            yield "data: [原生RAG] 正在加载向量存储...\n\n"
            vs = NativeVectorStore.load(vs_path)
            yield f"data: [原生RAG] 向量存储加载完成，{len(vs.documents)} 个文档块\n\n"

            # 初始化 Pipeline
            model_name = os.getenv("MODEL", "qwen2:0.5b")
            pipeline = NativeRAGPipeline(
                vectorstore=vs,
                documents=vs.documents,
                llm_model=model_name,
                use_hybrid=req.use_hybrid,
            )

            # 流式生成
            loop = asyncio.get_event_loop()
            import concurrent.futures

            def _run():
                return list(pipeline.stream_query(req.query))

            with concurrent.futures.ThreadPoolExecutor() as pool:
                chunks = await loop.run_in_executor(pool, _run)

            for chunk in chunks:
                yield chunk
                await asyncio.sleep(0)

        except Exception as e:
            import traceback
            yield f"data: [ERROR] 原生 RAG 查询失败: {e}\n{traceback.format_exc()}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/agent_query_sync")
async def agent_query_sync(query_body: AgentQueryRequest):
    """
    ReAct Agent 同步问答接口（非流式，用于测试和调试）

    返回完整推理步骤 + 最终回答
    """
    try:
        if not query_body.docs_dir or not os.path.exists(query_body.docs_dir):
            raise HTTPException(status_code=400, detail="文档目录未指定或不存在")

        vectorstore, documents, _ = _load_vectorstore_and_docs(query_body.docs_dir)

        model_name = os.getenv("MODEL")
        agent = ReActRAGAgent(
            vectorstore=vectorstore,
            documents=documents if query_body.use_hybrid else None,
            llm_model=model_name,
            max_iterations=query_body.max_iterations,
            verbose=False,
        )

        result = agent.query(query_body.query)
        return {"status": "success", **result}

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"Agent 查询失败: {str(e)}\n{traceback.format_exc()}")
