"""评估域 DTO（RAG 清单 Phase 4 / D61）。

字段一律带 ``Field(description=...)``——它是 OpenAPI 文档来源，前端 ``generated/``
代码生成直接依赖（参见 backend/AGENTS.md §8）。
"""

from datetime import datetime
from typing import Any

from pydantic import Field

from backend.src.common.schema import SchemaBase

__all__ = [
    'EvalDatasetCreateParam',
    'EvalDatasetDetail',
    'EvalDatasetGenerateParam',
    'EvalDatasetItemDetail',
    'EvalGenerateResult',
    'EvalRunCreateParam',
    'EvalRunDetail',
    'EvalRunItemDetail',
    'EvalRunPageItem',
]


# ------------------------------------------------------------------ 数据集
class EvalDatasetCreateParam(SchemaBase):
    """手工建数据集（题目随后逐条或经生成写入）。"""

    kb_name: str = Field(max_length=64, description='被评估的知识库')
    name: str = Field(max_length=128, description='数据集名称')
    description: str = Field('', max_length=512, description='描述')


class EvalDatasetGenerateParam(SchemaBase):
    """从 KB chunks 生成问答对（LLM）。"""

    kb_name: str = Field(max_length=64, description='采样来源知识库')
    name: str = Field(max_length=128, description='生成的数据集名称')
    description: str = Field('', max_length=512, description='描述')
    item_count: int = Field(20, ge=1, description='生成题目数（受服务端上限约束）')
    sample_size: int = Field(200, ge=1, description='参与采样的分块数上限')
    model: str = Field('', max_length=128, description='生成模型 spec；空=用 RAGF_CHAT_MODEL_SPEC')


class EvalDatasetItemDetail(SchemaBase):
    """数据集题目。"""

    item_id: str = Field(description='题目 ID')
    item_index: int = Field(description='数据集内序号')
    query_text: str = Field(description='问题')
    gold_chunk_ids: list[str] = Field(default_factory=list, description='标注的相关分块 ID')
    gold_answer: str | None = Field(None, description='参考答案（缺失则该题只算检索指标）')


class EvalDatasetDetail(SchemaBase):
    """数据集详情（含标注能力声明，决定可算哪些指标）。"""

    dataset_id: str = Field(description='数据集 ID')
    kb_name: str = Field(description='所属知识库')
    name: str = Field(description='名称')
    description: str = Field('', description='描述')
    item_count: int = Field(0, description='题目数')
    has_gold_chunks: bool = Field(False, description='是否标注了相关分块（决定能否算 P/R/F1@K）')
    has_gold_answers: bool = Field(False, description='是否标注了参考答案（决定能否算 LLM Judge）')
    build_metadata: dict[str, Any] = Field(default_factory=dict, description='构建元信息')
    created_by: str | None = Field(None, description='创建者 uid')
    created_time: datetime = Field(description='创建时间')


class EvalGenerateResult(SchemaBase):
    """生成受理结果（与数据集同寿命，立即可用）。"""

    dataset_id: str = Field(description='数据集 ID')
    item_count: int = Field(description='实际生成题数')
    has_gold_chunks: bool = Field(description='是否带相关分块标注')
    has_gold_answers: bool = Field(description='是否带参考答案标注')


# ------------------------------------------------------------------ 运行
class EvalRunCreateParam(SchemaBase):
    """发起一次评估（检索配置与 Judge 模型随 run 冻结为快照）。"""

    dataset_id: str = Field(description='数据集 ID')
    name: str = Field('', max_length=128, description='运行名称（缺省自动生成）')
    retrieval_config: dict[str, Any] = Field(
        default_factory=dict, description='检索参数覆盖（search_mode/fusion_mode/recall_top_k 等）'
    )
    judge_spec: str = Field('', max_length=128, description='Judge 模型 spec；空=只算检索指标')


class EvalRunPageItem(SchemaBase):
    """运行列表项（不含逐题明细）。"""

    run_id: str = Field(description='运行 ID')
    kb_name: str = Field(description='被评估知识库')
    dataset_id: str | None = Field(None, description='数据集 ID（数据集已删则为空）')
    name: str = Field('', description='运行名称')
    status: str = Field(description='状态：pending/running/completed/failed')
    overall_score: float | None = Field(None, description='综合得分')
    total_items: int = Field(0, description='题目总数')
    completed_items: int = Field(0, description='已完成题数')
    started_time: datetime = Field(description='开始时间')
    completed_time: datetime | None = Field(None, description='完成时间')


class EvalRunDetail(EvalRunPageItem):
    """运行详情（含配置快照与聚合指标）。"""

    retrieval_config: dict[str, Any] = Field(default_factory=dict, description='检索参数快照')
    judge_spec: str = Field('', description='Judge 模型 spec')
    metrics: dict[str, float] = Field(default_factory=dict, description='聚合指标（各指标对"有值的题"取均值）')
    error_message: str | None = Field(None, description='失败原因')


class EvalRunItemDetail(SchemaBase):
    """逐题结果（"某题为什么变差"据此回答）。"""

    item_index: int = Field(description='运行内序号')
    query_text: str = Field(description='问题快照')
    gold_chunk_ids: list[str] = Field(default_factory=list, description='标注分块快照')
    gold_answer: str | None = Field(None, description='参考答案快照')
    generated_answer: str | None = Field(None, description='线上链路生成的答案')
    retrieved_chunk_ids: list[str] = Field(default_factory=list, description='实际召回的 chunk_id（有序）')
    metrics: dict[str, Any] = Field(default_factory=dict, description='逐题指标')
    error_message: str | None = Field(None, description='本题失败原因')
