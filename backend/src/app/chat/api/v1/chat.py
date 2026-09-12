"""知识库对话 API（agent-layer spec §6/M9）。

两种形态共用同一门面（D25；EagleRAG query/query_stream 同构：装配与产物一致，
仅生成调用分阻塞/流式）：

- ``POST /{kb_name}/chat``：非流式，走 fba 统一 JSON 包装（``ChatResponse``）。
- ``POST /{kb_name}/chat/stream``：SSE 事件行协议（D25），经 ``EventSourceResponse``
  直出、不套统一包装；事件顺序 step → meta → citation → delta → usage → done/error。
  语义错误与上游错误统一以 ``error`` 事件表达（chat_service.astream 全量守卫），
  端点不额外包 JSON 错误体。

ACL：每轮查询服务端构建 Scope（用户组展开 + KB 级 ACL 求交），下推到检索召回
内部过滤（agent-layer spec §4/§5/§9：每轮 query 重新解析，不在会话创建时固化）。
"""

from __future__ import annotations

import json

from typing import TYPE_CHECKING, Annotated, Any, cast

from fastapi import APIRouter, Depends, Path
from sse_starlette import EventSourceResponse

from backend.src.app.chat.schema.chat import (
    ChatParam,  # FastAPI 需运行时解析依赖/请求体注解
    ChatResponse,
)
from backend.src.app.chat.service.chat_service import chat_service
from backend.src.app.kb.deps import (
    CurrentNamespace,  # ruff: ignore[typing-only-first-party-import]  # FastAPI 依赖别名需运行时解析
    CurrentScope,  # ruff: ignore[typing-only-first-party-import]
)
from backend.src.app.kb.utils.permissions import RAG_KB_CHAT
from backend.src.common.exception import errors
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.database.db import (
    CurrentSession,  # ruff: ignore[typing-only-first-party-import]  # FastAPI 依赖别名需运行时解析
)

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

router = APIRouter(dependencies=[DependsJwtAuth, Depends(RequestPermission(RAG_KB_CHAT)), DependsRBAC])

_KB_NAME = Annotated[str, Path(description='知识库标识', pattern=r'^[a-z0-9_]+$')]


@router.post('/{kb_name}/chat', summary='知识库问答：检索 + chat 模型非流式回答')
async def chat_knowledge_base(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    scope: CurrentScope,
    kb_name: _KB_NAME,
    obj: ChatParam,
) -> ResponseSchemaModel[ChatResponse]:
    """检索命中 → 带引用上下文的完整回答（字段 = 流式各事件负载并集）。

    语义错误走 HTTP：KB 不存在/无权同形态 404（D50）、参数/模型未配置 400（fba 统一异常面）。
    """
    if kb_name not in scope.allowed_kbs:
        raise errors.NotFoundError(msg='知识库不存在')
    data = await chat_service.acomplete(db, kb_name=kb_name, param=obj, plugin_namespace=current_namespace, scope=scope)
    return cast(
        'ResponseSchemaModel[ChatResponse]',
        response_base.success(data=ChatResponse.model_validate(data)),
    )


@router.post('/{kb_name}/chat/stream', summary='知识库问答：检索 + chat 模型 SSE 流式回答')
async def chat_knowledge_base_stream(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    scope: CurrentScope,
    kb_name: _KB_NAME,
    obj: ChatParam,
) -> EventSourceResponse:
    """检索 step 即时推送 → 引用 → 逐帧 delta → 自包含 done；错误走约定事件。"""
    if kb_name not in scope.allowed_kbs:
        raise errors.NotFoundError(msg='知识库不存在')

    async def _events() -> AsyncIterator[dict[str, Any]]:
        async for event, data in chat_service.astream(
            db, kb_name=kb_name, param=obj, plugin_namespace=current_namespace, scope=scope
        ):
            # D25/§6：data 行必须是 JSON（sse-starlette 对 dict 走 str()，需先序列化）
            yield {'event': event, 'data': json.dumps(data, ensure_ascii=False)}

    return EventSourceResponse(_events(), headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
