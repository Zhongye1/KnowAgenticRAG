"""visual.* Celery 任务（双管线摄取 spec D4/D7，独立队列 visual，并发=1）。

任务名 ``visual.parse_document``：PixelRAG 渲染切片 → 视觉编码 → MinIO tile 图
+ ragf_visual 向量。任务体经 ``VisualIngestService.run_document_parse`` 执行
（内含分段事务与 job 状态机），失败语义由服务层落库。
"""

from __future__ import annotations

from typing import Any

from backend.src.app.ingest.service.visual_service import visual_ingest_service
from backend.src.app.task.celery import celery_app
from backend.src.common.exception import errors
from backend.src.common.log import log

__all__ = ['visual_parse_task']


@celery_app.task(name='visual.parse_document', bind=True)
async def visual_parse_task(
    self: Any,
    document_id: str,
    kb_name: str,
    plugin_namespace: str | None = None,
    job_id: str | None = None,
) -> dict[str, Any]:
    """视觉管线摄取任务（job_id = ingest_jobs 主键 = Celery task id）。"""
    from backend.src.app.ingest.tasks.metrics import record_ingest_result

    effective_job = job_id or str(self.request.id)
    try:
        result = await visual_ingest_service.run_document_parse(
            document_id=document_id,
            kb_name=kb_name,
            plugin_namespace=plugin_namespace,
            job_id=effective_job,
        )
    except errors.NotFoundError as exc:
        record_ingest_result('skipped')
        log.warning('视觉任务目标不存在 doc={}: {}', document_id, exc)
        return {'document_id': document_id, 'status': 'skipped', 'error': str(exc)}
    record_ingest_result(str(result.get('status') or 'ready'))
    return result
