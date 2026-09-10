"""knowhere.* Celery 任务（双管线摄取 spec D1/D4，独立队列 knowhere）。

任务名 ``knowhere.parse_document``；派发方把 ingest_jobs.job_id 设为 Celery
task_id，任务体经 ``KnowhereIngestService.run_document_parse`` 执行（内含
分段事务与 job 状态机）。失败语义由服务层落库（parsing_failed/indexing_failed），
不自动重试 —— reconcile / rebuild 是重试入口。
"""

from __future__ import annotations

from typing import Any

from backend.src.app.ingest.service.knowhere_service import knowhere_ingest_service
from backend.src.app.task.celery import celery_app
from backend.src.common.exception import errors
from backend.src.common.log import log

__all__ = ['knowhere_parse_task']


@celery_app.task(name='knowhere.parse_document', bind=True)
async def knowhere_parse_task(
    self: Any,
    document_id: str,
    kb_name: str,
    plugin_namespace: str | None = None,
    job_id: str | None = None,
) -> dict[str, Any]:
    """Knowhere 管线摄取任务（job_id = ingest_jobs 主键 = Celery task id）。"""
    from backend.src.app.ingest.tasks.metrics import record_ingest_result

    effective_job = job_id or str(self.request.id)
    try:
        result = await knowhere_ingest_service.run_document_parse(
            document_id=document_id,
            kb_name=kb_name,
            plugin_namespace=plugin_namespace,
            job_id=effective_job,
        )
    except errors.NotFoundError as exc:
        # 文档/KB 在派发间隙被删除：job 显式失败，不留悬挂 pending
        record_ingest_result('skipped')
        log.warning('Knowhere 任务目标不存在 doc={}: {}', document_id, exc)
        return {'document_id': document_id, 'status': 'skipped', 'error': str(exc)}
    record_ingest_result(str(result.get('status') or 'ready'))
    return result
