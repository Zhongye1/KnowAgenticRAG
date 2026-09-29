"""知识库导出任务模型（kb-落地改造清单 §9.2「整库导出 ZIP」）。

一行 = 一次导出请求的状态与产物索引（产物本体的 ZIP 在 MinIO，不在库里）。

**为什么要有这张表**：导出是**异步**的（大库同步打包必然超时——Yuxi 就是同步打包，
其路由直接 `FileResponse` 一个本地文件，库一大就顶不住）。异步就需要可轮询的状态，
且产物在对象存储而非本地磁盘，故必须落一行索引。
"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import BigInteger, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone


class KbExport(MappedBase):
    """知识库导出任务表"""

    __tablename__ = 'kb_exports'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_kb_exports_ns_kb', 'plugin_namespace', 'kb_name'),
        sa.Index('idx_kb_exports_status', 'status'),
        {'comment': '知识库导出任务表（ZIP 产物索引）'},
    )

    export_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='导出 ID（UUID）')
    kb_name: Mapped[str] = mapped_column(Text, comment='所属知识库')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    status: Mapped[str] = mapped_column(Text, default='pending', comment='状态（pending/running/success/failed）')
    object_key: Mapped[str | None] = mapped_column(Text, nullable=True, comment='ZIP 产物的 OSS object key')
    document_count: Mapped[int] = mapped_column(BigInteger, default=0, comment='已打包文档数')
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0, comment='ZIP 字节数')
    error: Mapped[str | None] = mapped_column(Text, nullable=True, comment='失败原因')
    created_by: Mapped[str | None] = mapped_column(Text, nullable=True, comment='发起导出的用户 ID（审计用）')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
    updated_time: Mapped[datetime] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间'
    )
