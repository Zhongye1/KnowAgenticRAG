"""知识库 DTO（EagleRAG api/schemas/knowledge_bases.py 迁移）。"""

from datetime import datetime
from typing import Any

from pydantic import Field, field_validator

from backend.src.common.schema import SchemaBase

KB_NAME_PATTERN = r'^[a-z0-9_]+$'
QUERY_PARAM_WHITELIST = frozenset({
    'search_mode',
    'recall_top_k',
    'final_top_k',
    'similarity_threshold',
    'use_reranker',
})


def _validate_query_params(value: dict | None) -> dict | None:
    """检索默认参数白名单 + 类型/范围校验（ragf-design §6.4/D17）。"""
    if value is None:
        return None
    unknown = set(value) - QUERY_PARAM_WHITELIST
    if unknown:
        raise ValueError(f'query_params 只允许键 {sorted(QUERY_PARAM_WHITELIST)}，非法: {sorted(unknown)}')
    return {key: _coerce_query_param(key, val) for key, val in value.items()}


def _coerce_query_param(key: str, val: Any) -> Any:
    """按键做类型/范围强制，非法值抛 ValueError（FastAPI 422）。"""
    if key == 'search_mode':
        if val not in {'vector', 'hybrid'}:
            raise ValueError('search_mode 只能是 vector 或 hybrid')
        return val
    if key in {'recall_top_k', 'final_top_k'}:
        coerced = int(val)
        if coerced < 1:
            raise ValueError(f'{key} 必须 >= 1')
        return coerced
    if key == 'similarity_threshold':
        coerced = float(val)
        if not 0 <= coerced <= 1:
            raise ValueError('similarity_threshold 必须在 0~1')
        return coerced
    if not isinstance(val, bool):
        raise TypeError('use_reranker 必须是布尔值')
    return val


class KBCreateParam(SchemaBase):
    """创建知识库参数"""

    kb_name: str = Field(pattern=KB_NAME_PATTERN, max_length=64, description='知识库标识（小写字母/数字/下划线）')
    display_name: str = Field(max_length=128, description='展示名称')
    description: str = Field('', description='描述')
    theme: str = Field('blue', max_length=32, description='主题色')
    icon: str = Field('database', max_length=32, description='图标')
    pdf_text_page_ratio: float = Field(0.2, ge=0.0, le=1.0, description='PDF 文本页比例阈值')
    embedding_model: str = Field(
        'dashscope:qwen3.7-text-embedding-flash',
        max_length=64,
        description='嵌入模型 spec（千问平台 token；换模型=重建 KB）',
    )
    query_params: dict = Field(default_factory=dict, description='检索默认参数（见 §6.4 白名单）')

    @field_validator('query_params')
    @classmethod
    def _check_query_params(cls, value: dict) -> dict:
        return _validate_query_params(value) or {}


class KBUpdateParam(SchemaBase):
    """更新知识库参数（全部可选）"""

    display_name: str | None = Field(None, max_length=128, description='展示名称')
    description: str | None = Field(None, description='描述')
    theme: str | None = Field(None, max_length=32, description='主题色')
    icon: str | None = Field(None, max_length=32, description='图标')
    pdf_text_page_ratio: float | None = Field(None, ge=0.0, le=1.0, description='PDF 文本页比例阈值')
    embedding_model: str | None = Field(None, max_length=64, description='嵌入模型')
    query_params: dict | None = Field(None, description='检索默认参数（整字段替换 + 白名单）')

    @field_validator('query_params')
    @classmethod
    def _check_query_params(cls, value: dict | None) -> dict | None:
        return _validate_query_params(value)


class KBItem(SchemaBase):
    """知识库列表项（含实时统计）"""

    kb_name: str = Field(description='知识库标识')
    plugin_namespace: str = Field(description='部署级域标识')
    display_name: str = Field(description='展示名称')
    description: str = Field(description='描述')
    theme: str = Field(description='主题色')
    icon: str = Field(description='图标')
    pdf_text_page_ratio: float = Field(description='PDF 文本页比例阈值')
    embedding_model: str = Field(description='嵌入模型')
    query_params: dict = Field(default_factory=dict, description='检索默认参数')
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
