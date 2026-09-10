"""URL 摄取 DTO（双管线摄取 spec D10）。"""

from backend.src.common.schema import SchemaBase
from pydantic import Field

__all__ = ['UrlIngestRequest']


class UrlIngestRequest(SchemaBase):
    """URL 摄取请求体（spec D10）。"""

    url: str = Field(description='文件直链（http/https，须公网可访问；网页正文提取暂不支持）')
    force: bool = Field(False, description='强制重摄取（同指纹文档）')
