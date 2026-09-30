"""Agent Run 运行态接口（agent 层设计 §4.1；③ 1.12：审计从「只写」变「可读」）。

两个端点，都是**运行态的读/控**，不触发执行：

- ``GET /agent/runs/{run_id}``：状态 + 用量 + 轨迹（前端轮询 / 断线后回填）；
- ``POST /agent/runs/{run_id}/cancel``：请求取消，**幂等**——重复调用返回当前状态而不是
  409，因为「取消」在分布式下本来就可能重试（响应丢了客户端会再发一次）。

执行永远在 ``agent`` 队列的 worker 里；取消的收敛语义见 ``agent_run_service``。
属主校验在服务层：Run 行没有 uid，提交身份在排队记录上，两者求交，越权一律 404。
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path

from backend.src.app.agent.schema.agent_run import (
    AgentRunCancelResult,  # ruff: ignore[typing-only-first-party-import]  # FastAPI 响应模型需运行时解析
    AgentRunDetail,  # ruff: ignore[typing-only-first-party-import]
)
from backend.src.app.agent.service.agent_run_service import get_agent_run_service
from backend.src.app.kb.deps import (
    CurrentKbUser,  # ruff: ignore[typing-only-first-party-import]  # FastAPI 依赖别名需运行时解析
    CurrentNamespace,  # ruff: ignore[typing-only-first-party-import]
)
from backend.src.app.kb.utils.permissions import RAG_KB_AGENT
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.database.db import (
    CurrentSession,  # ruff: ignore[typing-only-first-party-import]  # FastAPI 依赖别名需运行时解析
)

router = APIRouter(prefix='/agent/runs', tags=['Agent 运行态'])

_RUN_ID = Annotated[str, Path(description='运行 ID（提交 /agent 时返回的 run_id）', pattern=r'^[0-9a-zA-Z_-]{8,64}$')]
_PERM = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_AGENT)), DependsRBAC]


@router.get('/{run_id}', summary='查询 Agent Run（状态 + 用量 + 轨迹）', dependencies=_PERM)
async def get_agent_run(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    user: CurrentKbUser,
    run_id: _RUN_ID,
) -> ResponseSchemaModel[AgentRunDetail]:
    """按 run_id 取运行快照；非本人提交的 Run 一律 404（不泄露存在性）。"""
    data = await get_agent_run_service().view(db, run_id=run_id, uid=user.user_id, plugin_namespace=current_namespace)
    return response_base.success(data=data)


@router.post('/{run_id}/cancel', summary='取消 Agent Run（幂等）', dependencies=_PERM)
async def cancel_agent_run(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    user: CurrentKbUser,
    run_id: _RUN_ID,
) -> ResponseSchemaModel[AgentRunCancelResult]:
    """请求取消：排队中直接终结，运行中置 ``cancel_requested`` 由 worker 合成收敛（D92）。"""
    data = await get_agent_run_service().cancel(db, run_id=run_id, uid=user.user_id, plugin_namespace=current_namespace)
    return response_base.success(data=data)
