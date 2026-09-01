"""知识库 DTO（EagleRAG api/schemas/knowledge_bases.py 迁移）。"""

from datetime import datetime

from pydantic import Field

from backend.src.common.schema import SchemaBase

KB_NAME_PATTERN = r'^[a-z0-9_]+$'


class KBCreateParam(SchemaBase):
    """创建知识库参数"""

    kb_name: str = Field(pattern=KB_NAME_PATTERN, max_length=64, description='知识库标识（小写字母/数字/下划线）')
    display_name: str = Field(max_length=128, description='展示名称')
    description: str = Field('', description='描述')
    theme: str = Field('blue', max_length=32, description='主题色')
    icon: str = Field('database', max_length=32, description='图标')
    pdf_text_page_ratio: float = Field(0.2, ge=0.0, le=1.0, description='PDF 文本页比例阈值')


class KBUpdateParam(SchemaBase):
    """更新知识库参数（全部可选）"""

    display_name: str | None = Field(None, max_length=128, description='展示名称')
    description: str | None = Field(None, description='描述')
    theme: str | None = Field(None, max_length=32, description='主题色')
    icon: str | None = Field(None, max_length=32, description='图标')
    pdf_text_page_ratio: float | None = Field(None, ge=0.0, le=1.0, description='PDF 文本页比例阈值')


class KBItem(SchemaBase):
    """知识库列表项（含实时统计）"""

    kb_name: str = Field(description='知识库标识')
    plugin_namespace: str = Field(description='部署级域标识')
    display_name: str = Field(description='展示名称')
    description: str = Field(description='描述')
    theme: str = Field(description='主题色')
    icon: str = Field(description='图标')
    pdf_text_page_ratio: float = Field(description='PDF 文本页比例阈值')
    collections_used: list[str] = Field(default_factory=list, description='已写入的集合目录')
    documents: int = Field(0, description='文档数')
    text_vectors: int = Field(0, description='文本向量数')
    visual_vectors: int = Field(0, description='视觉向量数')
    created_time: datetime = Field(description='创建时间')
    updated_time: datetime | None = Field(None, description='更新时间')


class KBDetail(KBItem):
    """知识库详情"""


class KBOverview(SchemaBase):
    """跨知识库聚合"""

    total_kbs: int = Field(description='知识库总数')
    total_documents: int = Field(description='文档总数')
    total_text_vectors: int = Field(description='文本向量总数')
    total_visual_vectors: int = Field(description='视觉向量总数')


class KBFormatDistributionItem(SchemaBase):
    """文件类型分布"""

    source_type: str = Field(description='来源类型')
    count: int = Field(description='数量')


class KBIngestionVolumeItem(SchemaBase):
    """摄入时间序列"""

    date: str = Field(description='日期（YYYY-MM-DD）')
    count: int = Field(description='当日文档数')


class KBCollectionsItem(SchemaBase):
    """集合统计"""

    collection: str = Field(description='集合名')
    count: int = Field(description='KB 内实体数')


class KBFacetItem(SchemaBase):
    """分面统计"""

    field: str = Field(description='分面字段')
    value: str = Field(description='取值')
    count: int = Field(description='数量')


class KBDeleteResponse(SchemaBase):
    """删除响应"""

    deleted: bool = Field(description='是否删除')
    counts: dict[str, int] = Field(default_factory=dict, description='各层删除数量')
