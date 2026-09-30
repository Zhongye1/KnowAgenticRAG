"""Run 队列通道：派发 / 取消 / 事件流（agent 层设计 §4.1、§4.7；D66、D89）。

**分工必须先说清楚**——本模块碰的三件事全部是「丢了也不影响正确性」的：

| 通道 | 载体 | 丢了会怎样 |
| ---- | ---- | ---------- |
| 派发 | Celery（``agent`` 队列） | Run 停在 ``queued``，由 ``agent.reconcile_waiting`` 兜底重投 |
| 取消 | Redis key + pub/sub | 取消晚生效，租约到期/下一次心跳仍会收敛 |
| 事件 | Redis Stream（TTL 1h） | 客户端拿不到过程帧，终态仍可从 ``agent_runs.result`` 读到 |

状态机、租约、终态**只认 PostgreSQL**（D66）。把 Redis 当事实源是这类系统最常见的
错误来源：Redis 一重启，「谁在跑」「跑完没有」就全错，且没有任何对账能修回来。

事件用 **Redis Stream** 而不是 List（D89 写的是 List）：两者都能全量重放，但 Stream
的 entry id 天然是单调游标，``XRANGE (id +`` 就是「从上次断点继续」，客户端断线重连
时直接把它当 SSE 的 ``id:`` 字段回传即可，不需要自己造 seq 与保序。TTL 仍是 1h——
超 TTL 的进行中内容不可补齐是**有意的成本取舍**（D89）。
"""

from __future__ import annotations

import json

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from backend.src.app.task.celery import celery_app
from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.redis import redis_client

if TYPE_CHECKING:
    from collections.abc import Mapping

    from redis.asyncio.client import PubSub

__all__ = [
    'CELERY_RECONCILE_TASK',
    'CELERY_RESUME_TASK',
    'CELERY_RUN_TASK',
    'RunEvent',
    'RunQueueService',
    'get_run_queue_service',
]

#: Celery 任务名（与 ``app/agent/tasks/tasks.py`` 的注册名一一对应）
CELERY_RUN_TASK = 'agent.run'
CELERY_RESUME_TASK = 'agent.resume'
CELERY_RECONCILE_TASK = 'agent.reconcile_waiting'

#: Stream 单次读取上限（重放是分页的，避免一次拉回整条流）
READ_BATCH = 200


@dataclass(frozen=True)
class RunEvent:
    """一条 Run 事件（``entry_id`` 即重放游标，可直接做 SSE 的 ``id:``）。"""

    entry_id: str
    event: str
    data: dict[str, Any]


