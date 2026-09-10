"""visual.* Celery 任务（双管线摄取 spec D4/D7，独立队列 visual，并发=1）。

P1 为占位实现：路由/派发链路已通，任务体显式失败（fail-closed，不留悬挂
pending），P2 接入 pixelrag render→tiles→embed→ragf_visual 真实管线。
"""

from __future__ import annotations

from typing import Any

from backend.src.app.task.celery import celery_app
from backend.src.common.log import log

__all__ = ['visual_parse_task']

_NOT_IMPLEMENTED = 'visual 管线尚未接入（P2：pixelrag_build）'


@celery_app.task(name='visual.parse_document', bind=True)
async def visual_parse_task(
    self: Any,
    document_id: str,
    kb_name: str,
    plugin_namespace: str | None = None,
    job_id: str | None = None,
) -> dict[str, Any]:
    """视觉管线任务占位：job 与文档显式落失败态。"""
    from backend.src.app.ingest.service.job_service import job_service
    from backend.src.app.ingest.tasks.metrics import record_ingest_result
    from backend.src.app.kb.crud import document_dao
    from backend.src.app.kb.utils.namespace import instance_namespace
    from backend.src.database.db import async_db_session

    effective_job = job_id or str(self.request.id)
    log.warning('visual 管线占位任务被调用 doc={} kb={}', document_id, kb_name)
    try:
        async with async_db_session.begin() as db:
            await job_service.mark_failed_with_db(db, effective_job, error=_NOT_IMPLEMENTED)
            doc = await document_dao.get(
                db,
                document_id,
                kb_name=kb_name,
                plugin_namespace=instance_namespace(plugin_namespace),
            )
            if doc is not None:
                doc.status = 'failed'
                doc.error_message = _NOT_IMPLEMENTED
                await db.flush()
    except Exception as exc:
        log.error('visual 占位任务落失败态失败 doc={}: {}', document_id, exc)
    record_ingest_result('failed')
    return {'document_id': document_id, 'status': 'failed', 'error': _NOT_IMPLEMENTED}
