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
from typing import Optional

from fastapi.responses import StreamingResponse
import io
import contextlib
import sys

project_root = str(Path(__file__).parent)
sys.path.append(project_root)

from src.rag.rag_pipeline import RAGPipeline
from src.vectorstore.vector_store import VectorStoreManager
from src.agent.react_agent import ReActRAGAgent

load_dotenv()

router = APIRouter()

def _resolve_rag_model(raw_model: Optional[str]) -> tuple:
    """
    解析 RAG 查询中的模型字段，返回 (model_id, provider, is_cloud)。

    支持格式：
      - None / ""          → 读用户配置 / 环境变量，走 Ollama
      - "qwen2:0.5b"       → ('qwen2:0.5b', 'ollama', False)
      - "deepseek-chat"    → ('deepseek-chat', 'deepseek', True)
      - "cloud:deepseek:deepseek-chat" → ('deepseek-chat', 'deepseek', True)
    """
    if not raw_model:
        try:
            _rag_backend = str(Path(__file__).parent.parent)
            if _rag_backend not in sys.path:
                sys.path.insert(0, _rag_backend)
            from models.user_model_config import get_effective_config
            cfg = get_effective_config()
            raw_model = cfg.llm_model or os.getenv("MODEL", "qwen2:0.5b")
        except Exception:
            raw_model = os.getenv("MODEL", "qwen2:0.5b")

    # cloud:provider:model_id
    if raw_model.startswith("cloud:"):
        parts = raw_model.split(":", 2)
        provider = parts[1] if len(parts) > 1 else "ollama"
        model_id = parts[2] if len(parts) > 2 else "deepseek-chat"
        return model_id, provider, True

    # model_router._MODEL_CATALOG provider
    try:
        _backend_root = str(Path(__file__).parent.parent)
        if _backend_root not in sys.path:
            sys.path.insert(0, _backend_root)
        from multi_model.model_router import _MODEL_CATALOG
        for m in _MODEL_CATALOG:
            if m["id"] == raw_model:
                provider = m.get("provider", "ollama")
                return raw_model, provider, (provider != "ollama")
    except Exception:
        pass

    return raw_model, "ollama", False


# ────────────────────────────────────────────────────────────
# VectorStoreManager
# new VectorStoreManager()
# HuggingFaceEmbeddings ~1-3
# docs_dir key manager
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
    use_hybrid: bool = True  # Hybrid retrieval
    model: Optional[str] = None  # cloud:provider:model


class IngestRequest(BaseModel):
    docs_dir: str


# ────────────────────────────────────────────────────────────
# Vector store + Document listHybrid retrieval
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

    # FAISS docstore Document list BM25
    documents = []
    try:
        if hasattr(vectorstore, 'docstore') and hasattr(vectorstore.docstore, '_dict'):
            documents = list(vectorstore.docstore._dict.values())
            print(f"[RAG_app] 从 docstore 提取到 {len(documents)} 个文档块，启用混合检索")
    except Exception as e:
        print(f"[RAG_app] 提取 docstore 失败（{e}），混合检索降级为纯向量检索")

    return vectorstore, documents, vector_store_manager


# ────────────────────────────────────────────────────────────
# stdout ingest
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
# POST /RAG_query - Hybrid retrieval
# ────────────────────────────────────────────────────────────

