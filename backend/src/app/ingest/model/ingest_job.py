"""摄取任务审计模型（双管线摄取 spec D5，EagleRAG task_audit 迁移）。"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import JSON, BigInteger, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone


class IngestJob(MappedBase):
    """摄取任务审计表（细粒度进度；documents.status 保持粗粒度镜像）。

    状态机（spec D5）：pending → running(stage: routing/rendering/embedding/indexing)
    → success / failed。幂等桥接：任务开头查本表，success 直接跳过，
    running（worker 重启重投递）允许经 ``prepare_rerun`` 回到合法入口。
    """

    __tablename__ = 'ingest_jobs'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_ingest_jobs_document', 'document_id'),
        sa.Index('idx_ingest_jobs_kb', 'kb_name'),
        sa.Index('idx_ingest_jobs_status', 'status'),
        {'comment': '摄取任务审计表'},
    )

    job_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='任务 ID（Celery task id 或生成 UUID）')
    document_id: Mapped[str] = mapped_column(Text, comment='文档 ID')
    kb_name: Mapped[str] = mapped_column(Text, default='default', comment='所属知识库')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    # legacy/knowhere/visual/knowhere_visual（Knowhere 拆出的视觉子任务用独立 job 记录）
    pipeline: Mapped[str] = mapped_column(Text, default='legacy', comment='执行管线')
    status: Mapped[str] = mapped_column(Text, default='pending', comment='状态（pending/running/success/failed）')
    stage: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment='运行阶段（routing/rendering/embedding/indexing）'
    )
    progress_current: Mapped[int] = mapped_column(BigInteger, default=0, comment='当前进度（已处理块数）')
    progress_total: Mapped[int] = mapped_column(BigInteger, default=0, comment='总进度（总块数）')
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True, comment='失败原因')
    logs: Mapped[list] = mapped_column(JSON, default=list, comment='任务日志（append-only，截断保留）')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
    updated_time: Mapped[datetime] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间'
    )
