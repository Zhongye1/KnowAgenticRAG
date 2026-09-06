"""知识库对话 API（agent-layer spec §6/M9：POST /knowledge_bases/{kb_name}/chat）。

SSE 事件行协议（D25）：meta / citation / delta / usage / done / error；事件行不走
fba 统一 JSON 包装（``EventSourceResponse`` 直出）。语义错误与上游错误统一以
``error`` 事件表达（chat_service.astream 全量守卫），端点不额外包 JSON 错误体。

ACL：每轮查询服务端构建 Scope（用户组展开 + KB 级 ACL 求交），下推到检索召回
内部过滤（agent-layer spec §4/§5/§9：每轮 query 重新解析，不在会话创建时固化）。
"""

from __future__ import annotations

import json

from typing import TYPE_CHECKING, Annotated, Any

from fastapi import APIRouter, Path
from sse_starlette import EventSourceResponse

from backend.src.app.chat.schema.chat import (
    ChatParam,  # ruff: ignore[typing-only-first-party-import]  # FastAPI 需运行时解析依赖/请求体注解
)
from backend.src.app.chat.service.chat_service import chat_service
from backend.src.app.kb.deps import (
    CurrentNamespace,  # ruff: ignore[typing-only-first-party-import]  # FastAPI 依赖别名需运行时解析
    CurrentScope,  # ruff: ignore[typing-only-first-party-import]
)
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.database.db import (
    CurrentSession,  # ruff: ignore[typing-only-first-party-import]  # FastAPI 依赖别名需运行时解析
)

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

router = APIRouter(dependencies=[DependsJwtAuth])


@router.post('/{kb_name}/chat', summary='知识库对话：检索 + chat 模型 SSE 流式回答')
async def chat_knowledge_base(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    scope: CurrentScope,
    kb_name: Annotated[str, Path(description='知识库标识', pattern=r'^[a-z0-9_]+$')],
    obj: ChatParam,
) -> EventSourceResponse:
    """检索命中 → 带引用上下文的流式回答；无命中短路与错误走约定事件。"""

    async def _events() -> AsyncIterator[dict[str, Any]]:
        async for event, data in chat_service.astream(
            db, kb_name=kb_name, param=obj, plugin_namespace=current_namespace, scope=scope
        ):
            # D25/§6：data 行必须是 JSON（sse-starlette 对 dict 走 str()，需先序列化）
            yield {'event': event, 'data': json.dumps(data, ensure_ascii=False)}

    return EventSourceResponse(_events(), headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
