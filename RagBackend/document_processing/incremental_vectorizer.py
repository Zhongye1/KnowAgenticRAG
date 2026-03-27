"""
incremental_vectorizer.py
增量向量化管理器

核心思路：
  1. 维护一个 JSON 索引文件，记录每个已向量化文档的 SHA256 哈希值
  2. 上传新文档时，比对哈希：
     - 未出现过 → 全量向量化并入库
     - 哈希相同 → 跳过（已是最新，无需重复计算）
     - 哈希不同 → 删除旧向量块，重新向量化（增量更新）
  3. 删除文档时，同步从向量库中移除对应块

依赖：
  - RAG_M/src/vectorstore/vector_store.py  (VectorStoreManager)
  - RAG_M/src/ingestion/document_loader.py (DocumentLoader)
  - FAISS 向量库目录与元数据目录

使用方式：
  from document_processing.incremental_vectorizer import IncrementalVectorizer
  iv = IncrementalVectorizer(kb_id="kb_001")
  result = iv.ingest_file(file_path="docs/paper.pdf", file_hash="abc123...")
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import shutil
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# 确保能找到 RAG_M 模块
_BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND_DIR))
sys.path.insert(0, str(_BACKEND_DIR / "RAG_M"))

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# ── 目录配置 ─────────────────────────────────────────────────────
VECTORSTORE_ROOT = str(_BACKEND_DIR / "knowledge_base" / "vectorstores")
HASH_INDEX_ROOT = str(_BACKEND_DIR / "metadata" / "vector_hash_index")

os.makedirs(VECTORSTORE_ROOT, exist_ok=True)
os.makedirs(HASH_INDEX_ROOT, exist_ok=True)


# ─────────────────────────────────────────────────────────────────
# 哈希索引：持久化记录已向量化文档
# ─────────────────────────────────────────────────────────────────

class HashIndex:
    """
    每个知识库对应一个 JSON 文件，记录结构：
    {
      "doc_id_or_filepath": {
        "file_hash": "sha256...",
        "chunk_ids": ["chunk_0", "chunk_1", ...],   # FAISS 中的文档 ID
        "vectorized_at": "2026-03-25T14:30:00",
        "chunk_count": 12
      },
      ...
    }
    """

    def __init__(self, kb_id: str):
        self.kb_id = kb_id
        self.index_path = os.path.join(HASH_INDEX_ROOT, f"{kb_id}_hash_index.json")
        self._data: Dict[str, dict] = self._load()

    def _load(self) -> Dict[str, dict]:
        if os.path.exists(self.index_path):
            try:
                with open(self.index_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return {}
        return {}

    def save(self):
        with open(self.index_path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)

    def get(self, doc_key: str) -> Optional[dict]:
        return self._data.get(doc_key)

    def set(self, doc_key: str, record: dict):
        self._data[doc_key] = record
        self.save()

    def delete(self, doc_key: str):
        if doc_key in self._data:
            del self._data[doc_key]
            self.save()

    def all_records(self) -> Dict[str, dict]:
        return dict(self._data)

    def stats(self) -> dict:
        total_chunks = sum(r.get("chunk_count", 0) for r in self._data.values())
        return {
            "kb_id": self.kb_id,
            "total_documents": len(self._data),
            "total_chunks": total_chunks,
        }


# ─────────────────────────────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────────────────────────────

def compute_file_hash(file_path: str) -> str:
    """计算文件 SHA256 哈希（比 MD5 更抗碰撞）"""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def compute_bytes_hash(content: bytes) -> str:
    """计算字节流 SHA256 哈希"""
    return hashlib.sha256(content).hexdigest()


# ─────────────────────────────────────────────────────────────────
# 增量向量化核心类
# ─────────────────────────────────────────────────────────────────

class IncrementalVectorizer:
    """
    增量向量化管理器：按知识库 (kb_id) 隔离向量存储，
    通过 SHA256 哈希比对决定是否重新向量化。
    """

    def __init__(self, kb_id: str):
        self.kb_id = kb_id
        self.vectorstore_path = os.path.join(VECTORSTORE_ROOT, kb_id)
        os.makedirs(self.vectorstore_path, exist_ok=True)
        self.hash_index = HashIndex(kb_id)
        self._vs_manager = None   # 懒加载

    def _get_vs_manager(self):
        if self._vs_manager is None:
            try:
                from RAG_M.src.vectorstore.vector_store import VectorStoreManager
                self._vs_manager = VectorStoreManager(docs_dir=self.vectorstore_path)
            except ImportError:
                from src.vectorstore.vector_store import VectorStoreManager
                self._vs_manager = VectorStoreManager(docs_dir=self.vectorstore_path)
        return self._vs_manager

    def _load_vectorstore(self):
        """加载已有向量库，不存在时返回 None"""
        vs_manager = self._get_vs_manager()
        index_file = os.path.join(self.vectorstore_path, "index.faiss")
        if os.path.exists(index_file):
            try:
                return vs_manager.load_vectorstore(self.vectorstore_path, trust_source=True)
            except Exception as e:
                logger.warning(f"[IncrementalVectorizer] 加载向量库失败: {e}")
                return None
        return None

    def _load_documents(self, file_path: str):
        """使用项目内的 DocumentLoader 解析文档为 LangChain Document 列表"""
        try:
            from RAG_M.src.ingestion.document_loader import DocumentLoader
        except ImportError:
            try:
                from src.ingestion.document_loader import DocumentLoader
            except ImportError:
                # Fallback: 简单文本加载
                from langchain.docstore.document import Document
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    text = f.read()
                # 按段落分块（~500字符）
                chunks = [p.strip() for p in text.split("\n\n") if len(p.strip()) > 50]
                if not chunks:
                    chunks = [text[:2000]]
                return [
                    Document(
                        page_content=chunk,
                        metadata={"source": file_path, "chunk_index": i}
                    )
                    for i, chunk in enumerate(chunks)
                ]

        loader = DocumentLoader()
        try:
            docs = loader.load_and_split(file_path)
            return docs
        except Exception as e:
            logger.error(f"[IncrementalVectorizer] 文档解析失败 {file_path}: {e}")
            raise

    # ── 核心方法：增量 Ingest ──────────────────────────────────

    def ingest_file(
        self,
        file_path: str,
        doc_key: Optional[str] = None,
        force: bool = False,
    ) -> dict:
        """
        对单个文件执行增量向量化。

        Args:
            file_path: 文件绝对路径
            doc_key:   文档唯一标识（默认使用文件相对路径）
            force:     True 则强制重新向量化，忽略哈希比对

        Returns:
            {
                "status": "added" | "updated" | "skipped",
                "doc_key": ...,
                "chunk_count": ...,
                "file_hash": ...,
            }
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"文件不存在: {file_path}")

        doc_key = doc_key or os.path.relpath(file_path, str(_BACKEND_DIR))
        new_hash = compute_file_hash(file_path)

        existing = self.hash_index.get(doc_key)

        # ── 哈希比对：跳过未变化的文档
        if not force and existing and existing.get("file_hash") == new_hash:
            logger.info(f"[IncrementalVectorizer] 跳过（哈希未变）: {doc_key}")
            return {
                "status": "skipped",
                "doc_key": doc_key,
                "chunk_count": existing.get("chunk_count", 0),
                "file_hash": new_hash,
                "message": "文档内容未变化，跳过向量化",
            }

        status = "updated" if existing else "added"

        # ── 解析文档
        logger.info(f"[IncrementalVectorizer] 解析文档: {file_path}")
        documents = self._load_documents(file_path)
        if not documents:
            raise ValueError(f"文档解析结果为空: {file_path}")

        # 为每个 chunk 打上 doc_key 元数据，便于后续定向删除
        for i, doc in enumerate(documents):
            doc.metadata["doc_key"] = doc_key
            doc.metadata["source"] = file_path
            doc.metadata["chunk_index"] = i

        # ── 更新向量库
        vs_manager = self._get_vs_manager()
        existing_vs = self._load_vectorstore()

        if existing_vs is not None and existing and status == "updated":
            # 有旧向量库：先删除该文档的旧 chunk，再添加新 chunk
            logger.info(f"[IncrementalVectorizer] 删除旧向量块并重新写入: {doc_key}")
            try:
                # FAISS 不原生支持按条件删除，采用"过滤重建"策略：
                # 1. 取出所有非本文档的 chunk
                # 2. 加入新 chunk
                # 3. 重建向量库
                all_docs = list(existing_vs.docstore._dict.values())
                other_docs = [
                    d for d in all_docs
                    if hasattr(d, "metadata") and d.metadata.get("doc_key") != doc_key
                ]
                merged_docs = other_docs + documents
                new_vs = vs_manager.create_vectorstore(merged_docs, self.vectorstore_path)
            except Exception as e:
                logger.warning(f"[IncrementalVectorizer] 增量删除重建失败，降级为追加: {e}")
                # 降级：直接追加（不删旧向量，可能有重复，但不影响正确性）
                existing_vs.add_documents(documents)
                existing_vs.save_local(self.vectorstore_path)
        elif existing_vs is not None:
            # 新文档，直接追加到已有向量库
            logger.info(f"[IncrementalVectorizer] 追加新文档到现有向量库: {doc_key}")
            existing_vs.add_documents(documents)
            existing_vs.save_local(self.vectorstore_path)
        else:
            # 向量库不存在，全量创建
            logger.info(f"[IncrementalVectorizer] 创建新向量库: {self.kb_id}")
            vs_manager.create_vectorstore(documents, self.vectorstore_path)

        # ── 更新哈希索引
        self.hash_index.set(doc_key, {
            "file_hash": new_hash,
            "file_path": file_path,
            "vectorized_at": datetime.now().isoformat(),
            "chunk_count": len(documents),
            "status": status,
        })

        logger.info(f"[IncrementalVectorizer] 完成 ({status}): {doc_key}, {len(documents)} chunks")

        return {
            "status": status,
            "doc_key": doc_key,
            "chunk_count": len(documents),
            "file_hash": new_hash,
            "message": f"向量化{'更新' if status == 'updated' else '新增'}成功",
        }

    def remove_file(self, doc_key: str) -> dict:
        """
        从向量库中移除指定文档的所有向量块。

        Returns:
            {"status": "removed" | "not_found", "doc_key": ...}
        """
        existing = self.hash_index.get(doc_key)
        if not existing:
            return {"status": "not_found", "doc_key": doc_key}

        existing_vs = self._load_vectorstore()
        if existing_vs is not None:
            try:
                all_docs = list(existing_vs.docstore._dict.values())
                remaining = [
                    d for d in all_docs
                    if hasattr(d, "metadata") and d.metadata.get("doc_key") != doc_key
                ]
                if remaining:
                    vs_manager = self._get_vs_manager()
                    vs_manager.create_vectorstore(remaining, self.vectorstore_path)
                else:
                    # 删光了，清除向量库文件
                    for fname in ["index.faiss", "index.pkl"]:
                        fpath = os.path.join(self.vectorstore_path, fname)
                        if os.path.exists(fpath):
                            os.remove(fpath)
                logger.info(f"[IncrementalVectorizer] 已从向量库移除: {doc_key}")
            except Exception as e:
                logger.warning(f"[IncrementalVectorizer] 向量删除失败: {e}")

        self.hash_index.delete(doc_key)
        return {
            "status": "removed",
            "doc_key": doc_key,
            "message": "向量块已移除",
        }

    def batch_ingest(self, file_paths: List[str], force: bool = False) -> dict:
        """批量增量向量化，返回各文件处理结果汇总"""
        results = {"added": 0, "updated": 0, "skipped": 0, "failed": 0, "details": []}
        for fp in file_paths:
            try:
                r = self.ingest_file(fp, force=force)
                results[r["status"]] = results.get(r["status"], 0) + 1
                results["details"].append(r)
            except Exception as e:
                results["failed"] += 1
                results["details"].append({
                    "status": "failed",
                    "file_path": fp,
                    "error": str(e),
                })
        return results

    def get_stats(self) -> dict:
        """返回向量库统计信息"""
        stats = self.hash_index.stats()
        index_file = os.path.join(self.vectorstore_path, "index.faiss")
        stats["vectorstore_exists"] = os.path.exists(index_file)
        if stats["vectorstore_exists"]:
            stats["vectorstore_size_mb"] = round(
                os.path.getsize(index_file) / 1024 / 1024, 2
            )
        return stats


