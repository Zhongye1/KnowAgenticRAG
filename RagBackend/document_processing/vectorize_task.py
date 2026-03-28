"""
vectorize_task.py — 向量化任务注册

在应用启动时调用 register_all() 将实际处理函数注册到 task_queue，
Worker 从 Redis Stream 消费时通过 task_type 查找并执行。

架构分层：
  task_queue.py  ←─ 通用队列基础设施（不依赖具体业务）
  vectorize_task.py ←─ 向量化业务实现（注册到队列）
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _do_vectorize(
    kb_id: str,
    file_path: str,
    doc_key: str = "",
    force: bool = False,
) -> dict:
    """
    向量化任务处理函数（同步，在线程池中运行）。

    由 task_queue Worker 的 asyncio.to_thread 调用，
    不在 event loop 中运行，可以安全地做 CPU 密集型操作。
    """
    from document_processing.incremental_vectorizer import IncrementalVectorizer

    iv = IncrementalVectorizer(kb_id)
    return iv.ingest_file(
        file_path,
        doc_key=doc_key if doc_key else None,
        force=force,
    )


def register_all():
    """
    注册所有任务类型到 task_queue。
    在 FastAPI startup 中调用（main.py 的 _init_db_tables 或独立 startup 事件）。
    """
    from document_processing.task_queue import register_task

    register_task("vectorize", _do_vectorize)
    logger.info("[vectorize_task] 任务类型 'vectorize' 已注册到任务队列")
