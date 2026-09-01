"""文档 DTO（只读，不含摄取）。"""

from datetime import datetime

from pydantic import Field

from backend.src.common.schema import SchemaBase


class DocumentItem(SchemaBase):
    """文档列表项"""

    document_id: str = Field(description='文档 ID')
    kb_name: str = Field(description='所属知识库')
    plugin_namespace: str = Field(description='部署级域标识')
    name: str = Field(description='文档名称')
    source_type: str = Field(description='来源类型')
    source_uri: str | None = Field(None, description='来源 URI')
    pipeline: str = Field(description='摄取管道')
    status: str = Field(description='状态')
    sha256: str | None = Field(None, description='文件指纹')
    chunk_count: int = Field(description='文本块数')
    created_time: datetime = Field(description='创建时间')
    updated_time: datetime | None = Field(None, description='更新时间')
