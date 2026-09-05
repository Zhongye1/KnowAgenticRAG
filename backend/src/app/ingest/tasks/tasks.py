"""ingest.* Celery 任务（ragf-design D6/D10：域内归属，查询同步、写入异步）。

单文档摄取任务：状态 claim → 编排 → 终态。失败分阶段落
``parsing_failed / indexing_failed / failed``（D3），重试入口 = 重新入队同一
``(document_id, version_id)``（幂等全量替换，§5.4/§6.3）。
"""

from __future__ import annotations

from typing import Any

from opentelemetry import metrics as otel_metrics

from backend.src.app.ingest.service.ingest_service import IngestService, IngestStepError
from backend.src.app.task.celery import celery_app
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.database.db import async_db_session

__all__ = ['process_document_task']

_INGEST_METER = otel_metrics.get_meter('backend.ragf')
_INGEST_RESULTS = _INGEST_METER.create_counter(
    'ragf.ingest.documents',
    unit='1',
    description='文档摄取终态计数（status=ready/parsing_failed/indexing_failed/failed/...）',
)


def _record_ingest_result(status: str) -> None:
    """终态计数（ragf-design §14.13：任务失败率可观测）。"""
    _INGEST_RESULTS.add(1, {'status': status})


@celery_app.task(name='ingest.process_document')
async def process_document_task(
    document_id: str,
    kb_name: str,
    plugin_namespace: str | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """摄取单篇文档（幂等：同 document_id+版本全量替换）。"""
    try:
        async with async_db_session.begin() as db:
            result = await IngestService.run_document_ingest(
                db,
                document_id=document_id,
                kb_name=kb_name,
                plugin_namespace=plugin_namespace,
                params=params,
            )
            _record_ingest_result(str(result.get('status') or 'ready'))
            return result
    except IngestStepError as exc:
        await _mark_failed(document_id, kb_name, plugin_namespace, exc.status, str(exc))
        _record_ingest_result(exc.status)
        return {'document_id': document_id, 'status': exc.status, 'error': str(exc)}
    except errors.ConflictError:
        _record_ingest_result('in_progress')
        return {'document_id': document_id, 'status': 'in_progress', 'error': '文档摄取中，跳过重复任务'}
    except errors.NotFoundError as exc:
        log.warning('摄取任务目标不存在: {}', exc)
        _record_ingest_result('skipped')
        return {'document_id': document_id, 'status': 'skipped', 'error': str(exc)}
    except Exception as exc:
        log.error('摄取任务异常 doc={} kb={}: {}', document_id, kb_name, exc)
        await _mark_failed(document_id, kb_name, plugin_namespace, 'failed', f'{type(exc).__name__}: {exc}')
        _record_ingest_result('failed')
        return {'document_id': document_id, 'status': 'failed', 'error': str(exc)}


async def _mark_failed(
    document_id: str,
    kb_name: str,
    plugin_namespace: str | None,
    status: str,
    message: str,
) -> None:
    """独立事务落失败态（原事务已回滚）。"""
    try:
        async with async_db_session.begin() as db:
            await IngestService.mark_failed(
                db,
                document_id=document_id,
                kb_name=kb_name,
                plugin_namespace=plugin_namespace,
                status=status,
                message=message,
            )
    except Exception as exc:
        log.error('落失败态失败 doc={}: {}', document_id, exc)
