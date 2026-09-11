"""摄取任务审计 DTO（双管线摄取 spec D5）。"""

from datetime import datetime
from typing import Any

from backend.src.common.schema import SchemaBase
from pydantic import Field

__all__ = ['IngestJobItem']


class IngestJobItem(SchemaBase):
    """摄取任务审计行（细粒度进度；spec D5 状态机）。"""

    job_id: str = Field(description='任务 ID（ingest_jobs 主键 = Celery task id）')
    document_id: str = Field(description='文档 ID')
    kb_name: str = Field(description='所属知识库')
    plugin_namespace: str = Field(description='部署级域标识')
    pipeline: str = Field(description='执行管线：legacy/knowhere/visual')
    status: str = Field(description='状态：pending/running/success/failed')
    stage: str | None = Field(None, description='运行阶段：routing/rendering/embedding/indexing')
    progress_current: int = Field(0, description='当前进度（已处理块数）')
    progress_total: int = Field(0, description='总进度（总块数）')
    error_message: str | None = Field(None, description='失败原因')
    logs: list[Any] = Field(default_factory=list, description='任务日志（时间序，截断保留）')
    created_time: datetime = Field(description='创建时间')
    updated_time: datetime | None = Field(None, description='更新时间')
