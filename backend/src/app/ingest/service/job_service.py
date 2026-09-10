"""摄取任务状态机服务（双管线摄取 spec D5，EagleRAG task/state 迁移）。

状态机：pending → running(stage: routing/rendering/embedding/indexing) → success/failed。

- ``*_with_db`` 变体在调用方事务内操作（任务首尾的主事务）；
- 普通变体自开短事务（任务长耗时阶段外的进度/日志推进，不占主事务）。

幂等桥接（``prepare_run``）：success 直接跳过（返回 False）；running（worker
重启重投递）允许回到 running 入口继续执行 —— 与 documents.status 的
claim 语义（IN_PROGRESS_STATUSES 冲突即拒）不同，job 行只做审计不做互斥。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from backend.src.app.ingest.crud import job_dao
from backend.src.common.log import log
from backend.src.database.db import async_db_session

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from backend.src.app.ingest.model import IngestJob

__all__ = ['JobService', 'job_service']

_LOG_CAP = 200  # 单 job 日志条数上限（超出丢最旧）


def _truncate_logs(logs: list, message: str) -> list:
    logs = [*logs, message]
    return logs[-_LOG_CAP:]


class JobService:
    """ingest_jobs 状态机。"""

    # ---------------- 调用方事务内 ----------------

    @staticmethod
    async def create_with_db(
        db: AsyncSession,
        *,
        job_id: str,
        document_id: str,
        kb_name: str,
        plugin_namespace: str,
        pipeline: str,
    ) -> IngestJob:
        return await job_dao.create(
            db,
            job_id=job_id,
            document_id=document_id,
            kb_name=kb_name,
            plugin_namespace=plugin_namespace,
            pipeline=pipeline,
        )

    @staticmethod
    async def prepare_run_with_db(db: AsyncSession, job_id: str, *, stage: str = 'rendering') -> bool:
        """任务入口桥接：success → False（跳过）；其余 → running（含重投递桥接）。"""
        job = await job_dao.get(db, job_id)
        if job is None:
            return True  # 行缺失（历史任务/手工派发）：视作可执行，执行方自行建行
        if (job.status or '').lower() == 'success':
            return False
        job.status = 'running'
        job.stage = stage
        job.error_message = None
        job.logs = _truncate_logs(list(job.logs or []), f'任务进入 running（stage={stage}）')
        await db.flush()
        return True

    @staticmethod
    async def mark_success_with_db(
        db: AsyncSession,
        job_id: str,
        *,
        current: int = 0,
        total: int = 0,
        message: str = '',
    ) -> None:
        job = await job_dao.get(db, job_id)
        if job is None:
            return
        job.status = 'success'
        job.stage = None
        job.progress_current = current
        job.progress_total = total
        job.logs = _truncate_logs(list(job.logs or []), message or '任务完成')
        await db.flush()

    @staticmethod
    async def mark_failed_with_db(db: AsyncSession, job_id: str, *, error: str) -> None:
        job = await job_dao.get(db, job_id)
        if job is None:
            return
        job.status = 'failed'
        job.error_message = (error or '')[:1000]
        job.logs = _truncate_logs(list(job.logs or []), f'任务失败: {error}')
        await db.flush()

    # ---------------- 自开短事务（长耗时阶段外推进） ----------------

    @staticmethod
    async def progress(job_id: str, *, stage: str, current: int = 0, total: int = 0) -> None:
        """推进阶段/进度（独立短事务；失败仅告警，不打断摄取主流程）。"""
        try:
            async with async_db_session.begin() as db:
                job = await job_dao.get(db, job_id)
                if job is None:
                    return
                job.status = 'running'
                job.stage = stage
                job.progress_current = current
                job.progress_total = total
        except Exception as exc:
            log.warning('摄取任务进度推进失败 job={}: {}', job_id, exc)

    @staticmethod
    async def append_log(job_id: str, message: str) -> None:
        """追加任务日志（独立短事务，非阻塞）。"""
        try:
            async with async_db_session.begin() as db:
                job = await job_dao.get(db, job_id)
                if job is not None:
                    job.logs = _truncate_logs(list(job.logs or []), message)
        except Exception as exc:
            log.warning('摄取任务日志写入失败 job={}: {}', job_id, exc)


job_service = JobService()
