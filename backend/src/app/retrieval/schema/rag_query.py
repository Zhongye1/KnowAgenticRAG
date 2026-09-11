"""RAG 查询面 DTO(EagleRAG 对齐:扁平跨库检索 + sources 二元来源 + steps 轨迹)。

请求 `RagSearchParam` 在检索覆盖层(KBSearchParam)之上加 `kb_names`(跨库,M11)
与 `document_ids`(文档范围直推);响应 `RagSearchOutput` 以 `sources{text, image}`
二元来源模型 + `route`/`steps` 过程可解释契约呈现(对齐 EagleRAG SearchResponse,
selector 诚实标注 explicit——无 LLM 路由)。
"""

from __future__ import annotations

from typing import Any

from pydantic import Field

from backend.src.app.retrieval.schema.search_result import KBSearchParam
from backend.src.common.schema import SchemaBase

__all__ = [
    'ImageSourceItem',
    'ImageUrlData',
    'QueryStepItem',
    'RagSearchOutput',
    'RagSearchParam',
    'RagSources',
    'RouteInfoItem',
    'TextSourceItem',
]


class RagSearchParam(KBSearchParam):
    """RAG 查询请求:检索覆盖层 + 跨库与文档范围(单一事实源继承 search 键)。"""

    kb_names: list[str] = Field(
        min_length=1,
        max_length=20,
        description='知识库标识列表(1-20 个,去重去空;单库检索传单元素)',
    )
    document_ids: list[str] | None = Field(
        None,
        max_length=500,
        description='文档范围直推(跳过 filters 的 PG 解析,直接作用于 Milvus 表达式)',
    )


class TextSourceItem(SchemaBase):
    """文本来源条目(对齐 EagleRAG TextSource;content 为 PG 事实源正文)。"""

    type: str = Field('text', description='来源类型(text;table/image 类 chunk 随摄取演进)')
    chunk_id: str = Field(description='分块 ID({document_id}:{version_id}:{idx})')
    document_id: str = Field(description='所属文档')
    kb_name: str = Field(description='知识库标识')
    version_id: int = Field(1, description='版本')
    chunk_index: int = Field(0, description='块序号')
    file_name: str = Field('', description='来源文件名(PG documents.name)')
    content: str = Field(description='分块正文')
    score: float = Field(0.0, description='召回分(RRF 秩分或余弦)')
    rerank_score: float | None = Field(None, description='精排分(未精排为 null)')
    token_count: int | None = Field(None, description='分块 token 数')


class ImageSourceItem(SchemaBase):
    """视觉来源条目(对齐 EagleRAG ImageSource;image_path 为 MinIO 对象键,经 /rag/images 回源)。"""

    type: str = Field('image', description='来源类型(image)')
    image_id: str = Field(description='视觉行 ID({document_id}_t{序号})')
    image_path: str = Field(description='tile 图对象键(kb/{ns}/{kb}/{doc}/tiles/)')
    document_id: str = Field(description='所属文档')
    kb_name: str = Field(description='知识库标识')
    page: int = Field(0, description='页码')
    position: str = Field('', description='条带位置')
    chunk_type: str = Field('tile', description='视觉切片类型(tile/image/table)')
    parent_section: str = Field('', description='父章节(预留)')
    content_summary: str = Field('', description='内容摘要(预留,摄取侧待补)')
    score: float = Field(0.0, description='视觉余弦相似度')


class RagSources(SchemaBase):
    """二元来源模型(EagleRAG QuerySources 对齐)。"""

    text: list[TextSourceItem] = Field(default_factory=list, description='文本来源(final_top_k 内,按相关度降序)')
    image: list[ImageSourceItem] = Field(default_factory=list, description='视觉来源(visual_top_k 内,按相似度降序)')


class RouteInfoItem(SchemaBase):
    """路由信息(EagleRAG RouteInfo 对齐;显式参数语义,selector=explicit)。"""

    mode: str = Field(description='实际生效检索模式(vector/hybrid)')
    selected: list[str] = Field(description='实际执行的召回路:[] 内为 text/visual 的子集')
    reason: str = Field('explicit params', description='决策来源(explicit params;LLM 路由未引入)')
    kb_names: list[str] = Field(default_factory=list, description='本次检索的知识库')


class QueryStepItem(SchemaBase):
    """过程轨迹条目(EagleRAG QueryStep 对齐;name ∈ recall/rerank/hydrate)。"""

    name: str = Field(description='步骤名')
    detail: str = Field('', description='步骤摘要(计数/降级原因)')


class RagSearchOutput(SchemaBase):
    """RAG 查询输出(sources 二元来源 + route/steps 过程可解释)。"""

    kb_names: list[str] = Field(description='本次检索的知识库')
    mode: str = Field(description='实际生效检索模式:vector / hybrid')
    route: RouteInfoItem = Field(description='路由信息(显式参数语义)')
    steps: list[QueryStepItem] = Field(default_factory=list, description='过程轨迹(按执行序)')
    recall_count: int = Field(0, description='文本召回候选数(精排前)')
    reranked: bool = Field(False, description='是否完成精排')
    degraded: bool = Field(False, description='精排失败降级为召回序')
    visual_degraded: bool = Field(False, description='视觉召回失败降级')
    duration_ms: int = Field(0, description='检索耗时(毫秒)')
    sources: RagSources = Field(default_factory=RagSources, description='二元来源')


class ImageUrlData(SchemaBase):
    """视觉 tile 预签名 URL 数据。"""

    image_id: str = Field(description='视觉行 ID')
    document_id: str = Field(description='所属文档')
    kb_name: str = Field(description='知识库标识')
    url: str = Field(description='预签名下载 URL(MinIO,短期有效)')
    expires_in_seconds: int = Field(description='URL 有效期(秒)')


def to_image_source(item: dict[str, Any]) -> dict[str, Any]:
    """visual_results 命中 → ImageSourceItem 载荷(纯映射,chat citation 复用)。"""
    return {
        'type': 'image',
        'image_id': str(item.get('id') or ''),
        'image_path': str(item.get('image_path') or ''),
        'document_id': str(item.get('document_id') or ''),
        'kb_name': str(item.get('kb_name') or ''),
        'page': int(item.get('page') or 0),
        'position': str(item.get('position') or ''),
        'chunk_type': str(item.get('chunk_type') or 'tile'),
        'parent_section': str(item.get('parent_section') or ''),
        'content_summary': str(item.get('content_summary') or ''),
        'score': float(item.get('score') or 0.0),
    }