@router.post("/RAG_query")
async def process_query(query_body: QueryRequest):
    """
    RAG 智能查询（SSE 流式）
    - 混合检索（BM25 + 向量 + RRF）
    - 流式生成回答（支持本地 Ollama + 云端 DeepSeek/OpenAI/混元）
    - 附带引用溯源（SOURCES: 行）
    """

    async def generate():
        try:
            yield f"data: 开始处理查询: {query_body.query}\n\n"

            if query_body.docs_dir:
                docs_dir = query_body.docs_dir
            else:
                vectorstore_path = os.getenv("VECTORSTORE_PATH", "")
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

            model_id, provider, is_cloud = _resolve_rag_model(query_body.model)
            yield f"data: 使用模型: {model_id}（{'云端·' + provider if is_cloud else 'Ollama 本地'}）\n\n"

            # - Cloud model -
            if is_cloud:
                from src.rag.hybrid_retriever import HybridRetriever
                if use_hybrid and documents:
                    retriever = HybridRetriever(
                        documents=documents,
                        vectorstore=vectorstore,
                        bm25_top_k=3,
                        vector_top_k=3,
                        final_top_k=3,
                    )
                    results = retriever.retrieve_with_scores(query_body.query)
                else:
                    raw = vectorstore.similarity_search_with_score(query_body.query, k=3)
                    results = [
                        {
                            "document": d,
                            "source_info": {
                                "rank": i + 1,
                                "file_name": d.metadata.get("source", ""),
                                "rrf_score": s,
                                "page": d.metadata.get("page"),
                            },
                        }
                        for i, (d, s) in enumerate(raw)
                    ]

                if results:
                    sources = [
                        {
                            "rank": item["source_info"]["rank"],
                            "file_name": item["source_info"].get("file_name", ""),
                            "page": item["source_info"].get("page"),
                        }
                        for item in results
                    ]
                    yield f"data: SOURCES: {json.dumps(sources, ensure_ascii=False)}\n\n"
                    context_parts = []
                    for item in results:
                        src = item["source_info"]
                        fname = src.get("file_name", "未知来源")
                        page = src.get("page")
                        header = f"【来源：{fname}{(' 第' + str(page) + '页') if page is not None else ''}】"
                        context_parts.append(f"{header}\n{item['document'].page_content.strip()}")
                    context = "\n\n---\n\n".join(context_parts)
                else:
                    yield "data: 未找到相关文档，将直接使用模型知识回答\n\n"
                    context = ""

                prompt_content = (
                    f"请基于以下参考文档回答用户问题。若文档内容不足，可补充通用知识并注明。\n\n"
                    f"参考文档：\n{context}\n\n用户问题：{query_body.query}"
                    if context else query_body.query
                )
                messages = [
                    {"role": "system", "content": "你是知识管理助手，专门回答基于文档的问题。回答要完整清晰，引用来源。"},
                    {"role": "user", "content": prompt_content},
                ]

                yield "data: 正在调用云端模型生成回答...\n\n"
                try:
                    from multi_model.model_router import (
                        _stream_deepseek, _stream_openai, _stream_hunyuan, _stream_ollama
                    )
                    stream_map = {
                        "deepseek": _stream_deepseek,
                        "openai":   _stream_openai,
                        "hunyuan":  _stream_hunyuan,
                    }
                    stream_fn = stream_map.get(provider, _stream_ollama)
                    async for chunk in stream_fn(model_id, messages, 0.7, 2048):
                        if chunk.startswith("data: "):
                            raw = chunk[6:].strip()
                            try:
                                d = json.loads(raw)
                                if d.get("error"):
                                    yield f"data: [云端模型错误] {d['error']}\n\n"
                                    break
                                if d.get("content"):
                                    yield f"data: {d['content']}\n\n"
                            except Exception:
                                pass
                except Exception as e:
                    yield f"data: ERROR: 云端模型调用失败: {e}\n\n"

                yield "data: COMPLETE\n\n"
                return

            # - Ollama RAGPipeline -
            rag = RAGPipeline(
                llm_model=model_id,
                vectorstore=vectorstore,
                documents=documents if use_hybrid else None,
                use_hybrid=use_hybrid,
            )

            loop = asyncio.get_event_loop()

            def _stream_sync():
                return list(rag.stream_query(query_body.query))

            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                chunks_future = loop.run_in_executor(pool, _stream_sync)
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
# POST /RAG_query_sync - /
# ────────────────────────────────────────────────────────────

@router.post("/RAG_query_sync")
async def process_query_sync(query_body: QueryRequest):
    """同步查询接口（非流式，用于测试和调试）"""
    try:
        if not query_body.docs_dir or not os.path.exists(query_body.docs_dir):
            raise HTTPException(status_code=400, detail="文档目录未指定或不存在")

        vectorstore, documents, _ = _load_vectorstore_and_docs(query_body.docs_dir)
        use_hybrid = query_body.use_hybrid and bool(documents)

        model_id, provider, is_cloud = _resolve_rag_model(query_body.model)

        rag = RAGPipeline(
            llm_model=model_id,
            vectorstore=vectorstore,
            documents=documents if use_hybrid else None,
            use_hybrid=use_hybrid,
        )

        result = rag.process_query(query_body.query)
        return {
            "status": "success",
            "model": model_id,
            "provider": provider,
            **result,
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}\n{traceback.format_exc()}")


# ────────────────────────────────────────────────────────────
# POST /ingest - SSE
# ────────────────────────────────────────────────────────────

