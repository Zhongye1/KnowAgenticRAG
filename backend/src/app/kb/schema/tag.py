"""标签目录 DTO。"""

from pydantic import Field

from backend.src.common.schema import SchemaBase


class TagItem(SchemaBase):
    """标签目录项"""

    keyword: str = Field(description='关键词')
    document_count: int = Field(description='覆盖文档数')
    kb_names: list[str] = Field(default_factory=list, description='出现的知识库')
    node_count: int = Field(description='出现次数')
