"""知识库文件夹模型（kb-落地改造清单 D51）。

与 Yuxi 的同表 ``parent_id`` + ``is_folder`` 自引用方案不同，这里用**独立表**：
``documents`` 的七态状态机、``active_version``、``sha256`` 等字段对文件夹全无意义，
塞进同表会产生大量空列，且 Yuxi 自己为此背了虚拟目录迁移的历史债。

删除语义（D51）：删除文件夹时其**子文件夹与文档一并上浮到父级**，不级联删除。
``documents.folder_id`` 的 ``ondelete='SET NULL'`` 只是安全网——服务层会先把
子项改挂到父级，正常路径不会触发 SET NULL（否则子项会落到根目录而非父级）。
"""

from datetime import datetime

import sqlalchemy as sa

from sqlalchemy import BigInteger, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone


class KbFolder(MappedBase):
    """知识库文件夹表（仅组织语义，不做授权——见 D53）"""

    __tablename__ = 'kb_folders'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_kb_folders_ns_kb', 'plugin_namespace', 'kb_name'),
        sa.Index('idx_kb_folders_ns_kb_parent', 'plugin_namespace', 'kb_name', 'parent_id'),
        {'comment': '知识库文件夹表'},
    )

    folder_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='文件夹 ID')
    kb_name: Mapped[str] = mapped_column(Text, comment='所属知识库')
    plugin_namespace: Mapped[str] = mapped_column(Text, default='core', comment='部署级域标识')
    parent_id: Mapped[str | None] = mapped_column(
        Text,
        ForeignKey('kb_folders.folder_id', ondelete='SET NULL'),
        nullable=True,
        comment='父文件夹 ID（NULL = 根目录）',
    )
    name: Mapped[str] = mapped_column(Text, comment='文件夹名称')
    sort_order: Mapped[int] = mapped_column(BigInteger, default=0, comment='同级排序（升序）')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
    updated_time: Mapped[datetime] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间'
    )
