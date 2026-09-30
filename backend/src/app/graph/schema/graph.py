"""图谱域 DTO（RAG 清单 Phase 5 / D62）。

字段带 ``Field(description=...)`` 是 OpenAPI 文档来源，前端 ``generated/`` 代码生成依赖它。
"""

from typing import Any

from pydantic import Field

from backend.src.common.schema import SchemaBase

__all__ = ['GraphBuildAccepted', 'GraphBuildParam', 'GraphDeleteResult', 'GraphStatsDetail', 'GraphSubgraphDetail']


class GraphBuildParam(SchemaBase):
    """触发建图的参数。"""

    document_id: str = Field(description='要建图的文档 ID')
    extractor_spec: str = Field('', max_length=128, description='抽取模型 spec；空=用 RAGF_GRAPH_EXTRACTOR_SPEC')


class GraphBuildAccepted(SchemaBase):
    """建图受理结果（异步：任务已派发）。"""

    document_id: str = Field(description='文档 ID')
    queued: bool = Field(description='是否已派发（重复建图会覆盖，故恒为 True）')


class GraphStatsDetail(SchemaBase):
    """图谱规模统计。"""

    kb_name: str = Field(description='知识库')
    entities: int = Field(0, description='实体数')
    triples: int = Field(0, description='三元组数')
    mentions: int = Field(0, description='提及数')
    documents: int = Field(0, description='已建图文档数')


class GraphSubgraphDetail(SchemaBase):
    """子图投影（供可视化与排查）。"""

    kb_name: str = Field(description='知识库')
    seed_entity_ids: list[str] = Field(default_factory=list, description='种子实体 ID')
    nodes: list[dict[str, Any]] = Field(default_factory=list, description='节点（Entity / Chunk）')
    edges: list[dict[str, str]] = Field(default_factory=list, description='边（提及 / 关系）')


class GraphDeleteResult(SchemaBase):
    """删除结果。"""

    kb_name: str = Field(description='知识库')
    deleted: dict[str, int] = Field(default_factory=dict, description='各表删除行数')
