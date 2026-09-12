"""知识库注册表模型（EagleRAG knowledge_bases 迁移）。"""

from datetime import datetime
from typing import Any

import sqlalchemy as sa

from sqlalchemy import JSON, Boolean, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone


class KnowledgeBase(MappedBase):
    """知识库注册表"""

    __tablename__ = 'knowledge_bases'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_knowledge_bases_updated', 'updated_time'),
        sa.Index('idx_knowledge_bases_namespace', 'plugin_namespace'),
        {'comment': '知识库注册表'},
    )

    kb_name: Mapped[str] = mapped_column(Text, primary_key=True, comment='知识库标识（^[a-z0-9_]+$）')
    plugin_namespace: Mapped[str] = mapped_column(Text, primary_key=True, default='core', comment='部署级域标识')
    display_name: Mapped[str] = mapped_column(Text, comment='展示名称')
    description: Mapped[str] = mapped_column(Text, default='', comment='描述')
    theme: Mapped[str] = mapped_column(Text, default='blue', comment='主题色')
    icon: Mapped[str] = mapped_column(Text, default='database', comment='图标')
    pdf_text_page_ratio: Mapped[float] = mapped_column(Float, default=0.2, comment='PDF 文本页比例阈值')
    embedding_model: Mapped[str] = mapped_column(
        Text,
        default='dashscope:qwen3.7-text-embedding-flash',
        comment='嵌入模型 spec（千问平台 token；换模型=重建 KB，为 Phase 2 留迁移通道）',
    )
    # 双管线摄取路由（spec D2）：legacy=既有工厂链路；auto=格式+形态路由；text/visual/hybrid=强制管线
    routing_mode: Mapped[str] = mapped_column(
        String(16), default='auto', comment='摄取路由模式（auto/text/visual/hybrid）'
    )
    query_params: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        comment='检索默认参数（D17：search_mode/recall_top_k/final_top_k/similarity_threshold/use_reranker）',
    )
    collections_used: Mapped[list[Any]] = mapped_column(JSON, default=list, comment='已写入的集合目录')
    owner_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment='库所有者用户 ID（建库人，资源级角色见 rag_kb_acl perm=owner）'
    )
    is_public: Mapped[bool] = mapped_column(
        Boolean, default=False, comment='公开库（对任意持检索功能码用户可读；取代"ACL 表为空=全放开"的隐式语义）'
    )
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
    updated_time: Mapped[datetime] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间'
    )
