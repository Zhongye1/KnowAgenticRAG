"""MCP 工具面服务（agent-layer spec §5.2/D21/D30：只读检索与问答工具集）。

工具只编排公开服务契约（retrieval/chat/kb 只读），不直连存储；文档管理类操作
（上传/删除/版本切换/同步源配置）不在本面，工具不得触发写路径（D30）。

错误码（JSON-RPC ``data.code``，稳定可重试）：``KB_NOT_FOUND`` /
``DOCUMENT_NOT_FOUND`` / ``MODEL_NOT_CONFIGURED`` / ``INVALID_REQUEST`` /
``PERMISSION_DENIED`` / ``UNKNOWN_TOOL`` / ``INTERNAL``。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from pydantic import ValidationError

from backend.src.app.chat.schema.chat import ChatMessage, ChatParam
from backend.src.app.chat.service.chat_service import chat_service
from backend.src.app.kb.crud import document_dao, knowledge_base_dao
from backend.src.app.kb.service.chunk_service import chunk_service
from backend.src.app.mcp.auth import require_perms
from backend.src.app.mcp.schemas import (
    PERM_KB_CHAT,
    PERM_KB_LIST,
    PERM_KB_READ,
    PERM_KB_SEARCH,
    AnswerArgs,
    GetDocumentArgs,
    ListArgs,
    ReadChunksArgs,
    SearchArgs,
    UserContext,
)
from backend.src.app.retrieval.service.retrieval_service import retrieval_service
from backend.src.common.exception import errors
from backend.src.common.log import log

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['TOOL_SPECS', 'McpToolkit', 'ToolError', 'classify_exception', 'mcp_toolkit']


class ToolError(Exception):
    """工具级错误：code 为稳定 JSON-RPC data.code。"""

    def __init__(self, *, code: str, msg: str) -> None:
        self.code = code
        self.msg = msg
        super().__init__(msg)


def classify_exception(exc: Exception) -> ToolError:
    """fba 语义异常 → 工具稳定错误码（检索/装配层上抛不伪装成功）。"""
    if isinstance(exc, ToolError):
        return exc
    if isinstance(exc, errors.NotFoundError):
        return ToolError(code='KB_NOT_FOUND', msg=exc.msg or '知识库或文档不存在')
    if isinstance(exc, errors.ForbiddenError):
        return ToolError(code='PERMISSION_DENIED', msg=exc.msg or '无权限执行该工具')
    if isinstance(exc, errors.RequestError):
        return ToolError(code='INVALID_REQUEST', msg=exc.msg or '请求参数错误')
    return ToolError(code='INTERNAL', msg=f'内部错误: {exc}')


@dataclass(frozen=True)
class ToolSpec:
    """工具元数据 + 权限点（tools/list 动态过滤与 handler 强制检查共用，D33）。"""

    name: str
    description: str
    input_schema: dict[str, Any]
    required: frozenset[str]
    handler: str


def _tool_specs() -> list[ToolSpec]:
    return [
        ToolSpec(
            name='list_knowledge_bases',
            description='列出当前身份可见的知识库（kb_name/display_name/doc_count）',
            input_schema=ListArgs.model_json_schema(),
            required=frozenset({PERM_KB_LIST}),
            handler='list_knowledge_bases',
        ),
        ToolSpec(
            name='search_knowledge',
            description='知识库混合检索（BM25+Dense RRF + CrossEncoder 精排），返回带引用字段的命中片段',
            input_schema=SearchArgs.model_json_schema(),
            required=frozenset({PERM_KB_SEARCH}),
            handler='search_knowledge',
        ),
        ToolSpec(
            name='answer_with_citations',
            description='检索 + chat 模型带引用汇总（answer + citations[]，D24 引用契约）',
            input_schema=AnswerArgs.model_json_schema(),
            required=frozenset({PERM_KB_CHAT}),
            handler='answer_with_citations',
        ),
        ToolSpec(
            name='read_document_chunks',
            description='按文档/版本续读已命中 chunk 窗口（非「获取文档」入口）',
            input_schema=ReadChunksArgs.model_json_schema(),
            required=frozenset({PERM_KB_READ}),
            handler='read_document_chunks',
        ),
        ToolSpec(
            name='get_document',
            description='检索溯源所需的文档定位元数据（含 active_version；全文在 Web 控制面）',
            input_schema=GetDocumentArgs.model_json_schema(),
            required=frozenset({PERM_KB_READ}),
            handler='get_document',
        ),
    ]


TOOL_SPECS = _tool_specs()
TOOLS_BY_NAME = {spec.name: spec for spec in TOOL_SPECS}


class McpToolkit:
    """只读工具集门面：``call`` 强制权限 + 参数校验 + 稳定错误码（测试可注入依赖）。"""

    def __init__(
        self,
        *,
        kb_dao: Any = None,
        doc_dao: Any = None,
        chunk_svc: Any = None,
        retrieval: Any = None,
        chat: Any = None,
    ) -> None:
        self._kb_dao = kb_dao or knowledge_base_dao
        self._doc_dao = doc_dao or document_dao
        self._chunk_svc = chunk_svc or chunk_service
        self._retrieval = retrieval or retrieval_service
        self._chat = chat or chat_service

    # ------------------------------------------------------------------ 分发
    async def call(
        self,
        db: AsyncSession,
        *,
        user: UserContext,
        tool_name: str,
        args: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """按名调用工具：权限强制检查 → 参数模型校验 → handler（D33 检查点）。"""
        spec = TOOLS_BY_NAME.get(tool_name)
        if spec is None:
            raise ToolError(code='UNKNOWN_TOOL', msg=f'未知工具: {tool_name}')
        try:
            require_perms(user, spec.required)
            handler = getattr(self, spec.handler)
            return await handler(db, user=user, raw_args=dict(args or {}))
        except ToolError:
            raise
        except errors.NotFoundError as exc:
            raise classify_exception(exc) from exc
        except errors.ForbiddenError as exc:
            raise classify_exception(exc) from exc
        except errors.RequestError as exc:
            raise classify_exception(exc) from exc
        except ValidationError as exc:
            first = exc.errors()[0]
            raise ToolError(
                code='INVALID_REQUEST',
                msg=f'参数校验失败: {first.get("loc", [])} {first.get("msg", "")}',
            ) from exc
        except Exception as exc:
            log.warning('mcp 工具执行失败 tool={} err={}', tool_name, exc)
            raise ToolError(code='INTERNAL', msg=f'内部错误: {exc}') from exc

    # ------------------------------------------------------------------ 工具
    async def list_knowledge_bases(
        self, db: AsyncSession, *, user: UserContext, raw_args: dict[str, Any]
    ) -> dict[str, Any]:
        ListArgs.model_validate(raw_args)
        kbs = await self._kb_dao.list_all(db, plugin_namespace=user.tenant)
        rows = []
        for kb in kbs:
            kb_name = str(getattr(kb, 'kb_name', ''))
            rows.append({
                'kb_name': kb_name,
                'display_name': str(getattr(kb, 'display_name', '') or kb_name),
                'description': str(getattr(kb, 'description', '') or ''),
                'doc_count': await self._doc_dao.count_by_kb(db, kb_name, plugin_namespace=user.tenant),
            })
        return {'knowledge_bases': rows}

    async def search_knowledge(
        self, db: AsyncSession, *, user: UserContext, raw_args: dict[str, Any]
    ) -> dict[str, Any]:
        args = SearchArgs.model_validate(raw_args)
        await self._ensure_kb(db, user=user, kb_name=args.kb_name)
        request: dict[str, Any] = {'query_text': args.query_text}
        if args.top_k is not None:
            request['final_top_k'] = args.top_k
        if args.use_reranker is not None:
            request['use_reranker'] = args.use_reranker
        if args.file_name is not None:
            request['file_name'] = args.file_name
        data = await self._retrieval.search(
            db,
            kb_name=args.kb_name,
            query_text=args.query_text,
            param=request,
            plugin_namespace=user.tenant,
        )
        return {
            'kb_name': data.get('kb_name'),
            'mode': data.get('mode'),
            'hit_count': len(data.get('results') or []),
            'hits': list(data.get('results') or []),
        }

    async def answer_with_citations(
        self, db: AsyncSession, *, user: UserContext, raw_args: dict[str, Any]
    ) -> dict[str, Any]:
        args = AnswerArgs.model_validate(raw_args)
        await self._ensure_kb(db, user=user, kb_name=args.kb_name)
        payload: dict[str, Any] = {'query_text': args.query_text}
        if args.model is not None:
            payload['model'] = args.model
        if args.history:
            payload['history'] = [ChatMessage.model_validate(item).model_dump() for item in args.history]
        if args.temperature is not None:
            payload['temperature'] = args.temperature
        if args.max_tokens is not None:
            payload['max_tokens'] = args.max_tokens
        param = ChatParam.model_validate(payload)
        try:
            return await self._chat.acomplete(db, kb_name=args.kb_name, param=param, plugin_namespace=user.tenant)
        except errors.RequestError as exc:
            # acomplete 中 RequestError 仅来自模型未配置（KB 已前置校验）
            raise ToolError(code='MODEL_NOT_CONFIGURED', msg=exc.msg or 'chat 模型未配置') from exc

    async def read_document_chunks(
        self, db: AsyncSession, *, user: UserContext, raw_args: dict[str, Any]
    ) -> dict[str, Any]:
        args = ReadChunksArgs.model_validate(raw_args)
        doc = await self._doc_dao.get(db, args.document_id, kb_name=args.kb_name, plugin_namespace=user.tenant)
        if doc is None:
            raise ToolError(code='DOCUMENT_NOT_FOUND', msg=f'文档不存在: {args.document_id}')
        version_id = args.version_id or int(getattr(doc, 'active_version', 1) or 1)
        rows = await self._chunk_svc.list_by_document(
            db,
            args.document_id,
            kb_name=args.kb_name,
            version_id=version_id,
            plugin_namespace=user.tenant,
        )
        total = len(rows)
        window = rows[args.offset : args.offset + args.limit]
        return {
            'document_id': args.document_id,
            'kb_name': args.kb_name,
            'version_id': version_id,
            'total_chunks': total,
            'offset': args.offset,
            'chunks': [
                {
                    'chunk_id': str(getattr(row, 'chunk_id', '') or ''),
                    'chunk_index': int(getattr(row, 'chunk_index', 0) or 0),
                    'content': str(getattr(row, 'content', '') or ''),
                    'token_count': getattr(row, 'token_count', None),
                }
                for row in window
            ],
        }

    async def get_document(self, db: AsyncSession, *, user: UserContext, raw_args: dict[str, Any]) -> dict[str, Any]:
        args = GetDocumentArgs.model_validate(raw_args)
        doc = await self._doc_dao.get(db, args.document_id, kb_name=args.kb_name, plugin_namespace=user.tenant)
        if doc is None:
            raise ToolError(code='DOCUMENT_NOT_FOUND', msg=f'文档不存在: {args.document_id}')
        active_version = int(getattr(doc, 'active_version', 1) or 1)
        return {
            'document_id': str(getattr(doc, 'document_id', '') or ''),
            'kb_name': str(getattr(doc, 'kb_name', '') or args.kb_name),
            'name': str(getattr(doc, 'name', '') or ''),
            'source_type': str(getattr(doc, 'source_type', '') or ''),
            'source_uri': getattr(doc, 'source_uri', None),
            'status': str(getattr(doc, 'status', '') or ''),
            'chunk_count': int(getattr(doc, 'chunk_count', 0) or 0),
            'active_version': active_version,
            # 版本化数据模型演进中：versions 以 chunk 实际版本为准（M11/M12 补全）
            'versions': [{'version_id': active_version, 'active': True}],
        }

    # ------------------------------------------------------------------ 内部
    async def _ensure_kb(self, db: AsyncSession, *, user: UserContext, kb_name: str) -> None:
        kb = await self._kb_dao.get(db, kb_name, plugin_namespace=user.tenant)
        if kb is None:
            raise ToolError(code='KB_NOT_FOUND', msg=f'知识库不存在: {kb_name}')


mcp_toolkit = McpToolkit()
