"""知识库对话 API（agent-layer spec §6/M9：POST /knowledge_bases/{kb_name}/chat）。

SSE 事件行协议（D25）：meta / citation / delta / usage / done / error；事件行不走
fba 统一 JSON 包装（``EventSourceResponse`` 直出）。语义错误与上游错误统一以
``error`` 事件表达（chat_service.astream 全量守卫），端点不额外包 JSON 错误体。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, Any

from fastapi import APIRouter, Path
from sse_starlette import EventSourceResponse

from backend.src.app.chat.service.chat_service import chat_service
from backend.src.common.security.jwt import DependsJwtAuth

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from backend.src.app.chat.schema.chat import ChatParam
    from backend.src.app.kb.deps import CurrentNamespace
    from backend.src.database.db import CurrentSession

router = APIRouter(dependencies=[DependsJwtAuth])


@router.post('/{kb_name}/chat', summary='知识库对话：检索 + chat 模型 SSE 流式回答')
async def chat_knowledge_base(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str, Path(description='知识库标识', pattern=r'^[a-z0-9_]+$')],
    obj: ChatParam,
) -> EventSourceResponse:
    """检索命中 → 带引用上下文的流式回答；无命中短路与错误走约定事件。"""

    async def _events() -> AsyncIterator[dict[str, Any]]:
        async for event, data in chat_service.astream(
            db, kb_name=kb_name, param=obj, plugin_namespace=current_namespace
        ):
            yield {'event': event, 'data': data}

    return EventSourceResponse(_events(), headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
