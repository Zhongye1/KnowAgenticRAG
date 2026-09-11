"""ingest 域 DTO（ragf-design §7/§8：无自有表，参数/输出契约）。"""

from datetime import datetime
from typing import Any

from backend.src.common.schema import SchemaBase
from pydantic import Field

__all__ = ['DocumentStatusItem', 'DocumentUploadItem', 'IngestResultItem', 'RebuildResultItem']


class DocumentStatusItem(SchemaBase):
    """文档摄取状态/进度（含失败信息，D3）。"""

    document_id: str = Field(description='文档 ID')
    kb_name: str = Field(description='所属知识库')
    plugin_namespace: str = Field(description='部署级域标识')
    name: str = Field(description='文档名称')
    status: str = Field(description='状态：pending/parsing/indexing/ready/parsing_failed/indexing_failed/failed')
    chunk_count: int = Field(0, description='当前分块数')
    error_message: str | None = Field(None, description='最近一次失败原因')
    ingest_params: dict[str, Any] = Field(default_factory=dict, description='摄取参数指纹')
    created_time: datetime = Field(description='创建时间')
    updated_time: datetime | None = Field(None, description='更新时间')


class DocumentUploadItem(SchemaBase):
    """文档上传（对象存储 + 元数据登记）受理结果（两段式第一步）。"""

    document_id: str = Field(description='文档 ID（两段式第二步据此触发摄取）')
    kb_name: str = Field(description='所属知识库')
    name: str = Field(description='文档名称')
    status: str = Field(description='受理后状态（pending：已登记未摄取）')
    sha256: str | None = Field(None, description='文件指纹')
    source_uri: str | None = Field(None, description='对象存储对象键')
    created_time: datetime = Field(description='创建时间')


class IngestResultItem(SchemaBase):
    """上传并触发摄取的受理结果。"""

    document_id: str = Field(description='文档 ID')
    kb_name: str = Field(description='所属知识库')
    name: str = Field(description='文档名称')
    sha256: str | None = Field(None, description='文件指纹')
    status: str = Field(description='受理后状态（pending：已入队等待 worker claim）')
    queued: bool = Field(True, description='是否已入队摄取任务')


class RebuildResultItem(SchemaBase):
    """KB 级全量重建受理结果（D12）。"""

    kb_name: str = Field(description='知识库标识')
    dispatched: int = Field(0, description='已入队文档数')
    skipped: int = Field(0, description='跳过（摄取中/索引中）文档数')
    total: int = Field(0, description='文档总数')
