"""chat 域 DTO（ragf-design D18/M9：检索覆盖层 + chat 参数；SSE 事件行不走统一 JSON body）。"""

from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from backend.src.app.retrieval.schema.search_result import (
    RetrievalFilters,  # ruff: ignore[typing-only-first-party-import]  # pydantic 需运行时解析字段前向引用
)
from backend.src.common.schema import SchemaBase

ChatRole = Literal['user', 'assistant', 'system']

ThinkingLevel = Literal['off', 'low', 'medium', 'high']

# 随问附件限制：轻量文本注入本轮上下文，不入库不建索引
MAX_ATTACHMENTS = 4
ATTACHMENT_CONTENT_MAX_LENGTH = 32_000


class ChatMessage(SchemaBase):
    """多轮历史消息（首版无服务端会话，由调用方显式传入）。"""

    role: ChatRole = 'user'
    content: str = Field(min_length=1, max_length=20000, description='消息内容')


class ChatAttachment(SchemaBase):
    """随问文本附件（filename + 纯文本内容，仅注入本轮对话上下文）。"""

    filename: str = Field(min_length=1, max_length=255, description='附件文件名')
    content: str = Field(min_length=1, max_length=ATTACHMENT_CONTENT_MAX_LENGTH, description='文本内容')


class ChatParam(SchemaBase):
    """知识库对话请求：检索覆盖层同 search 键（request > KB query_params > settings）+ chat 参数。"""

    model_config = ConfigDict(extra='forbid')

    query_text: str = Field(min_length=1, max_length=2000, description='用户问题（同时用于混合检索 BM25 原文）')
    model: str | None = Field(None, description='chat 模型 spec（provider_id:model_id）；缺省走 RAGF_CHAT_MODEL_SPEC')
    thinking_level: ThinkingLevel | None = Field(
        None, description='思考等级：low/medium/high → reasoning_effort，off → enable_thinking=False（Qwen 系）'
    )
    history: list[ChatMessage] = Field(default_factory=list, description='多轮历史（近 N 轮由服务端截断）')
    attachments: list[ChatAttachment] = Field(
        default_factory=list, max_length=MAX_ATTACHMENTS, description=f'随问文本附件（≤{MAX_ATTACHMENTS} 个）'
    )
    temperature: float | None = Field(None, ge=0.0, le=2.0, description='采样温度（缺省 settings 默认）')
    max_tokens: int | None = Field(None, ge=1, le=32768, description='单轮最大生成 token')
    search_mode: Literal['vector', 'hybrid'] | None = Field(None, description='检索模式覆盖')
    recall_top_k: int | None = Field(None, ge=1, le=200, description='召回候选数覆盖')
    final_top_k: int | None = Field(None, ge=1, le=50, description='最终返回条数覆盖')
    similarity_threshold: float | None = Field(None, ge=0.0, le=1.0, description='vector 模式余弦阈值覆盖')
    use_reranker: bool | None = Field(None, description='是否精排覆盖')
    file_name: str | None = Field(None, max_length=255, description='可选文件名关键词过滤覆盖')
    filters: RetrievalFilters | None = Field(None, description='结构化过滤覆盖（M11/D26：与 file_name 合并）')


class CitationItem(SchemaBase):
    """引用条目（D24：稳定到版本，供溯源/对比）。"""

    n: int = Field(description='引用编号（回答中以 [n] 标注）')
    kb_name: str = Field(description='知识库标识')
    document_id: str = Field(description='文档 ID')
    version_id: int = Field(1, description='版本')
    chunk_id: str = Field(description='分块 ID（{document_id}:{version_id}:{idx}）')
    source: str = Field('', description='来源文件名')
    score: float = Field(0.0, description='相关度得分')
    content: str = Field(description='片段原文')
