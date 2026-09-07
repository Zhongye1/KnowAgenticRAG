import os
import urllib.parse

import celery
import celery_aio_pool

from celery.app import trace as celery_trace
from celery.signals import worker_process_init
from opentelemetry.instrumentation.celery import CeleryInstrumentor

from backend.src.app.task.tasks.beat import get_local_beat_schedule
from backend.src.common.enums import DataBaseType
from backend.src.common.observability.otel import init_resource, init_tracer
from backend.src.core.config import settings
from backend.src.core.path_conf import BASE_PATH

_celery_otel_initialized = False


@worker_process_init.connect(weak=False)
def init_celery_tracing(*args, **kwargs) -> None:
    """初始化 Celery 追踪"""
    global _celery_otel_initialized

    if not settings.GRAFANA_METRICS_ENABLE or _celery_otel_initialized:
        return

    resource = init_resource(settings.GRAFANA_CELERY_OTEL_SERVICE_NAME)
    init_tracer(resource)
    CeleryInstrumentor().instrument()
    _celery_otel_initialized = True


def find_task_packages() -> list[str]:
    """收集 Celery 任务包（ragf-design D10）。

    业务任务归属各域 ``app/<域>/tasks/tasks.py``（如 ``app/ingest/tasks/tasks.py``），
    框架任务保留在 ``app/task/tasks/``（含其子包）。两类都在 ``tasks.py`` 所在目录发现。
    """
    app_root = BASE_PATH / 'app'
    packages = []
    for root, _dirs, files in os.walk(app_root):
        if 'tasks.py' not in files:
            continue
        rel = os.path.relpath(root, app_root)
        basename = os.path.basename(root)
        is_domain_tasks = basename == 'tasks' and os.path.dirname(rel) not in {'', 'task'}
        is_framework_tasks = rel == os.path.join('task', 'tasks') or rel.startswith(
            os.path.join('task', 'tasks') + os.path.sep
        )
        if is_domain_tasks or is_framework_tasks:
            package = root.replace(str(BASE_PATH.parent) + os.path.sep, '').replace(os.path.sep, '.')
            packages.append(package)
    return sorted(packages)


def init_celery() -> celery.Celery:
    """初始化 Celery 应用"""

    # TODO: Update this work if celery version >= 6.0.0
    # https://github.com/fastapi-practices/fastapi-best-architecture/issues/321
    # https://github.com/celery/celery/issues/7874
    # celery 的懒加载属性对静态分析不可见，显式导入子模块后操作同一模块对象，行为不变
    celery_trace.build_tracer = celery_aio_pool.build_async_tracer
    celery_trace.reset_worker_optimizations()

    broker_url = f'amqp://{settings.CELERY_RABBITMQ_USERNAME}:{urllib.parse.quote(settings.CELERY_RABBITMQ_PASSWORD)}@{settings.CELERY_RABBITMQ_HOST}:{settings.CELERY_RABBITMQ_PORT}/{settings.CELERY_RABBITMQ_VHOST}'
    if settings.CELERY_BROKER == 'redis':
        broker_url = f'redis://:{urllib.parse.quote(settings.REDIS_PASSWORD)}@{settings.REDIS_HOST}:{settings.REDIS_PORT}/{settings.CELERY_BROKER_REDIS_DATABASE}'

    result_backend = f'db+postgresql+psycopg://{settings.DATABASE_USER}:{urllib.parse.quote(settings.DATABASE_PASSWORD)}@{settings.DATABASE_HOST}:{settings.DATABASE_PORT}/{settings.DATABASE_SCHEMA}'
    if DataBaseType.mysql == settings.DATABASE_TYPE:
        result_backend = result_backend.replace('postgresql+psycopg', 'mysql+pymysql')

    # RAGF（ragf-design §10/M8）：ingest.* 可单独分配队列（演进期拆分演练）。
    # 默认沿用默认队列（celery），单 worker 拓扑与既有行为不变；显式设置
    # RAGF_CELERY_INGEST_QUEUE 后任务入独立队列，由 -Q ingest 的
    # ragf_celery_ingest_worker（compose profile ragf-ingest）消费。
    task_routes: dict[str, dict[str, str]] | None = None
    if settings.RAGF_CELERY_INGEST_QUEUE:
        task_routes = {'ingest.*': {'queue': settings.RAGF_CELERY_INGEST_QUEUE}}

    # https://docs.celeryq.dev/en/stable/userguide/configuration.html
    app = celery.Celery(
        'fba_celery',
        broker_url=broker_url,
        broker_connection_retry_on_startup=True,
        result_backend=result_backend,
        result_extended=True,
        task_routes=task_routes,
        database_engine_options={'echo': settings.DATABASE_ECHO},
        # result_expires=0,
        # beat_sync_every=1,
        beat_schedule=get_local_beat_schedule(),
        beat_scheduler='backend.src.app.task.utils.schedulers:DatabaseScheduler',
        task_cls='backend.src.app.task.tasks.base:TaskBase',
        task_track_started=True,
        enable_utc=False,
        timezone=settings.DATETIME_TIMEZONE,
        worker_send_task_events=True,
        task_send_sent_event=True,
    )

    # 在 Celery 中设置此参数无效
    # 参数：https://github.com/celery/celery/issues/7270
    app.loader.override_backends = {'db': 'backend.src.app.task.database:DatabaseBackend'}

    # 自动发现任务
    packages = find_task_packages()
    app.autodiscover_tasks(packages)

    return app


# 创建 Celery 实例
celery_app: celery.Celery = init_celery()
