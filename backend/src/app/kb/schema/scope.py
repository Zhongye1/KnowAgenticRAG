"""检索范围过滤（scope filter，EagleRAG ScopeSelection 迁移）。

并集（OR）语义：命中任一知识库 / 文档 ID / 标签即纳入检索范围。
"""

from pydantic import Field

from backend.src.common.schema import SchemaBase


class ScopeSelection(SchemaBase):
    """检索范围选择"""

    kb_names: list[str] = Field(default_factory=list, description='知识库列表')
    document_ids: list[str] = Field(default_factory=list, description='文档 ID 列表')
    tags: list[str] = Field(default_factory=list, description='标签列表')
