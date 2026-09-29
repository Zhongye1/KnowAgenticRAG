"""导出 DTO（kb-落地改造清单 §9.2）。"""

from datetime import datetime

from pydantic import Field

from backend.src.common.schema import SchemaBase


class ExportCreated(SchemaBase):
    """发起导出的响应（仅任务标识，产物异步生成）"""

    export_id: str = Field(description='导出 ID（用于轮询状态）')
    kb_name: str = Field(description='知识库标识')
    status: str = Field(description='状态（pending/running/success/failed）')


class ExportItem(SchemaBase):
    """导出任务状态

    `url` 仅在 `status=success` 时有值，是 MinIO 预签名下载地址（短时有效）——
    字节不经 API 进程，也不在库里存副本。
    """

    export_id: str = Field(description='导出 ID')
    kb_name: str | None = Field(None, description='知识库标识（历史列表可不带）')
    status: str = Field(description='状态（pending/running/success/failed）')
    document_count: int = Field(0, description='已打包文档数')
    size_bytes: int = Field(0, description='ZIP 字节数')
    error: str | None = Field(None, description='失败原因')
    created_time: datetime | None = Field(None, description='创建时间')
    url: str | None = Field(None, description='预签名下载 URL（仅 success 时）')