# ─────────────────────────────────────────────────────────────────
# FastAPI 路由（供 main.py include）
# ─────────────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    kb_id: str
    file_path: str
    doc_key: Optional[str] = None
    force: bool = False


class BatchIngestRequest(BaseModel):
    kb_id: str
    file_paths: List[str]
    force: bool = False


class RemoveDocRequest(BaseModel):
    kb_id: str
    doc_key: str


@router.post("/api/vectorize/ingest", summary="增量向量化单个文档（异步，立即返回 task_id）")
async def api_ingest_file(req: IngestRequest):
    """
    增量向量化：仅处理内容有变化的文档（哈希比对）。
    接口立即返回 task_id，实际向量化在后台队列中执行。
    通过 /api/vectorize/status/{task_id} 轮询进度。
    """
    from document_processing.task_queue import create_task

    # 文件存在性检查（快速校验，不阻塞）
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail=f"文件不存在: {req.file_path}")

    def _do_ingest():
        iv = IncrementalVectorizer(req.kb_id)
        return iv.ingest_file(req.file_path, doc_key=req.doc_key, force=req.force)

    task_id = create_task(_do_ingest)
    logger.info(f"[api_ingest_file] 任务已入队: {task_id}, file={req.file_path}")
    return {
        "task_id": task_id,
        "status": "pending",
        "message": "向量化任务已提交，请通过 /api/vectorize/status/{task_id} 查询进度",
    }


