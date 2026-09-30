"""``evaluation.*`` Celery 任务（RAG 清单 Phase 4 / D61）。

任务层是 ``run_service.execute_run`` 的薄包装：只负责开会话、兜异常、返回摘要。
编排逻辑放在 service 里，以便零基础设施单测。

**为什么独立队列**（``RAGF_CELERY_EVAL_QUEUE``，决策 3）：一次评估是 N 题 ×
（检索 + 生成 + Judge）的重任务，与摄取抢 worker 会拖慢用户可见的摄取。
"""

from __future__ import annotations

from typing import Any

from backend.src.app.evaluation.service.run_service import execute_run
from backend.src.app.task.celery import celery_app
from backend.src.common.log import log
from backend.src.database.db import async_db_session

__all__ = ['run_evaluation_task']


@celery_app.task(name='evaluation.run_dataset')
async def run_evaluation_task(run_id: str, plugin_namespace: str | None = None) -> dict[str, Any]:
    """执行一次评估（幂等：非 pending 的 run 直接跳过）。"""
    async with async_db_session() as db:
        try:
            return await execute_run(db, run_id=run_id, plugin_namespace=plugin_namespace)
        except Exception as exc:
            # 终态已由 execute_run 落库；这里只保证任务本身不以异常形式反复重投
            log.error('评估任务失败 run={} err={}', run_id, exc)
            return {'status': 'failed', 'error': f'{type(exc).__name__}: {exc}'}
