"""Agent 只读工具集（D30 只读边界；D37 复用 MCP 工具语义，不复用其传输）。

强制点与 ``/chat`` 一致，而非 MCP 的 ``scp`` 检查：

1. 路由级 ``rag:kb:agent`` 权限（``agent/api/v1/agent.py`` 的依赖链）；
2. 服务端构建的 ``Scope``（ACL 下推），工具**不接受**任何客户端过滤语义；
3. ``kb_names`` 先与 ``scope.allowed_kbs`` 求交，再进入召回（防 IDOR）。

工具经闭包注入 ``ToolContext``（db/scope/命名空间/目标库 + 命中收集器），
避免依赖 LangGraph 的 runtime 注入，节点与工具均可脱离图单测。
"""

from __future__ import annotations

import json

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from langchain_core.tools import BaseTool, tool

from backend.src.app.agent.graph.stream_bridge import emit_step
from backend.src.app.kb.crud import document_dao, knowledge_base_dao
from backend.src.app.kb.service.chunk_service import chunk_service
from backend.src.app.retrieval.service.retrieval_service import retrieval_service
from backend.src.common.log import log

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from backend.src.app.retrieval.schema.search_result import KBSearchParam

__all__ = ['AGENT_TOOL_NAMES', 'ToolContext', 'build_tools']

_CHUNK_PREVIEW = 1200  # 单条命中回灌给模型的正文上限，防止工具结果吃满上下文
_READ_WINDOW = 3  # read_document_chunks 单次返回的 chunk 数上限


@dataclass
class ToolContext:
    """一次 Agent 运行的工具依赖与副作用收集器。"""

    db: AsyncSession
    scope: Any
    plugin_namespace: str | None
    kb_names: list[str]
    param: KBSearchParam | None = None
    collected: list[dict[str, Any]] = field(default_factory=list)
    last_retrieval: dict[str, Any] = field(default_factory=dict)
    tool_calls: int = 0
    # 按工具名分桶（可观测：Grafana 工具调用分布；done.agent 一并透出）
    tool_calls_by_name: dict[str, int] = field(default_factory=dict)

    def note_tool_call(self, name: str) -> None:
        """记账一次工具调用（总量 + 工具名分桶）。"""
        self.tool_calls += 1
        key = str(name)
        self.tool_calls_by_name[key] = self.tool_calls_by_name.get(key, 0) + 1

    def allowed_names(self) -> list[str]:
        """目标库与 ACL 允许集求交（scope 为空表示不限，仅用于测试替身）。"""
        allowed = getattr(self.scope, 'allowed_kbs', None)
        if allowed is None:
            return list(self.kb_names)
        allowed_set = {str(item) for item in allowed}
        return [name for name in self.kb_names if name in allowed_set]

    def collect(self, hits: list[dict[str, Any]]) -> None:
        """按 chunk_id 去重收集命中（跨多次工具调用累计）。"""
        seen = {str(item.get('chunk_id') or '') for item in self.collected}
        for hit in hits:
            chunk_id = str(hit.get('chunk_id') or '')
            if chunk_id and chunk_id not in seen:
                seen.add(chunk_id)
                self.collected.append(hit)


def _preview(content: str) -> str:
    text = str(content or '')
    return text if len(text) <= _CHUNK_PREVIEW else f'{text[:_CHUNK_PREVIEW]}…'


