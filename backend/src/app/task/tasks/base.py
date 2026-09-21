import asyncio

from typing import Any

from celery import Task
from sqlalchemy.exc import SQLAlchemyError

from backend.src.common.log import log
from backend.src.common.socketio.actions import task_notification
from backend.src.core.config import settings


class TaskBase(Task):
    """Celery 任务基类"""

    autoretry_for = (SQLAlchemyError,)
    max_retries = settings.CELERY_TASK_MAX_RETRIES

    async def before_start(self, task_id: str, args, kwargs) -> None:  # ruff:ignore[missing-type-function-argument]
        """
        任务开始前执行钩子

        :param task_id: 任务 ID
        :return:
        """
        await task_notification(msg=f'任务 {task_id} 开始执行')

    async def on_success(self, retval: Any, task_id: str, args, kwargs) -> None:  # ruff:ignore[missing-type-function-argument]
        """
        任务成功后执行钩子

        :param retval: 任务返回值
        :param task_id: 任务 ID
        :return:
        """
        await task_notification(msg=f'任务 {task_id} 执行成功')

    def on_failure(self, exc: Exception, task_id: str, args, kwargs, einfo) -> None:  # ruff:ignore[missing-type-function-argument]
        """
        任务失败后执行钩子

        :param exc: 异常对象
        :param task_id: 任务 ID
        :param einfo: 异常信息
        :return:
        """
        # 通知是旁路：这里**绝不能**抛异常。celery_aio_pool 在任务体抛错后于
        # on_error 里回调本钩子，此时（同步上下文）没有运行中的事件循环，
        # 原写法 asyncio.create_task 会抛 RuntimeError('no running event loop')，
        # 把任务真正的失败原因整个盖掉——线上只看到「no running event loop」。
        try:
            asyncio.run(task_notification(msg=f'任务 {task_id} 执行失败'))
        except Exception as e:
            log.error('任务失败通知发送失败 task_id={}: {}', task_id, e)
