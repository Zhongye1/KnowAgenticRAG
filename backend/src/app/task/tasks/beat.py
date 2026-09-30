from typing import Any

from celery.schedules import schedule

from backend.src.app.task.utils.tzcrontab import TzAwareCrontab


def get_local_beat_schedule() -> dict[str, dict[str, Any]]:
    """获取本地 Celery beat 任务配置"""
    # 参考：https://docs.celeryq.dev/en/stable/userguide/periodic-tasks.html
    return {
        'RAGF 摄取一致性对账': {
            'task': 'ingest.reconcile',
            'schedule': TzAwareCrontab('30', '*'),
        },
        'ACL 巡检：过期清理与 Milvus 镜像对账': {
            'task': 'kb.acl_reconcile',
            'schedule': TzAwareCrontab('0', '*'),
        },
        # Run 对账（agent 层设计 §4.1）：Celery 消息会丢、worker 会崩，两者的兜底都在这里。
        # 用 schedule(120) 而不是 crontab：对账的价值在于「尽快」，不需要对齐整点。
        'Agent Run 对账：租约过期收敛与投递兜底': {
            'task': 'agent.reconcile_waiting',
            'schedule': schedule(120),
        },
        '测试同步任务': {
            'task': 'task_demo',
            'schedule': schedule(30),
        },
        '测试异步任务': {
            'task': 'task_demo_async',
            'schedule': TzAwareCrontab('1'),
        },
        '测试传参任务': {
            'task': 'task_demo_params',
            'schedule': TzAwareCrontab('1'),
            'args': ['你好，'],
            'kwargs': {'world': '世界'},
        },
        '清理操作日志': {
            'task': 'backend.src.app.task.tasks.db_log.tasks.delete_db_opera_log',
            'schedule': TzAwareCrontab('0', '0', day_of_week='6'),
        },
        '清理登录日志': {
            'task': 'backend.src.app.task.tasks.db_log.tasks.delete_db_login_log',
            'schedule': TzAwareCrontab('0', '0', day_of_month='15'),
        },
    }
