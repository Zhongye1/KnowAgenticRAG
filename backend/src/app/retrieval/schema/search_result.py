"""检索域 DTO（ragf-design §5.7/§7/§14.12：检索结果 payload = 跨服务契约）。

单次请求参数为临时覆盖层（优先级 request > KB ``query_params`` > settings，
D17）；``file_name`` 为可选的文档名关键词过滤（对齐 Yuxi ``SearchInputSchema``，
经 kb 文档登记解析为 ``document_id`` 过滤表达式）。
"""

from typing import Any, Literal

from pydantic import ConfigDict, Field

from backend.src.common.schema import SchemaBase

__all__ = ['KBSearchOutput', 'KBSearchParam', 'SearchHitItem']


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
    file_name: str | None = Field(None, max_length=255, description='可选文件名关键词过滤（命中 0 个文档返回空）')


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


class KBSearchOutput(SchemaBase):
    """同步检索输出"""

    kb_name: str = Field(description='知识库标识')
    mode: str = Field(description='实际生效检索模式：vector / hybrid')
    recall_count: int = Field(0, description='召回候选数（精排前）')
    reranked: bool = Field(False, description='是否完成精排')
    degraded: bool = Field(False, description='精排失败降级为召回序（§A.5）')
    duration_ms: int = Field(0, description='检索耗时（毫秒）')
    results: list[SearchHitItem] = Field(default_factory=list, description='按相关度降序的最终结果')
