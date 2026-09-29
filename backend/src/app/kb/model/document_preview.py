"""文档预览转换状态模型（kb-落地改造清单 Phase 3 / D55）。

一行 = 一篇文档的**转换产物索引**（不是缓存副本本身，副本在 MinIO）。

**为什么不用 `(document_id, version)` 主键**：D52 已改判为「版本管理缓做」，
版本号恒 1 无法作区分键。改用 `source_sha256` **内容指纹**做失效判据——这正是
「内容变了预览必须重转」的真实条件（与 [RAG 清单] D63 缓存键同一判据）。
替换文档文件（`PUT /documents/{id}/file`）会更新 `documents.sha256`，指纹不匹配
即视为需要重转。
"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import BigInteger, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone


class DocumentPreview(MappedBase):
    """文档预览转换表（Office → PDF 的异步转换索引）"""

    __tablename__ = 'document_previews'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_document_previews_ns_kb', 'plugin_namespace', 'kb_name'),
        sa.Index('idx_document_previews_status', 'status'),
        {'comment': '文档预览转换状态与产物索引表'},
    )

    document_id: Mapped[str] = mapped_column(
        Text, ForeignKey('documents.document_id', ondelete='CASCADE'), primary_key=True, comment='文档 ID'
    )
    kb_name: Mapped[str] = mapped_column(Text, default='default', comment='所属知识库')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    status: Mapped[str] = mapped_column(Text, default='converting', comment='状态（converting/ready/failed）')
    object_key: Mapped[str | None] = mapped_column(Text, nullable=True, comment='转换产物 PDF 的 OSS object key')
    source_sha256: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment='转换时的源文件内容指纹（不匹配即需重转）'
    )
    page_count: Mapped[int] = mapped_column(BigInteger, default=0, comment='产物页数（前端展示与分页）')
    error: Mapped[str | None] = mapped_column(Text, nullable=True, comment='失败原因（前端据此走降级梯）')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
    updated_time: Mapped[datetime] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间'
    )
