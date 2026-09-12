"""知识库 Agentic 问答 API（agentic-rag spec D35/D38）。

两种形态共用同一门面（D25；EagleRAG query/query_stream 同构：装配与产物一致，
仅消费方式不同）：

- ``POST /{kb_name}/agent``：非流式，走 fba 统一 JSON 包装（``AgentResponse``）。
- ``POST /{kb_name}/agent/stream``：SSE 事件行协议（D25 增量扩展），经
  ``EventSourceResponse`` 直出、不套统一包装；事件顺序 step → meta → citation →
  delta → usage → done/error。语义与上游错误统一以 ``error`` 事件表达，端点不额外
  包 JSON 错误体。

与 ``/chat`` 的差异只在「谁决定检索」：``/chat`` 固定检索一次后生成，``/agent`` 由
服务端图编排 plan → act（工具循环）→ grade/rewrite → generate（D34 两层图）。
ACL 与 chat 同源：每轮按服务端构建的 Scope 下推过滤（agent-layer spec §4/§5）。
"""

from __future__ import annotations

import json

from typing import TYPE_CHECKING, Annotated, Any, cast

from fastapi import APIRouter, Depends, Path
from sse_starlette import EventSourceResponse

from backend.src.app.agent.schema.agent import (
    AgentParam,  # FastAPI 需运行时解析依赖/请求体注解
    AgentResponse,
)
from backend.src.app.agent.service.agent_service import agent_service
from backend.src.app.kb.deps import (
    CurrentNamespace,  # ruff: ignore[typing-only-first-party-import]  # FastAPI 依赖别名需运行时解析
    CurrentScope,  # ruff: ignore[typing-only-first-party-import]
)
from backend.src.app.kb.utils.permissions import RAG_KB_AGENT
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

router = APIRouter(dependencies=[DependsJwtAuth, Depends(RequestPermission(RAG_KB_AGENT)), DependsRBAC])

_KB_NAME = Annotated[str, Path(description='知识库标识', pattern=r'^[a-z0-9_]+$')]


@router.post('/{kb_name}/agent', summary='知识库 Agent 问答：规划 + 工具检索 + 自省 + 非流式回答')
async def agent_knowledge_base(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    scope: CurrentScope,
    kb_name: _KB_NAME,
    obj: AgentParam,
) -> ResponseSchemaModel[AgentResponse]:
    """服务端图编排（plan/act/grade/rewrite/generate）后返回带引用的完整回答。

    语义错误走 HTTP：KB 不存在/无权同形态 404（D50）、参数/模型未配置 400（fba 统一异常面）。
    """
    if kb_name not in scope.allowed_kbs:
        raise errors.NotFoundError(msg='知识库不存在')
    data = await agent_service.acomplete(
        db, kb_name=kb_name, param=obj, plugin_namespace=current_namespace, scope=scope
    )
    return cast(
        'ResponseSchemaModel[AgentResponse]',
        response_base.success(data=AgentResponse.model_validate(data)),
    )


@router.post('/{kb_name}/agent/stream', summary='知识库 Agent 问答：SSE 流式（step 轨迹 + 引用 + 逐帧回答）')
async def agent_knowledge_base_stream(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    scope: CurrentScope,
    kb_name: _KB_NAME,
    obj: AgentParam,
) -> EventSourceResponse:
    """规划/检索/自省 step 即时推送 → 引用 → 逐帧 delta → 自包含 done；错误走约定事件。"""

    async def _events() -> AsyncIterator[dict[str, Any]]:
        async for event, data in agent_service.astream(
            db, kb_name=kb_name, param=obj, plugin_namespace=current_namespace, scope=scope
        ):
            # D25/§6：data 行必须是 JSON（sse-starlette 对 dict 走 str()，需先序列化）
            yield {'event': event, 'data': json.dumps(data, ensure_ascii=False)}

    return EventSourceResponse(_events(), headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
