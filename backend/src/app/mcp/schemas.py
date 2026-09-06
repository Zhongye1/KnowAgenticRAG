"""mcp 域 DTO 与工具面常量（agent-layer spec §5.2/§5.5，D21/D30-D33）。

权限点直接映射既有 RBAC 命名（``rag:kb:*``）；三类凭证归一为 ``UserContext``，
tool 层强制检查只依赖 ``scp``，凭证形态不外泄（D33）。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from pydantic import ConfigDict, Field

from backend.src.app.kb.utils.permissions import (
    RAG_KB_CHAT,
    RAG_KB_LIST,
    RAG_KB_READ,
    RAG_KB_READ_SCOPES,
    RAG_KB_SEARCH,
)
from backend.src.app.retrieval.schema.search_result import (
    RetrievalFilters,  # ruff: ignore[typing-only-first-party-import]  # pydantic 需运行时解析字段前向引用
)
from backend.src.common.schema import SchemaBase

__all__ = [
    'PERM_KB_CHAT',
    'PERM_KB_LIST',
    'PERM_KB_READ',
    'PERM_KB_SEARCH',
    'READ_SCOPES',
    'AnswerArgs',
    'GetDocumentArgs',
    'ListArgs',
    'ReadChunksArgs',
    'SearchArgs',
    'ToolMethod',
    'UserContext',
]

# D30：MCP 不发明第二套权限模型——权限码单一来源在 kb/utils/permissions.py
PERM_KB_LIST = RAG_KB_LIST
PERM_KB_SEARCH = RAG_KB_SEARCH
PERM_KB_READ = RAG_KB_READ
PERM_KB_CHAT = RAG_KB_CHAT

READ_SCOPES = RAG_KB_READ_SCOPES
ToolMethod = Literal['initialize', 'ping', 'tools/list', 'tools/call']


@dataclass(frozen=True)
class UserContext:
    """多凭证归一后的调用方身份：tool 层唯一的鉴权依据。"""

    sub: str
    tenant: str
    scp: frozenset[str] = field(default_factory=frozenset)

    def has_perms(self, required: frozenset[str]) -> bool:
        """是否具备全部所需权限点。"""
        return required <= self.scp


class ListArgs(SchemaBase):
    """list_knowledge_bases：无参数。"""

    model_config = ConfigDict(extra='forbid')


class SearchArgs(SchemaBase):
    """search_knowledge：同步混合检索（M11/D27：跨 KB 聚合 + 结构化过滤）。"""

    model_config = ConfigDict(extra='forbid')

    kb_names: list[str] = Field(min_length=1, max_length=20, description='知识库标识列表（跨 KB 聚合，逐库归属校验）')
    query_text: str = Field(min_length=1, max_length=2000, description='检索文本')
    top_k: int | None = Field(None, ge=1, le=50, description='最终返回条数覆盖')
    use_reranker: bool | None = Field(None, description='是否精排覆盖')
    file_name: str | None = Field(None, max_length=255, description='文件名关键词过滤')
    filters: RetrievalFilters | None = Field(None, description='结构化过滤（M11/D26）')


class AnswerArgs(SchemaBase):
    """answer_with_citations：跨 KB 检索 + LLM 带引用汇总（等价 Yuxi query_kb）。"""

    model_config = ConfigDict(extra='forbid')

    kb_names: list[str] = Field(min_length=1, max_length=20, description='知识库标识列表（跨 KB 聚合，逐库归属校验）')
    query_text: str = Field(min_length=1, max_length=2000, description='用户问题')
    model: str | None = Field(None, description='chat 模型 spec；缺省 RAGF_CHAT_MODEL_SPEC')
    history: list[dict[str, str]] = Field(
        default_factory=list, description='多轮历史 [{role: user|assistant|system, content}]'
    )
    temperature: float | None = Field(None, ge=0.0, le=2.0, description='采样温度')
    max_tokens: int | None = Field(None, ge=1, le=32768, description='单轮最大生成 token')
    top_k: int | None = Field(None, ge=1, le=50, description='最终返回条数覆盖')
    use_reranker: bool | None = Field(None, description='是否精排覆盖')
    file_name: str | None = Field(None, max_length=255, description='文件名关键词过滤')
    filters: RetrievalFilters | None = Field(None, description='结构化过滤（M11/D26）')


class ReadChunksArgs(SchemaBase):
    """read_document_chunks：已命中 chunk 窗口续读（非「获取文档」入口）。"""

    model_config = ConfigDict(extra='forbid')

    kb_name: str = Field(min_length=1, max_length=100, description='知识库标识')
    document_id: str = Field(min_length=1, max_length=255, description='文档 ID')
    version_id: int | None = Field(None, ge=1, description='版本；缺省 active_version')
    offset: int = Field(0, ge=0, description='跳过块数')
    limit: int = Field(20, ge=1, le=200, description='返回块数上限')


class GetDocumentArgs(SchemaBase):
    """get_document：检索溯源所需的定位元数据（全文查看/下载在 Web 控制面）。"""

    model_config = ConfigDict(extra='forbid')

    kb_name: str = Field(min_length=1, max_length=100, description='知识库标识')
    document_id: str = Field(min_length=1, max_length=255, description='文档 ID')
