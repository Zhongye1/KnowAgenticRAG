"""文档分块模型（ragf-design §6.1/D9：chunks 数据 Owner = kb 域）。"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import JSON, BigInteger, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone


class Chunk(MappedBase):
    """文档分块元数据表"""

    __tablename__ = 'chunks'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_chunks_owner', 'plugin_namespace', 'kb_name', 'document_id'),
        sa.Index('idx_chunks_doc_version', 'plugin_namespace', 'document_id', 'version_id'),
        {'comment': '文档分块（kb 域数据 Owner；ingest 只写、检索/版本化只读）'},
    )

    chunk_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='分块 ID（{document_id}:{version_id}:{idx}）')
    document_id: Mapped[str] = mapped_column(Text, comment='所属文档')
    kb_name: Mapped[str] = mapped_column(Text, default='default', comment='所属知识库')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    version_id: Mapped[int] = mapped_column(BigInteger, default=1, comment='版本（默认 1，版本化占位）')
    chunk_index: Mapped[int] = mapped_column(BigInteger, default=0, comment='块序号')
    content: Mapped[str] = mapped_column(Text, comment='分块文本')
    token_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True, comment='token 数')
    char_pos_start: Mapped[int | None] = mapped_column(BigInteger, nullable=True, comment='源文本起始偏移')
    char_pos_end: Mapped[int | None] = mapped_column(BigInteger, nullable=True, comment='源文本结束偏移')
    meta: Mapped[dict] = mapped_column(JSON, default=dict, comment='扩展：preset/层级路径/表格公式标记等')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
    updated_time: Mapped[datetime] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间'
    )