def _dumps(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _list_kbs_tool(ctx: ToolContext) -> BaseTool:
    """工具：列出当前身份可访问的知识库。"""

    @tool
    async def list_knowledge_bases() -> str:
        """列出当前可访问的知识库（kb_name / 展示名 / 文档数）。

        当你不确定该查哪个库时先调用本工具；已知 kb_name 时可直接检索。
        """
        ctx.note_tool_call('list_knowledge_bases')
        rows = []
        for kb in await knowledge_base_dao.list_all(ctx.db, plugin_namespace=ctx.plugin_namespace):
            kb_name = str(getattr(kb, 'kb_name', '') or '')
            if kb_name not in ctx.allowed_names():
                continue
            rows.append({
                'kb_name': kb_name,
                'display_name': str(getattr(kb, 'display_name', '') or kb_name),
                'doc_count': await document_dao.count_by_kb(ctx.db, kb_name, plugin_namespace=ctx.plugin_namespace),
            })
        return _dumps({'knowledge_bases': rows})

    return list_knowledge_bases


def _search_tool(ctx: ToolContext) -> BaseTool:
    """工具：知识库混合检索 + 精排。"""

    @tool
    async def search_knowledge(query: str) -> str:
        """在知识库中检索与 query 最相关的片段（混合检索 + 精排）。

        query 应是自包含的检索式（含关键术语），不要传入完整对话或指令。
        返回片段含 chunk_id / document_id / kb_name / score / content，
        需要看某片段上下文时用 read_document_chunks 续读。
        """
        ctx.note_tool_call('search_knowledge')
        names = ctx.allowed_names()
        if not names:
            return _dumps({'error': '当前没有可访问的知识库'})
        emit_step('search', f'工具检索：{query[:40]}')
        data = await retrieval_service.search_multi(
            ctx.db,
            kb_names=names,
            query_text=str(query),
            param=ctx.param,
            plugin_namespace=ctx.plugin_namespace,
            scope=ctx.scope,
        )
        hits = list(data.get('results') or [])
        ctx.collect(hits)
        ctx.last_retrieval = data
        log.debug('agent 工具检索 kb={} query={} hits={}', names, query, len(hits))
        return _dumps({
            'count': len(hits),
            'hits': [
                {
                    'chunk_id': str(hit.get('chunk_id') or ''),
                    'document_id': str(hit.get('document_id') or ''),
                    'kb_name': str(hit.get('kb_name') or ''),
                    'score': float((hit.get('metadata') or {}).get('score') or hit.get('score') or 0.0),
                    'content': _preview(str(hit.get('content') or '')),
                }
                for hit in hits
            ],
        })

    return search_knowledge


def _read_chunks_tool(ctx: ToolContext) -> BaseTool:
    """工具：按窗口续读文档分块原文。"""

    @tool
    async def read_document_chunks(document_id: str, offset: int = 0) -> str:
        """按窗口续读已命中文档的分块原文（chunk 不足以上下文时使用）。

        document_id 来自检索结果的 document_id；offset 为起始 chunk 序号。
        """
        ctx.note_tool_call('read_document_chunks')
        for kb_name in ctx.allowed_names():
            payload = await _read_window(ctx, document_id=document_id, kb_name=kb_name, offset=offset)
            if payload is not None:
                return _dumps(payload)
        return _dumps({'error': f'文档不存在或无权访问: {document_id}'})

    return read_document_chunks


def _get_document_tool(ctx: ToolContext) -> BaseTool:
    """工具：文档定位元数据。"""

    @tool
    async def get_document(document_id: str) -> str:
        """获取文档的定位元数据（文件名 / 来源 / 状态 / 版本 / chunk 数）。

        用于回答「这份文档是什么」「最新版本是几」这类溯源问题。
        """
        ctx.note_tool_call('get_document')
        for kb_name in ctx.allowed_names():
            doc = await document_dao.get(ctx.db, document_id, kb_name=kb_name, plugin_namespace=ctx.plugin_namespace)
            if doc is None:
                continue
            return _dumps({
                'document_id': str(getattr(doc, 'document_id', '') or ''),
                'kb_name': str(getattr(doc, 'kb_name', '') or kb_name),
                'name': str(getattr(doc, 'name', '') or ''),
                'source_type': str(getattr(doc, 'source_type', '') or ''),
                'status': str(getattr(doc, 'status', '') or ''),
                'chunk_count': int(getattr(doc, 'chunk_count', 0) or 0),
                'active_version': int(getattr(doc, 'active_version', 1) or 1),
            })
        return _dumps({'error': f'文档不存在或无权访问: {document_id}'})

    return get_document


async def _read_window(ctx: ToolContext, *, document_id: str, kb_name: str, offset: int) -> dict[str, Any] | None:
    """读取单库内文档的一个 chunk 窗口；文档不存在返回 None。"""
    doc = await document_dao.get(ctx.db, document_id, kb_name=kb_name, plugin_namespace=ctx.plugin_namespace)
    if doc is None:
        return None
    version_id = int(getattr(doc, 'active_version', 1) or 1)
    rows = await chunk_service.list_by_document(
        ctx.db,
        document_id,
        kb_name=kb_name,
        version_id=version_id,
        plugin_namespace=ctx.plugin_namespace,
    )
    start = max(0, int(offset))
    return {
        'document_id': document_id,
        'kb_name': kb_name,
        'version_id': version_id,
        'total_chunks': len(rows),
        'offset': start,
        'chunks': [
            {
                'chunk_id': str(getattr(row, 'chunk_id', '') or ''),
                'chunk_index': int(getattr(row, 'chunk_index', 0) or 0),
                'content': _preview(str(getattr(row, 'content', '') or '')),
            }
            for row in rows[start : start + _READ_WINDOW]
        ],
    }


def build_tools(ctx: ToolContext) -> list[BaseTool]:
    """构建本次运行的只读工具集（每请求一次，闭包携带依赖）。"""
    return [_list_kbs_tool(ctx), _search_tool(ctx), _read_chunks_tool(ctx), _get_document_tool(ctx)]


AGENT_TOOL_NAMES = ('list_knowledge_bases', 'search_knowledge', 'read_document_chunks', 'get_document')
