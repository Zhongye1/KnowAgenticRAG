"""ingest.* Celery 任务（ragf-design D6/D10；双管线摄取 spec D4/D5）。

``ingest.process_document`` 为路由入口：plan（路由规划）→ legacy 就地执行 /
knowhere·visual 派发下游（ingest_jobs.job_id = Celery task_id）。失败分阶段落
``parsing_failed / indexing_failed / failed``（D3），重试入口 = 重新入队同一
``(document_id, version_id)``（幂等全量替换，§5.4/§6.3）。
"""

from __future__ import annotations

from typing import Any

from backend.src.app.ingest.service.ingest_service import IngestService, plan_document_pipelines

# knowhere.* / visual.* 任务模块须随 tasks.py 一并被 celery autodiscover 导入注册
from backend.src.app.ingest.tasks.knowhere import knowhere_parse_task  # ruff: ignore[unused-import]
from backend.src.app.ingest.tasks.metrics import record_ingest_result
from backend.src.app.ingest.tasks.visual import visual_parse_task  # ruff: ignore[unused-import]
from backend.src.app.task.celery import celery_app
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.database.db import async_db_session

__all__ = ['process_document_task', 'reconcile_scan_task']

# 下游任务名（spec D4）：队列路由见 app/task/celery.py task_routes
_DOWNSTREAM_TASKS = {
    'knowhere': 'knowhere.parse_document',
    'visual': 'visual.parse_document',
}


@celery_app.task(name='ingest.process_document')
async def process_document_task(
    document_id: str,
    kb_name: str,
    plugin_namespace: str | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """摄取单篇文档：路由规划 → 派发 knowhere/visual 管线（幂等：全量替换）。"""
    try:
        pipelines = await plan_document_pipelines(document_id, kb_name, plugin_namespace)
    except errors.ConflictError:
        record_ingest_result('in_progress')
        return {'document_id': document_id, 'status': 'in_progress', 'error': '文档摄取中，跳过重复任务'}
    except errors.NotFoundError as exc:
        log.warning('摄取任务目标不存在: {}', exc)
        record_ingest_result('skipped')
        return {'document_id': document_id, 'status': 'skipped', 'error': str(exc)}
    except Exception as exc:
        log.error('摄取路由阶段异常 doc={} kb={}: {}', document_id, kb_name, exc)
        await _mark_failed(document_id, kb_name, plugin_namespace, 'failed', f'{type(exc).__name__}: {exc}')
        record_ingest_result('failed')
        return {'document_id': document_id, 'status': 'failed', 'error': str(exc)}

    return await _dispatch_pipelines(document_id, kb_name, plugin_namespace, pipelines, params)


async def _dispatch_pipelines(
    document_id: str,
    kb_name: str,
    plugin_namespace: str | None,
    pipelines: list[str],
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """创建 ingest_jobs 审计行（事务内）→ 事务提交后派发下游（job_id = task_id）。"""
    from uuid import uuid4

    from backend.src.app.ingest.service.job_service import job_service
    from backend.src.app.kb.utils.namespace import instance_namespace

    ns = instance_namespace(plugin_namespace)
    plan: list[dict[str, str]] = []
    try:
        async with async_db_session.begin() as db:
            for pipeline in pipelines:
                task_name = _DOWNSTREAM_TASKS.get(pipeline)
                if task_name is None:
                    log.warning('未知管线 {}，跳过派发 doc={}', pipeline, document_id)
                    continue
                job_id = uuid4().hex
                await job_service.create_with_db(
                    db,
                    job_id=job_id,
                    document_id=document_id,
                    kb_name=kb_name,
                    plugin_namespace=ns,
                    pipeline=pipeline,
                )
                plan.append({'job_id': job_id, 'pipeline': pipeline, 'task': task_name})
    except Exception as exc:
        log.error('摄取任务建审计行失败 doc={} kb={}: {}', document_id, kb_name, exc)
        await _mark_failed(document_id, kb_name, plugin_namespace, 'failed', f'{type(exc).__name__}: {exc}')
        record_ingest_result('failed')
        return {'document_id': document_id, 'status': 'failed', 'error': str(exc)}

    # 事务已提交再派发：下游任务能立即看到 job 行
    for item in plan:
        celery_app.send_task(
            item['task'],
            kwargs={
                'document_id': document_id,
                'kb_name': kb_name,
                'plugin_namespace': ns,
                'params': params,
            },
            task_id=item['job_id'],
        )
    record_ingest_result('dispatched')
    log.info('双管线派发完成 doc={} kb={} pipelines={}', document_id, kb_name, [item['pipeline'] for item in plan])
    return {
        'document_id': document_id,
        'status': 'dispatched',
        'pipelines': [item['pipeline'] for item in plan],
        'job_ids': [item['job_id'] for item in plan],
    }


@celery_app.task(name='ingest.reconcile')
async def reconcile_scan_task(
    kb_name: str | None = None,
    plugin_namespace: str | None = None,
    max_discrepancies: int = 50,
) -> dict[str, Any]:
    """摄取一致性对账（ragf-design §14.7/M7，celery beat 周期触发）。

    只读扫描 ``ready`` 文档三方计数（声明 chunk_count / PG chunks / Milvus
    向量），异常项重新投递 ``ingest.process_document``（幂等全量替换，§5.4）。
    队列不是事实源 —— PG 始终是唯一 Owner。
    """
    report: dict[str, Any] = {}
    try:
        async with async_db_session.begin() as db:
            report = await IngestService.reconcile_scan(
                db,
                kb_name=kb_name,
                plugin_namespace=plugin_namespace,
                max_discrepancies=max_discrepancies,
            )
    except Exception as exc:
        log.error('摄取对账扫描异常: {}', exc)
        return {'error': f'{type(exc).__name__}: {exc}', 'checked': 0, 'anomaly_count': 0, 'redispatched': 0}
    redispatch = 0
    for anomaly in report.get('anomalies') or []:
        try:
            celery_app.send_task(
                'ingest.process_document',
                kwargs={
                    'document_id': anomaly['document_id'],
                    'kb_name': anomaly['kb_name'],
                    'plugin_namespace': anomaly['plugin_namespace'],
                },
            )
            redispatch += 1
        except Exception as exc:
            log.error('对账重派失败 doc={} kb={}: {}', anomaly['document_id'], anomaly['kb_name'], exc)
    log.info(
        '摄取对账完成 kb_count={} checked={} anomalies={} redispatched={}',
        report.get('kb_count', 0),
        report.get('checked', 0),
        report.get('anomaly_count', 0),
        redispatch,
    )
    return {**report, 'redispatched': redispatch}


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
                db=db,
                document_id=document_id,
                kb_name=kb_name,
                plugin_namespace=plugin_namespace,
                status=status,
                message=message,
            )
    except Exception as exc:
        log.error('落失败态失败 doc={}: {}', document_id, exc)