class RunQueueService:
    """Run 的三条 Redis 通道（无状态，可随时重建）。"""

    def __init__(self, prefix: str | None = None) -> None:
        self.prefix = str(prefix or settings.RAGF_AGENT_REDIS_PREFIX).rstrip(':')

    # ------------------------------------------------------------------ 键
    def cancel_key(self, run_id: str) -> str:
        return f'{self.prefix}:cancel:{run_id}'

    def cancel_channel(self, run_id: str) -> str:
        return f'{self.prefix}:cancel:{run_id}:ch'

    def event_key(self, run_id: str) -> str:
        return f'{self.prefix}:events:{run_id}'

    # ------------------------------------------------------------------ 派发
    def dispatch(self, run_id: str, *, attempt_no: int = 1, task: str = CELERY_RUN_TASK) -> None:
        """把 Run 投给 ``agent`` 队列（失败**不吞**：调用方决定重试还是报错）。

        只投 ``run_id``：参数快照在 ``agent_runs.payload``，broker 里不放业务数据
        （消息体越小越不容易触发 broker 上限，也避免「消息里有旧参数」这类漂移）。
        """
        celery_app.send_task(task, kwargs={'run_id': run_id, 'attempt_no': int(attempt_no)})
        log.info('agent Run 已投递 task={} run_id={} attempt={}', task, run_id, attempt_no)

    def dispatch_best_effort(self, run_id: str, *, attempt_no: int = 1, task: str = CELERY_RUN_TASK) -> bool:
        """投递但不抛：失败留给 ``agent.reconcile_waiting`` 兜底重投。

        用在「已经写完事实」的路径上（收尾唤醒队头、取消排队中的 Run）：这些路径
        的正确性已经落库，broker 抖动不该把它们变成 500。
        """
        try:
            self.dispatch(run_id, attempt_no=attempt_no, task=task)
        except Exception as exc:
            log.warning('agent Run 投递失败，等对账兜底 run_id={} err={}', run_id, exc)
            return False
        return True

    # ------------------------------------------------------------------ 取消
    async def request_cancel(self, run_id: str) -> None:
        """置取消标记并广播（标记有 TTL：取消是**一次性信号**，不是持久状态）。

        持久状态是 ``agent_runs.status='cancel_requested'``；Redis 这份只是为了让
        worker 不用轮询数据库就能秒级感知。因此 TTL 到点自动消失是正确行为。
        """
        ttl = int(settings.RAGF_AGENT_CANCEL_TTL_SECONDS)
        await redis_client.set(self.cancel_key(run_id), '1', ex=ttl)
        await redis_client.publish(self.cancel_channel(run_id), 'cancel')
        log.info('agent Run 收到取消请求 run_id={}', run_id)

    async def is_cancel_requested(self, run_id: str) -> bool:
        return bool(await redis_client.exists(self.cancel_key(run_id)))

    async def clear_cancel(self, run_id: str) -> None:
        """终态收尾后清标记：否则同 id 复用（不会发生）或重试会造成误取消。"""
        await redis_client.delete(self.cancel_key(run_id))

    async def subscribe_cancel(self, run_id: str) -> PubSub:
        """订阅取消通道（调用方负责 ``aclose``）。"""
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(self.cancel_channel(run_id))
        return pubsub

    # ------------------------------------------------------------------ 事件流
    async def append_event(self, run_id: str, event: str, data: Mapping[str, Any] | None = None) -> str:
        """追加一条 D25 事件，返回 Stream entry id（= 重放游标）。

        ``maxlen`` 近似裁剪：单次 Run 的事件量有界（护栏封顶步数），设上限只为
        防御异常长流，正常 Run 不会触发裁剪。
        """
        key = self.event_key(run_id)
        entry_id = await redis_client.xadd(
            key,
            {'event': str(event), 'data': json.dumps(dict(data or {}), ensure_ascii=False)},
            maxlen=int(settings.RAGF_AGENT_EVENT_MAX),
            approximate=True,
        )
        await redis_client.expire(key, int(settings.RAGF_AGENT_EVENT_TTL_SECONDS))
        return str(entry_id)

    async def read_events(self, run_id: str, *, after: str | None = None, count: int = READ_BATCH) -> list[RunEvent]:
        """读事件：``after=None`` 从 0 全量重放，否则从该游标之后继续（D89）。"""
        start = f'({after}' if after else '-'
        # 显式标 Any：redis-py 的异步重载在类型存根里推断成 None，直接解包会被 pyright 拦下
        rows: Any = await redis_client.xrange(self.event_key(run_id), min=start, max='+', count=int(count))
        events: list[RunEvent] = []
        for entry_id, fields in rows:
            raw = fields.get('data') or '{}'
            try:
                data = json.loads(raw)
            except (TypeError, ValueError):
                data = {}
            events.append(
                RunEvent(
                    entry_id=str(entry_id),
                    event=str(fields.get('event') or ''),
                    data=data if isinstance(data, dict) else {},
                )
            )
        return events

    async def event_count(self, run_id: str) -> int:
        return int(await redis_client.xlen(self.event_key(run_id)))

    async def clear_events(self, run_id: str) -> None:
        await redis_client.delete(self.event_key(run_id))


_service: RunQueueService | None = None


def get_run_queue_service() -> RunQueueService:
    """模块级单例（与各域 ``get_xxx_service`` 同约定）。"""
    global _service
    if _service is None:
        _service = RunQueueService()
    return _service