@router.post("/ingest")
async def ingest_documents(ingest_body: IngestRequest):
    """文档导入接口（SSE 流式进度输出）
    
    修复：原 generate() 为同步生成器，直接阻塞 event loop 执行向量化。
    现改为：同步耗时逻辑全部放入 asyncio.to_thread，通过 asyncio.Queue 推送进度到 SSE 流。
    """
    msg_queue: asyncio.Queue = asyncio.Queue()

    def _ingest_sync():
        """在线程池中运行的同步向量化逻辑，进度通过 msg_queue 回传"""
        import traceback
        try:
            from src.ingestion.document_loader import DocumentLoader
            from src.vectorstore.vector_store import VectorStoreManager

            _vsm_cache.pop(ingest_body.docs_dir, None)
            vector_store_manager = VectorStoreManager(docs_dir=ingest_body.docs_dir)
            vectorstore_path = ingest_body.docs_dir + "/vectorstore"

            msg_queue.put_nowait(f"data: Using vector store path: {vectorstore_path}\n\n")

            if not os.path.exists(ingest_body.docs_dir):
                msg_queue.put_nowait(f"data: Directory does not exist: {ingest_body.docs_dir}\n\n")
                msg_queue.put_nowait(None)
                return

            msg_queue.put_nowait("data: Initializing DocumentLoader\n\n")
            loader = DocumentLoader(docs_dir=ingest_body.docs_dir)
            documents = []
            processed_count = skipped_count = error_count = 0

            msg_queue.put_nowait("data: Walking through directory to process files\n\n")

            for root, dirs, files in os.walk(ingest_body.docs_dir):
                dirs[:] = [d for d in dirs if d not in loader.IGNORED_DIRECTORIES]
                if 'vectorstore' in os.path.basename(root):
                    msg_queue.put_nowait(f"data: Skipping vectorstore directory: {root}\n\n")
                    continue

                msg_queue.put_nowait(f"data: Found {len(files)} files in {root}\n\n")

                for file in files:
                    file_path = os.path.join(root, file)
                    try:
                        should_skip, skip_reason = loader.should_skip_file(file_path)
                        if should_skip:
                            msg_queue.put_nowait(f"data: Skipping file: {file} ({skip_reason})\n\n")
                            skipped_count += 1
                            continue

                        msg_queue.put_nowait(f"data: Processing file: {file_path}\n\n")
                        docs = loader.load_document(file_path)
                        msg_queue.put_nowait(f"data: Successfully loaded {len(docs)} document chunks from {file_path}\n\n")
                        documents.extend(docs)
                        processed_count += 1

                    except ValueError as ve:
                        if "Skipped file" in str(ve):
                            msg_queue.put_nowait(f"data: Skipping file: {file} ({str(ve)})\n\n")
                            skipped_count += 1
                        else:
                            msg_queue.put_nowait(f"data: Unsupported file type {file_path}: {str(ve)}\n\n")
                            error_count += 1
                    except Exception as e:
                        msg_queue.put_nowait(f"data: Error processing {file_path}: {str(e)}\n\n")
                        error_count += 1

            msg_queue.put_nowait(
                f"data: Processing summary: {processed_count} processed, {skipped_count} skipped, {error_count} errors\n\n"
            )

            if not documents:
                msg_queue.put_nowait("data: No documents were processed successfully\n\n")
                msg_queue.put_nowait(None)
                return

            msg_queue.put_nowait(f"data: Creating vector store with {len(documents)} document chunks\n\n")
            vector_store_manager.create_vectorstore(documents, vectorstore_path)
            msg_queue.put_nowait(f"data: Vector store successfully created and saved to {vectorstore_path}\n\n")

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
            msg_queue.put_nowait(f"data: {json.dumps(result)}\n\n")

        except Exception as e:
            error_msg = f"Document ingestion failed: {str(e)}\n{traceback.format_exc()}"
            msg_queue.put_nowait(f"data: ERROR: {error_msg}\n\n")
        finally:
            msg_queue.put_nowait(None)

    async def generate():
        # event loop
        asyncio.create_task(asyncio.to_thread(_ingest_sync))
        while True:
            msg = await msg_queue.get()
            if msg is None:
                break
            yield msg

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# ────────────────────────────────────────────────────────────
# POST /init - Initialize
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
# GET /health  — Health check
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
# POST /agent_query - ReAct Agent
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

            # Initialize Agentagent_query OllamaCloud model /api/agent/task
            model_id, _, _ = _resolve_rag_model(getattr(query_body, 'model', None))
            agent = ReActRAGAgent(
                vectorstore=vectorstore,
                documents=documents if query_body.use_hybrid else None,
                llm_model=model_id,
                max_iterations=query_body.max_iterations,
                verbose=False,
            )

            # Streaming output
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
# POST /agent_query_sync - ReAct Agent
# ────────────────────────────────────────────────────────────

