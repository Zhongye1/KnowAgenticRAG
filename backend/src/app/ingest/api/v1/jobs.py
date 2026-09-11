"""摄取任务审计 API（双管线摄取 spec D5：细粒度进度查询）。"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path

from backend.src.app.ingest.crud import job_dao
from backend.src.app.ingest.schema.job import IngestJobItem
from backend.src.app.kb.deps import CurrentNamespace
from backend.src.app.kb.utils.permissions import RAG_KB_LIST
from backend.src.common.exception import errors
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.database.db import CurrentSessionTransaction

router = APIRouter(dependencies=[DependsJwtAuth])

_PERM_LIST = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_LIST)), DependsRBAC]


@router.get(
    '/{kb_name}/documents/{document_id}/jobs',
    summary='文档摄取任务列表（细粒度进度，spec D5）',
    dependencies=_PERM_LIST,
)
async def list_document_jobs(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
    document_id: Annotated[str, Path(description='文档 ID')],
) -> ResponseSchemaModel[list[IngestJobItem]]:
    jobs = await job_dao.list_by_document(
        db,
        document_id,
        kb_name=kb_name,
        plugin_namespace=current_namespace,
    )
    return response_base.success(
        data=[
            IngestJobItem(
                job_id=job.job_id,
                document_id=job.document_id,
                kb_name=job.kb_name,
                plugin_namespace=job.plugin_namespace,
                pipeline=job.pipeline,
                status=job.status,
                stage=job.stage,
                progress_current=job.progress_current,
                progress_total=job.progress_total,
                error_message=job.error_message,
                logs=job.logs or [],
                created_time=job.created_time,
                updated_time=job.updated_time,
            )
            for job in jobs
        ]
    )


@router.get(
    '/{kb_name}/documents/{document_id}/jobs/{job_id}',
    summary='摄取任务详情',
    dependencies=_PERM_LIST,
)
async def get_document_job(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识')],
    document_id: Annotated[str, Path(description='文档 ID')],
    job_id: Annotated[str, Path(description='任务 ID')],
) -> ResponseSchemaModel[IngestJobItem]:
    job = await job_dao.get(db, job_id)
    if job is None or job.document_id != document_id or job.kb_name != kb_name:
        raise errors.NotFoundError(msg='摄取任务不存在')
    return response_base.success(
        data=IngestJobItem(
            job_id=job.job_id,
            document_id=job.document_id,
            kb_name=job.kb_name,
            plugin_namespace=job.plugin_namespace,
            pipeline=job.pipeline,
            status=job.status,
            stage=job.stage,
            progress_current=job.progress_current,
            progress_total=job.progress_total,
            error_message=job.error_message,
            logs=job.logs or [],
            created_time=job.created_time,
            updated_time=job.updated_time,
        )
    )
