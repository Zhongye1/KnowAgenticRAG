"""分块 DTO（ragf-design §6.1：只读浏览/检索契约）。"""

from datetime import datetime
from typing import Any

from pydantic import ConfigDict, Field

from backend.src.common.schema import SchemaBase


class ChunkItem(SchemaBase):
    """分块项"""

    model_config = ConfigDict(from_attributes=True)

    chunk_id: str = Field(description='分块 ID')
    document_id: str = Field(description='所属文档')
    kb_name: str = Field(description='所属知识库')
    plugin_namespace: str = Field(description='部署级域标识')
    version_id: int = Field(description='版本')
    chunk_index: int = Field(description='块序号')
    content: str = Field(description='分块文本')
    token_count: int | None = Field(None, description='token 数')
    char_pos_start: int | None = Field(None, description='源文本起始偏移')
    char_pos_end: int | None = Field(None, description='源文本结束偏移')
    meta: dict[str, Any] = Field(default_factory=dict, description='扩展元数据')
    created_time: datetime = Field(description='创建时间')
    updated_time: datetime | None = Field(None, description='更新时间')