@router.post("/api/vectorize/batch", summary="批量增量向量化（异步，立即返回 task_id 列表）")
async def api_batch_ingest(req: BatchIngestRequest):
    """
    批量处理多个文件，每个文件独立入队，返回 task_id 列表。
    前端可逐个轮询状态，单文件失败不影响其他文件。
    """
    from document_processing.task_queue import create_task

    task_ids = []
    for fp in req.file_paths:
        if not os.path.exists(fp):
            task_ids.append({"file_path": fp, "task_id": None, "error": "文件不存在"})
            continue

        # 为每个文件创建独立闭包，避免循环变量捕获问题
        def _make_ingest(file_path: str):
            def _do():
                iv = IncrementalVectorizer(req.kb_id)
                return iv.ingest_file(file_path, force=req.force)
            return _do

        tid = create_task(_make_ingest(fp))
        task_ids.append({"file_path": fp, "task_id": tid, "status": "pending"})

    return {
        "total": len(req.file_paths),
        "queued": sum(1 for t in task_ids if t.get("task_id")),
        "tasks": task_ids,
        "message": "批量任务已提交，通过 /api/vectorize/status/{task_id} 查询各文件进度",
    }


@router.delete("/api/vectorize/remove", summary="从向量库移除文档")
async def api_remove_doc(req: RemoveDocRequest):
    """删除文档时同步清理向量库中的对应块"""
    try:
        iv = IncrementalVectorizer(req.kb_id)
        result = iv.remove_file(req.doc_key)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"向量删除失败: {str(e)}")


