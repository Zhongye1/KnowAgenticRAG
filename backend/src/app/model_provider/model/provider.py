"""模型供应商配置模型（Yuxi models/providers 移植，ragf-design D4/D11/D14/D16）。

system 级配置表（不做租户隔离，D14）：一个 provider 行 = 一个供应商，
``enabled_models`` 是该供应商下已启用的模型（含 type=embedding/rerank/chat）。
模型 spec 形如 ``provider_id:model_id``；provider 的 ``api_key`` 为空时，
运行时回退到 ``api_key_env`` 指定的环境变量。
"""

from __future__ import annotations

import re

from datetime import datetime
from typing import Any

import sqlalchemy as sa

from sqlalchemy import JSON, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.src.common.model import MappedBase, TimeZone
from backend.src.utils.timezone import timezone

PROVIDER_ID_PATTERN = re.compile(r'^[a-z0-9][a-z0-9_-]{0,99}$')
VALID_PROVIDER_TYPES = {'openai', 'dashscope'}
VALID_MODEL_TYPES = {'chat', 'embedding', 'rerank'}


class ModelProvider(MappedBase):
    """模型供应商配置"""

    __tablename__ = 'model_providers'  # type: ignore[reportAssignmentType]
    __table_args__ = (  # type: ignore[reportAssignmentType]
        sa.Index('idx_model_providers_enabled', 'is_enabled'),
        {'comment': '模型供应商配置（system 级）'},
    )

    provider_id: Mapped[str] = mapped_column(Text, primary_key=True, comment='供应商稳定标识（^[a-z0-9][a-z0-9_-]*$）')
    display_name: Mapped[str] = mapped_column(Text, comment='展示名称')
    provider_type: Mapped[str] = mapped_column(
        Text, default='openai', comment='适配类型：openai（自定义 OpenAI 兼容）/dashscope（千问平台 SDK）'
    )
    base_url: Mapped[str] = mapped_column(Text, default='', comment='API 基础 URL')
    embedding_base_url: Mapped[str | None] = mapped_column(Text, comment='Embedding 请求 URL（空则按类型推断）')
    rerank_base_url: Mapped[str | None] = mapped_column(Text, comment='Rerank 请求 URL（空则按类型推断）')
    api_key: Mapped[str | None] = mapped_column(Text, comment='直接配置的 API Key')
    api_key_env: Mapped[str | None] = mapped_column(Text, comment='API Key 环境变量名（api_key 为空时回退）')
    capabilities: Mapped[list[Any]] = mapped_column(JSON, default=list, comment='能力：chat/embedding/rerank')
    enabled_models: Mapped[list[Any]] = mapped_column(
        JSON, default=list, comment='已启用模型（含 type/dimension/batch_size/extra）'
    )
    headers_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, comment='额外请求头')
    extra_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, comment='扩展配置')
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, comment='是否启用')
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, comment='是否内置模板')
    created_time: Mapped[datetime] = mapped_column(TimeZone, default=timezone.now, comment='创建时间')
    updated_time: Mapped[datetime] = mapped_column(
        TimeZone, default=timezone.now, onupdate=timezone.now, comment='更新时间'
    )

    @property
    def spec_list(self) -> list[str]:
        """本 provider 下全部已启用模型的 spec。"""
        return [f'{self.provider_id}:{model["id"]}' for model in (self.enabled_models or [])]
