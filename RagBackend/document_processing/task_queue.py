"""
task_queue.py — 上传任务队列（Redis Stream 持久化版）

架构设计（三层解耦）：
  上传接收层  →  Redis Stream 事件总线  →  任务处理层（Worker）

核心优势：
  1. 上传接口只做「文件接收 + 入队」，毫秒级返回 task_id
  2. 任务 100% 持久化到 Redis Stream，服务重启/崩溃不丢任务
  3. 消费者组模式，支持 XACK 确认，未确认任务自动 XPENDING 重试
  4. 任务状态落盘 Redis Hash，前端可轮询 /api/vectorize/status/{task_id}
  5. 降级策略：Redis 不可用时自动退回内存队列（兼容无 Redis 环境）

依赖：redis-py（异步客户端 redis.asyncio），无需 Celery
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Redis 配置（从环境变量读取，容器内走 ragf-net 内网）────────────
REDIS_URL  = os.environ.get("REDIS_URL", "redis://redis:6379/0")
STREAM_KEY = "rag:upload:tasks"           # Redis Stream 名称
GROUP_NAME = "rag-worker-group"           # 消费者组名称
CONSUMER   = "worker-0"                   # 单 Worker 消费者名称

# ── 任务状态枚举 ──────────────────────────────────────────────────
class TaskStatus:
    PENDING  = "pending"   # 排队等待
    RUNNING  = "running"   # 正在处理
    DONE     = "done"      # 完成
    FAILED   = "failed"    # 失败


# ── Redis 客户端（延迟初始化，服务启动后才创建）─────────────────────
_redis_client = None
_redis_available = False


async def _get_redis():
    """获取 Redis 异步客户端，首次调用时初始化"""
    global _redis_client, _redis_available
    if _redis_client is not None:
        return _redis_client if _redis_available else None
    try:
        import redis.asyncio as aioredis
        client = aioredis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=2)
        await client.ping()
        _redis_client = client
        _redis_available = True
        logger.info("[TaskQueue] Redis 连接成功: %s", REDIS_URL)
        return client
    except Exception as e:
        _redis_available = False
        logger.warning("[TaskQueue] Redis 不可用，降级为内存队列: %s", e)
        return None


async def _ensure_stream_group(r):
    """确保 Redis Stream 消费者组存在（幂等）"""
    try:
        await r.xgroup_create(STREAM_KEY, GROUP_NAME, id="0", mkstream=True)
    except Exception as e:
        if "BUSYGROUP" not in str(e):
            logger.warning("[TaskQueue] 创建消费者组异常: %s", e)


# ── 内存降级队列（Redis 不可用时使用）─────────────────────────────
_mem_queue: Optional[asyncio.Queue] = None
_mem_task_store: Dict[str, Dict[str, Any]] = {}
_MAX_CONCURRENCY = 2
_worker_started  = False


def _get_mem_queue() -> asyncio.Queue:
    global _mem_queue
    if _mem_queue is None:
        _mem_queue = asyncio.Queue()
    return _mem_queue


# ── 任务函数注册表（task_type → callable）────────────────────────
# Worker 从 Redis Stream 消费时，通过 task_type 查找对应的处理函数
_TASK_REGISTRY: Dict[str, Callable] = {}


def register_task(task_type: str, func: Callable):
    """注册任务处理函数，供 Worker 消费时调用"""
    _TASK_REGISTRY[task_type] = func
    logger.debug("[TaskQueue] 注册任务类型: %s -> %s", task_type, func.__name__)


# ── TraceID / 结构化日志工具 ──────────────────────────────────────
def _log(level: str, task_id: str, msg: str, **kwargs):
    """统一结构化日志格式，每条日志携带 trace_id 方便全链路追溯"""
    extra = " ".join(f"{k}={v}" for k, v in kwargs.items())
    getattr(logger, level)(
        "[TaskQueue] trace_id=%s %s %s", task_id, msg, extra
    )


# ── 任务状态持久化 ────────────────────────────────────────────────

async def _persist_status(task_id: str, **fields):
    """将任务状态写入 Redis Hash（key = rag:task:{task_id}），TTL 24h"""
    r = await _get_redis()
    if r:
        try:
            hash_key = f"rag:task:{task_id}"
            await r.hset(hash_key, mapping={k: str(v) for k, v in fields.items()})
            await r.expire(hash_key, 86400)  # 24 小时后自动过期
        except Exception as e:
            logger.warning("[TaskQueue] 状态持久化失败: %s", e)
    # 同时更新内存 store（用于降级场景查询）
    if task_id in _mem_task_store:
        _mem_task_store[task_id].update(fields)


async def _load_status(task_id: str) -> Optional[Dict[str, Any]]:
    """从 Redis Hash 读取任务状态，降级从内存读"""
    r = await _get_redis()
    if r:
        try:
            data = await r.hgetall(f"rag:task:{task_id}")
            if data:
                return data
        except Exception:
            pass
    return _mem_task_store.get(task_id)


# ── 核心 Worker ───────────────────────────────────────────────────

async def _redis_worker():
    """
    Redis Stream 消费者 Worker。
    使用 XREADGROUP 阻塞读取，XACK 确认，XPENDING 自动重试失败任务。
    最大并发受 _semaphore 控制（默认 2），避免向量化占满内存。
    """
    r = await _get_redis()
    if r is None:
        logger.warning("[TaskQueue] Redis 不可用，不启动 Redis Worker")
        return

    await _ensure_stream_group(r)
    semaphore = asyncio.Semaphore(_MAX_CONCURRENCY)
    logger.info("[TaskQueue] Redis Stream Worker 已启动，监听: %s", STREAM_KEY)

    while True:
        try:
            # 1. 先检查 PENDING（上次未 ACK 的任务，服务重启后自动重试）
            pending = await r.xpending_range(STREAM_KEY, GROUP_NAME, "-", "+", count=5)
            pending_ids: List[str] = [p["message_id"] for p in pending]

            # 2. 读取新消息（阻塞 1s）
            messages = await r.xreadgroup(
                GROUP_NAME, CONSUMER,
                {STREAM_KEY: ">"},
                count=5, block=1000
            )

            all_entries = []
            if pending_ids:
                # 将 pending 消息重新获取（XCLAIM，ownership 转给当前消费者）
                for pid in pending_ids:
                    try:
                        claimed = await r.xclaim(STREAM_KEY, GROUP_NAME, CONSUMER, 30000, [pid])
                        all_entries.extend(claimed)
                    except Exception:
                        pass

            if messages:
                for _stream, entries in messages:
                    all_entries.extend(entries)

            for msg_id, fields in all_entries:
                task_id   = fields.get("task_id", str(uuid.uuid4()))
                task_type = fields.get("task_type", "vectorize")
                task_args = fields.get("args", "{}")

                import json as _json
                try:
                    args_dict = _json.loads(task_args)
                except Exception:
                    args_dict = {}

                _log("info", task_id, "消费任务", task_type=task_type, msg_id=msg_id)

                async def _run(tid=task_id, ttype=task_type, kw=args_dict, mid=msg_id):
                    async with semaphore:
                        await _persist_status(tid, status=TaskStatus.RUNNING,
                                              started_at=datetime.now().isoformat())
                        try:
                            func = _TASK_REGISTRY.get(ttype)
                            if func is None:
                                raise ValueError(f"未注册的任务类型: {ttype}")
                            result = await asyncio.to_thread(func, **kw)
                            await _persist_status(tid, status=TaskStatus.DONE,
                                                  result=str(result),
                                                  finished_at=datetime.now().isoformat())
                            _log("info", tid, "任务完成")
                        except Exception as e:
                            await _persist_status(tid, status=TaskStatus.FAILED,
                                                  error=str(e),
                                                  finished_at=datetime.now().isoformat())
                            _log("error", tid, "任务失败", error=str(e))
                        finally:
                            # ACK：无论成功失败都 ACK，失败已记录到状态，不进无限重试循环
                            try:
                                await r.xack(STREAM_KEY, GROUP_NAME, mid)
                            except Exception:
                                pass

                asyncio.create_task(_run())

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning("[TaskQueue] Worker 循环异常（1s 后重试）: %s", e)
            await asyncio.sleep(1)


async def _mem_worker():
    """内存降级 Worker（Redis 不可用时使用）"""
    q   = _get_mem_queue()
    sem = asyncio.Semaphore(_MAX_CONCURRENCY)
    logger.info("[TaskQueue] 内存降级 Worker 已启动")
    while True:
        task_id, func, args, kwargs = await q.get()
        async with sem:
            _mem_task_store[task_id]["status"] = TaskStatus.RUNNING
            _mem_task_store[task_id]["started_at"] = datetime.now().isoformat()
            try:
                result = await asyncio.to_thread(func, *args, **kwargs)
                _mem_task_store[task_id].update(
                    status=TaskStatus.DONE, result=str(result),
                    finished_at=datetime.now().isoformat()
                )
                logger.info("[TaskQueue] 内存任务完成: %s", task_id)
            except Exception as e:
                _mem_task_store[task_id].update(
                    status=TaskStatus.FAILED, error=str(e),
                    finished_at=datetime.now().isoformat()
                )
                logger.error("[TaskQueue] 内存任务失败: %s — %s", task_id, e, exc_info=True)
        q.task_done()


# ── 公开 API ──────────────────────────────────────────────────────

async def ensure_worker_started():
    """
    在 FastAPI startup 事件中调用，启动 Worker 协程。
    优先使用 Redis Stream Worker，降级到内存 Worker。
    """
    global _worker_started
    if _worker_started:
        return
    _worker_started = True

    r = await _get_redis()
    if r:
        asyncio.create_task(_redis_worker())
        logger.info("[TaskQueue] Redis Stream Worker 任务已创建")
    else:
        asyncio.create_task(_mem_worker())
        logger.info("[TaskQueue] 内存降级 Worker 任务已创建")


async def enqueue_task(
    task_type: str,
    task_id: Optional[str] = None,
    **kwargs
) -> str:
    """
    将任务发布到 Redis Stream（或降级到内存队列）。

    Args:
        task_type: 已注册的任务类型（如 "vectorize"）
        task_id:   可指定，默认自动生成 UUID
        **kwargs:  传递给任务处理函数的参数（JSON 序列化后存入 Stream）

    Returns:
        task_id (str)
    """
    import json as _json
    tid = task_id or str(uuid.uuid4())

    # 初始化状态记录
    init_fields = {
        "task_id":    tid,
        "task_type":  task_type,
        "status":     TaskStatus.PENDING,
        "created_at": datetime.now().isoformat(),
        "started_at": "",
        "finished_at": "",
        "result":     "",
        "error":      "",
    }
    _mem_task_store[tid] = dict(init_fields)
    await _persist_status(tid, **init_fields)

    r = await _get_redis()
    if r:
        try:
            await r.xadd(STREAM_KEY, {
                "task_id":   tid,
                "task_type": task_type,
                "args":      _json.dumps(kwargs, ensure_ascii=False),
            })
            _log("info", tid, "任务已发布到 Redis Stream", task_type=task_type)
            return tid
        except Exception as e:
            logger.warning("[TaskQueue] Redis 发布失败，降级到内存队列: %s", e)

    # 降级：内存队列
    func = _TASK_REGISTRY.get(task_type)
    if func is None:
        raise ValueError(f"未注册的任务类型: {task_type}")
    q = _get_mem_queue()
    q.put_nowait((tid, func, [], kwargs))
    _log("info", tid, "任务已入内存降级队列", task_type=task_type)
    return tid


# ── 向后兼容：保留旧 create_task 接口（同步版，供老代码调用）────────
def create_task(func: Callable, *args, task_id: Optional[str] = None, **kwargs) -> str:
    """
    向后兼容接口（同步版）。
    新代码请使用 await enqueue_task(task_type, **kwargs)。
    """
    tid = task_id or str(uuid.uuid4())
    _mem_task_store[tid] = {
        "task_id":    tid,
        "status":     TaskStatus.PENDING,
        "created_at": datetime.now().isoformat(),
        "started_at":  None,
        "finished_at": None,
        "result":     None,
        "error":      None,
    }
    q = _get_mem_queue()
    q.put_nowait((tid, func, args, kwargs))
    logger.info("[TaskQueue] create_task (compat) 入队: %s", tid)
    return tid


async def get_task_status(task_id: str) -> Optional[Dict[str, Any]]:
    """查询任务状态（优先从 Redis 读，降级从内存读）"""
    return await _load_status(task_id)


def get_queue_length() -> int:
    """当前内存降级队列待处理任务数（Redis 场景下仅供参考）"""
    return _get_mem_queue().qsize()
