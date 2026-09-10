"""摄取任务审计 CRUD（双管线摄取 spec D5）。"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.ingest.model import IngestJob

__all__ = ['JobDao', 'job_dao']


class JobDao:
    """ingest_jobs 数据库操作。"""

    async def get(self, db: AsyncSession, job_id: str) -> IngestJob | None:
        stmt = select(IngestJob).where(IngestJob.job_id == job_id)
        return (await db.execute(stmt)).scalars().first()

    async def list_by_document(
        self,
        db: AsyncSession,
        document_id: str,
        *,
        kb_name: str | None = None,
        plugin_namespace: str | None = None,
    ) -> list[IngestJob]:
        stmt = select(IngestJob).where(IngestJob.document_id == document_id)
        if kb_name:
            stmt = stmt.where(IngestJob.kb_name == kb_name)
        if plugin_namespace:
            stmt = stmt.where(IngestJob.plugin_namespace == plugin_namespace)
        stmt = stmt.order_by(IngestJob.created_time.desc())
        return list((await db.execute(stmt)).scalars().all())

    async def create(
        self,
        db: AsyncSession,
        *,
        job_id: str,
        document_id: str,
        kb_name: str,
        plugin_namespace: str,
        pipeline: str,
    ) -> IngestJob:
        job = IngestJob(
            job_id=job_id,
            document_id=document_id,
            kb_name=kb_name,
            plugin_namespace=plugin_namespace,
            pipeline=pipeline,
            status='pending',
        )
        db.add(job)
        await db.flush()
        return job


job_dao = JobDao()
