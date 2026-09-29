"""知识库文件夹 DTO（kb-落地改造清单 D51）。

树接口只返回**结构 + 每级文档数**，不内联文档列表：文档列表已有独立分页接口，
内联会同时破坏分页与 ACL 过滤（可见集是另一套求值链路，见 `documents.py:99`）。
"""

from datetime import datetime

from pydantic import Field

from backend.src.common.schema import SchemaBase


class FolderItem(SchemaBase):
    """文件夹扁平项（含本级文档数）"""

    folder_id: str = Field(description='文件夹 ID')
    kb_name: str = Field(description='所属知识库')
    plugin_namespace: str = Field(description='部署级域标识')
    parent_id: str | None = Field(None, description='父文件夹 ID（null = 根目录）')
    name: str = Field(description='文件夹名称')
    sort_order: int = Field(description='同级排序（升序）')
    document_count: int = Field(0, description='本级直接挂载的文档数（不含子文件夹）')
    created_time: datetime = Field(description='创建时间')
    updated_time: datetime | None = Field(None, description='更新时间')


class FolderTreeNode(FolderItem):
    """文件夹树节点（children 递归）"""

    children: list['FolderTreeNode'] = Field(default_factory=list, description='子文件夹')


FolderTreeNode.model_rebuild()


class FolderCreateParam(SchemaBase):
    """新建文件夹参数"""

    name: str = Field(min_length=1, max_length=255, description='文件夹名称')
    parent_id: str | None = Field(None, description='父文件夹 ID（null = 建在根目录）')
    sort_order: int = Field(0, ge=0, description='同级排序（升序）')


class FolderUpdateParam(SchemaBase):
    """更新文件夹参数（全可选）"""

    name: str | None = Field(None, min_length=1, max_length=255, description='文件夹名称')
    sort_order: int | None = Field(None, ge=0, description='同级排序（升序）')


class FolderMoveParam(SchemaBase):
    """移动文件夹参数"""

    parent_id: str | None = Field(None, description='目标父文件夹 ID（null = 移到根目录）')
    sort_order: int | None = Field(None, ge=0, description='落位排序（可选）')


class DocumentMoveParam(SchemaBase):
    """移动文档到文件夹参数"""

    folder_id: str | None = Field(None, description='目标文件夹 ID（null = 移到根目录）')
