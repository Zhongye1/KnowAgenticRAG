"""检索域 DTO（ragf-design §5.7/§7/§14.12：检索结果 payload = 跨服务契约）。

单次请求参数为临时覆盖层（优先级 request > KB ``query_params`` > settings，
D17）；``file_name`` 为可选的文档名关键词过滤（对齐 Yuxi ``SearchInputSchema``），
与 ``filters``（agent-layer spec D26/M11：keyword/tag/version_id/updated/file_type/
path_prefix）在检索服务层合并解析为 ``document_id`` 过滤表达式。
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import ConfigDict, Field

from backend.src.common.schema import SchemaBase

__all__ = ['KBSearchOutput', 'KBSearchParam', 'RetrievalFilters', 'SearchHitItem']


class RetrievalFilters(SchemaBase):
    """结构化检索过滤（agent-layer spec §5.3/D26/M11）。

    文档级过滤（keyword/tag/updated/file_type/path_prefix）经 kb 文档登记解析为
    ``document_id`` 集后再作用于 Milvus 表达式；``version_id`` 为精确版本过滤，
    直接作用于 Milvus ``version_id`` 标量（显式指定时不做 active_version 收敛）。
    """

    model_config = ConfigDict(extra='forbid')

    keyword: str | None = Field(None, max_length=200, description='文档关键词（document_keywords 模糊匹配）')
    tag: str | None = Field(None, max_length=100, description='标签精确匹配（document_keywords.keyword）')
    version_id: int | None = Field(None, ge=1, description='精确版本（缺省 = active_version 收敛）')
    updated_after: datetime | None = Field(None, description='文档更新时间起（含边界）')
    updated_before: datetime | None = Field(None, description='文档更新时间止（含边界）')
    file_type: str | None = Field(None, max_length=32, description='文件扩展名（pdf/md/docx/...，大小写不敏感）')
    path_prefix: str | None = Field(None, max_length=512, description='来源路径/URI 前缀过滤')

    @property
    def has_doc_constraints(self) -> bool:
        """是否存在文档级过滤条件（决定是否解析为 document_id 集）。"""
        return any(
            value is not None
            for value in (
                self.keyword,
                self.tag,
                self.updated_after,
                self.updated_before,
                self.file_type,
                self.path_prefix,
            )
        )

    @property
    def version_requested(self) -> bool:
        return self.version_id is not None


class KBSearchParam(SchemaBase):
    """同步检索请求参数"""

    model_config = ConfigDict(extra='forbid')

    query_text: str = Field(min_length=1, max_length=2000, description='检索文本（混合模式下同时用于 BM25 原文）')
    search_mode: Literal['vector', 'hybrid'] | None = Field(
        None, description='检索模式（缺省走 KB query_params / settings，默认 hybrid）'
    )
    recall_top_k: int | None = Field(None, ge=1, le=200, description='召回候选数（精排输入）')
    final_top_k: int | None = Field(None, ge=1, le=50, description='最终返回条数')
    similarity_threshold: float | None = Field(
        None, ge=0.0, le=1.0, description='vector 模式余弦相似度阈值（低于阈值丢弃，Yuxi 语义）'
    )
    use_reranker: bool | None = Field(None, description='是否精排（默认开，D16）')
    include_visual: bool | None = Field(
        None, description='是否附带视觉召回（ragf_visual 集合；默认关，命中以 visual_results 独立返回）'
    )
    visual_top_k: int | None = Field(None, ge=1, le=50, description='视觉召回条数上限（视觉不进精排）')
    file_name: str | None = Field(None, max_length=255, description='可选文件名关键词过滤（命中 0 个文档返回空）')
    filters: RetrievalFilters | None = Field(None, description='结构化过滤（D26/M11：与 file_name 合并）')

    @property
    def effective_filters(self) -> RetrievalFilters:
        """归一后的结构化过滤（未提交时为空对象 = 无过滤）。"""
        return self.filters if self.filters is not None else RetrievalFilters.model_validate({})


class SearchHitItem(SchemaBase):
    """检索命中条目"""

    chunk_id: str = Field(description='分块 ID（{document_id}:{version_id}:{idx}）')
    document_id: str = Field(description='所属文档')
    kb_name: str = Field(description='知识库标识')
    version_id: int = Field(1, description='版本')
    chunk_index: int = Field(0, description='块序号')
    content: str = Field(description='分块文本（PG chunks 为事实源，缺失时回退 Milvus）')
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description='source（文件名）/ score / rerank_score / token_count 等附加信息',
    )


class VisualHitItem(SchemaBase):
    """视觉召回命中条目（ragf_visual 集合；独立于文本 chunk 结果，不进精排/引用）。"""

    id: str = Field(description='视觉行 ID（{document_id}_t{序号}）')
    image_path: str = Field(description='tile 图对象键（MinIO kb/{ns}/{kb}/{doc}/tiles/）')
    document_id: str = Field(description='所属文档')
    kb_name: str = Field(description='知识库标识')
    page: int = Field(0, description='页码')
    position: str = Field('', description='条带位置')
    chunk_type: str = Field('tile', description='视觉切片类型（tile/image/table）')
    parent_section: str = Field('', description='父章节（预留）')
    content_summary: str = Field('', description='内容摘要（预留，当前摄取侧为空）')
    score: float = Field(0.0, description='视觉余弦相似度')


class KBSearchOutput(SchemaBase):
    """同步检索输出"""

    kb_name: str = Field(description='知识库标识')
    mode: str = Field(description='实际生效检索模式：vector / hybrid')
    recall_count: int = Field(0, description='召回候选数（精排前）')
    reranked: bool = Field(False, description='是否完成精排')
    degraded: bool = Field(False, description='精排失败降级为召回序（§A.5）')
    duration_ms: int = Field(0, description='检索耗时（毫秒）')
    results: list[SearchHitItem] = Field(default_factory=list, description='按相关度降序的最终结果')
    visual_results: list[VisualHitItem] = Field(
        default_factory=list, description='视觉召回命中（include_visual 开启时；按视觉相似度降序）'
    )
    visual_degraded: bool = Field(False, description='视觉召回失败降级（编码/检索异常；文本结果不受影响）')


__all__ = ['KBSearchOutput', 'KBSearchParam', 'RetrievalFilters', 'SearchHitItem', 'VisualHitItem']
