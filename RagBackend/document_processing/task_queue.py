"""
task_queue.py
异步向量化任务队列

核心设计：
  - 上传接口只做「文件接收 + 入队」，毫秒级返回 task_id
  - 后台 worker（最大并发 2）串行消费队列，执行耗时的向量化操作
  - 任务状态持久化到内存字典，前端可轮询 /api/vectorize/status/{task_id}

依赖：asyncio（标准库），无需 Redis / Celery
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, Callable

logger = logging.getLogger(__name__)

# ── 任务状态枚举 ──────────────────────────────────────────────
class TaskStatus:
    PENDING   = "pending"    # 排队等待
    RUNNING   = "running"    # 正在处理
    DONE      = "done"       # 完成
    FAILED    = "failed"     # 失败


# ── 全局状态存储（内存，服务重启后丢失——可接受，向量化结果持久在磁盘）
_task_store: Dict[str, Dict[str, Any]] = {}

# ── 全局队列 & 信号量 ──────────────────────────────────────────
_queue: Optional[asyncio.Queue] = None
_semaphore: Optional[asyncio.Semaphore] = None
_MAX_CONCURRENCY = 2   # 最大同时向量化并发数（本地 Ollama 内存有限）
_worker_started = False


def _get_queue() -> asyncio.Queue:
    global _queue
    if _queue is None:
        _queue = asyncio.Queue()
    return _queue


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(_MAX_CONCURRENCY)
    return _semaphore


# ── 后台 Worker ───────────────────────────────────────────────

async def _worker():
    """持续消费队列，使用信号量限制并发"""
    q = _get_queue()
    sem = _get_semaphore()
    logger.info("[TaskQueue] Worker 已启动")
    while True:
        task_id, func, args, kwargs = await q.get()
        async with sem:
            _update_task(task_id, status=TaskStatus.RUNNING,
                         started_at=datetime.now().isoformat())
            try:
                # 同步函数放到线程池中执行，不阻塞 event loop
                result = await asyncio.to_thread(func, *args, **kwargs)
                _update_task(task_id,
                             status=TaskStatus.DONE,
                             result=result,
                             finished_at=datetime.now().isoformat())
                logger.info(f"[TaskQueue] 任务完成: {task_id}")
            except Exception as e:
                _update_task(task_id,
                             status=TaskStatus.FAILED,
                             error=str(e),
                             finished_at=datetime.now().isoformat())
                logger.error(f"[TaskQueue] 任务失败: {task_id}, 错误: {e}", exc_info=True)
        q.task_done()


async def ensure_worker_started():
    """在 FastAPI startup 事件中调用，确保 worker 协程已启动"""
    global _worker_started
    if not _worker_started:
        asyncio.create_task(_worker())
        _worker_started = True
        logger.info("[TaskQueue] 后台 Worker 任务已创建")


# ── 任务管理 API ──────────────────────────────────────────────

def create_task(func: Callable, *args, task_id: Optional[str] = None, **kwargs) -> str:
    """
    将同步函数提交到异步队列，返回 task_id。

    Args:
        func:    要在后台执行的同步函数
        *args:   位置参数
        task_id: 可指定，默认自动生成 UUID
        **kwargs: 关键字参数

    Returns:
        task_id (str)
    """
    tid = task_id or str(uuid.uuid4())
    _task_store[tid] = {
        "task_id": tid,
        "status": TaskStatus.PENDING,
        "created_at": datetime.now().isoformat(),
        "started_at": None,
        "finished_at": None,
        "result": None,
        "error": None,
    }
    q = _get_queue()
    q.put_nowait((tid, func, args, kwargs))
    logger.info(f"[TaskQueue] 任务入队: {tid}, 队列长度: {q.qsize()}")
    return tid


def get_task_status(task_id: str) -> Optional[Dict[str, Any]]:
    """查询任务状态，不存在返回 None"""
    return _task_store.get(task_id)


def get_queue_length() -> int:
    """当前队列中待处理任务数"""
    q = _get_queue()
    return q.qsize()


def _update_task(task_id: str, **kwargs):
    if task_id in _task_store:
        _task_store[task_id].update(kwargs)