# ────────────────────────────────────────────────────────────
# RAG LangChain LangChain
# ────────────────────────────────────────────────────────────

class NativeIngestRequest(BaseModel):
    docs_dir: str


class NativeQueryRequest(BaseModel):
    query: str
    docs_dir: str
    use_hybrid: bool = True
    model: Optional[str] = None     # cloud:provider:model


@router.post("/native_ingest")
async def native_ingest_documents(req: NativeIngestRequest):
    """
    原生文档向量化（SSE 流式）
    不依赖 LangChain：使用 pypdf / docx2txt + sentence-transformers + faiss-cpu

    修复：原 generate() 为同步生成器，Embedding 计算阻塞 event loop。
    现改为：耗时操作全部放入 asyncio.to_thread，通过 asyncio.Queue 推 SSE。
    """
    msg_queue: asyncio.Queue = asyncio.Queue()

    def _native_ingest_sync():
        import traceback
        try:
            from src.rag.native_rag import (
                load_documents_from_dir,
                split_documents,
                NativeVectorStore,
            )

            msg_queue.put_nowait(f"data: [原生RAG] 开始向量化，目录: {req.docs_dir}\n\n")

            if not os.path.exists(req.docs_dir):
                msg_queue.put_nowait(f"data: [ERROR] 目录不存在: {req.docs_dir}\n\n")
                return

            # 1.
            msg_queue.put_nowait("data: [原生RAG] 正在加载文档...\n\n")
            raw_docs = load_documents_from_dir(req.docs_dir)
            if not raw_docs:
                msg_queue.put_nowait("data: [ERROR] 未找到可加载的文档\n\n")
                return
            msg_queue.put_nowait(f"data: [原生RAG] 加载完成，共 {len(raw_docs)} 页原始文档\n\n")

            # 2.
            msg_queue.put_nowait("data: [原生RAG] 正在分块...\n\n")
            chunks = split_documents(raw_docs, chunk_size=1000, chunk_overlap=200)
            msg_queue.put_nowait(f"data: [原生RAG] 分块完成，共 {len(chunks)} 个文本块\n\n")

            # 3. event loop
            msg_queue.put_nowait("data: [原生RAG] 正在计算向量（sentence-transformers）...\n\n")
            vs = NativeVectorStore(model_name="sentence-transformers/all-MiniLM-L6-v2")
            vs.build_index(chunks)

            # 4.
            save_path = os.path.join(req.docs_dir, "native_vectorstore")
            vs.save(save_path)
            msg_queue.put_nowait(f"data: [原生RAG] 向量存储已保存至: {save_path}\n\n")

            result = {
                "message": f"[原生RAG] 向量化完成，共 {len(chunks)} 个文本块",
                "documents_count": len(chunks),
                "vectorstore_path": save_path,
            }
            msg_queue.put_nowait(f"data: {json.dumps(result, ensure_ascii=False)}\n\n")

        except Exception as e:
            msg_queue.put_nowait(
                f"data: [ERROR] 原生向量化失败: {e}\n{traceback.format_exc()}\n\n"
            )
        finally:
            msg_queue.put_nowait(None)

    async def generate():
        asyncio.create_task(asyncio.to_thread(_native_ingest_sync))
        while True:
            msg = await msg_queue.get()
            if msg is None:
                break
            yield msg

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/native_query")
async def native_query(req: NativeQueryRequest):
    """
    原生 RAG 查询（SSE 流式）
    不依赖 LangChain：直接调用 Ollama HTTP API + faiss-cpu 检索
    支持云端模型：检索仍使用原生 FAISS，生成通过 model_router 调用云端
    模型配置优先级：请求字段 > 用户保存的配置 > 环境变量 > 默认值
    """
    async def generate():
        try:
            from src.rag.native_rag import NativeVectorStore, NativeRAGPipeline
            import os
            import sys

            model_id, provider, is_cloud = _resolve_rag_model(req.model)

            if is_cloud:
                yield f"data: [原生RAG] 收到查询: {req.query}\n\n"
                yield f"data: [原生RAG] 使用云端模型: {model_id}（provider: {provider}）\n\n"
            else:
                # Local model ollama host / timeout
                try:
                    _rag_root = str(Path(__file__).parent.parent)
                    if _rag_root not in sys.path:
                        sys.path.insert(0, _rag_root)
                    from models.user_model_config import get_effective_config
                    _cfg = get_effective_config()
                    if not req.model:
                        model_id = _cfg.llm_model or model_id
                    ollama_host = _cfg.ollama_base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
                    ollama_timeout = _cfg.timeout or int(os.getenv("OLLAMA_TIMEOUT", "120"))
                except Exception as _cfg_err:
                    print(f"[RAG_app] 读取用户模型配置失败，使用环境变量: {_cfg_err}")
                    ollama_host = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
                    ollama_timeout = int(os.getenv("OLLAMA_TIMEOUT", "120"))

                yield f"data: [原生RAG] 收到查询: {req.query}\n\n"
                yield f"data: [原生RAG] 使用模型: {model_id}（{ollama_host}，超时: {ollama_timeout}s）\n\n"

            # Vector store
            vs_path = os.path.join(req.docs_dir, "native_vectorstore")
            if not NativeVectorStore.exists(vs_path):
                yield f"data: [ERROR] 原生向量存储不存在，请先执行原生向量化: {vs_path}\n\n"
                return

            yield "data: [原生RAG] 正在加载向量存储...\n\n"
            vs = NativeVectorStore.load(vs_path)
            yield f"data: [原生RAG] 向量存储加载完成，{len(vs.documents)} 个文档块\n\n"

            # - Cloud model -
            if is_cloud:
                from src.rag.native_rag import NativeBM25, _rrf_fusion, _format_native_context
                results_raw = vs.similarity_search(req.query, top_k=3)
                if req.use_hybrid and vs.documents:
                    bm25 = NativeBM25(vs.documents)
                    bm25_results = bm25.retrieve(req.query, top_k=3)
                    fused = _rrf_fusion([bm25_results, results_raw])[:3]
                else:
                    fused = results_raw[:3]

                docs_with_sources = [
                    {
                        "document": doc,
                        "source_info": {
                            "rank": i + 1,
                            "file_name": doc.metadata.get("source", ""),
                            "page": doc.metadata.get("page"),
                            "rrf_score": score,
                        },
                        "content_preview": doc.page_content[:200],
                    }
                    for i, (doc, score) in enumerate(fused)
                ]

                if docs_with_sources:
                    sources = [
                        {"rank": d["source_info"]["rank"], "file_name": d["source_info"]["file_name"], "page": d["source_info"]["page"]}
                        for d in docs_with_sources
                    ]
                    yield f"data: SOURCES: {json.dumps(sources, ensure_ascii=False)}\n\n"
                    context = _format_native_context(docs_with_sources)
                else:
                    yield "data: [原生RAG] 未找到相关文档，直接使用模型知识\n\n"
                    context = ""

                prompt_content = (
                    f"请基于以下参考文档回答用户问题。若文档内容不足，可补充通用知识并注明。\n\n"
                    f"参考文档：\n{context}\n\n用户问题：{req.query}"
                    if context else req.query
                )
                messages = [
                    {"role": "system", "content": "你是知识管理助手，专门回答基于文档的问题。回答要完整清晰，引用来源。"},
                    {"role": "user", "content": prompt_content},
                ]
                yield "data: [原生RAG] 正在调用云端模型生成回答...\n\n"
                try:
                    from multi_model.model_router import (
                        _stream_deepseek, _stream_openai, _stream_hunyuan
                    )
                    stream_map = {
                        "deepseek": _stream_deepseek,
                        "openai":   _stream_openai,
                        "hunyuan":  _stream_hunyuan,
                    }
                    stream_fn = stream_map[provider]
                    async for chunk in stream_fn(model_id, messages, 0.7, 2048):
                        if chunk.startswith("data: "):
                            raw = chunk[6:].strip()
                            try:
                                d = json.loads(raw)
                                if d.get("error"):
                                    yield f"data: [ERROR] {d['error']}\n\n"
                                    break
                                if d.get("content"):
                                    yield f"data: {d['content']}\n\n"
                            except Exception:
                                pass
                except Exception as e:
                    yield f"data: [ERROR] 云端模型调用失败: {e}\n\n"

                yield "data: COMPLETE\n\n"
                return

            # - Ollama NativeRAGPipeline -
            pipeline = NativeRAGPipeline(
                vectorstore=vs,
                documents=vs.documents,
                llm_model=model_id,
                ollama_host=ollama_host,
                use_hybrid=req.use_hybrid,
                ollama_timeout=ollama_timeout,
            )

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

        model_id, _, _ = _resolve_rag_model(getattr(query_body, 'model', None))
        agent = ReActRAGAgent(
            vectorstore=vectorstore,
            documents=documents if query_body.use_hybrid else None,
            llm_model=model_id,
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