@router.get("/api/vectorize/stats/{kb_id}", summary="向量库统计信息")
async def api_vectorize_stats(kb_id: str):
    """查看指定知识库的向量化统计（文档数、块数、是否存在等）"""
    iv = IncrementalVectorizer(kb_id)
    return iv.get_stats()


@router.get("/api/vectorize/index/{kb_id}", summary="查看哈希索引")
async def api_hash_index(kb_id: str):
    """返回知识库的完整哈希索引（调试用）"""
    iv = IncrementalVectorizer(kb_id)
    return {
        "kb_id": kb_id,
        "records": iv.hash_index.all_records(),
        "stats": iv.hash_index.stats(),
    }


@router.get("/api/vectorize/status/{task_id}", summary="查询向量化任务状态")
async def api_task_status(task_id: str):
    """
    轮询任务进度。
    status 取值：pending（排队）/ running（进行中）/ done（完成）/ failed（失败）
    """
    from document_processing.task_queue import get_task_status, get_queue_length
    info = get_task_status(task_id)
    if info is None:
        raise HTTPException(status_code=404, detail=f"任务不存在: {task_id}")
    return {**info, "queue_length": get_queue_length()}


@router.get("/api/vectorize/queue", summary="查看队列状态")
async def api_queue_status():
    """返回当前待处理任务数"""
    from document_processing.task_queue import get_queue_length
    return {"queue_length": get_queue_length()}

