"""agent 域 DTO（agentic-rag spec D35/D38：``/agent`` 与 ``/agent/stream`` 双形态）。

请求 = chat 检索/生成参数超集 + Agent 预算旋钮（D36 三重预算的客户端可调部分）；
响应 = chat 响应超集 + ``agent`` 元数据（规划/自省轨迹），故复用 chat 的
``CitationItem``/``ChatUsage`` 与 retrieval 的 ``RouteInfoItem``/``QueryStepItem``，
不发明第二套引用与轨迹模型。
"""

from __future__ import annotations

from pydantic import ConfigDict, Field

from backend.src.app.chat.schema.chat import (
    ChatDoneReason,
    ChatParam,
    ChatUsage,
    CitationItem,
)
from backend.src.app.retrieval.schema.rag_query import (
    ImageSourceItem,  # ruff: ignore[typing-only-first-party-import]  # pydantic 需运行时解析字段前向引用
    QueryStepItem,  # ruff: ignore[typing-only-first-party-import]
    RouteInfoItem,  # ruff: ignore[typing-only-first-party-import]
)
from backend.src.common.schema import SchemaBase

__all__ = ['AgentParam', 'AgentPlanInfo', 'AgentResponse']


class AgentParam(ChatParam):
    """Agentic 问答请求（D35）：chat 参数的超集，另加 Agent 预算旋钮。

    客户端只能**收紧**预算：``max_steps`` 会被服务端 ``RAGF_AGENT_MAX_STEPS_HARD``
    截断，``max_rewrites`` 同理不可超过服务端默认（D36 防绕过）。
    """

    model_config = ConfigDict(extra='forbid')

    max_steps: int | None = Field(None, ge=1, description='外层图步数预算（服务端有硬上限，超出按硬上限执行）')
    allow_rewrite: bool | None = Field(None, description='是否允许 T3 自省改写（false = 一次检索即生成）')
    max_sub_queries: int | None = Field(None, ge=1, le=10, description='规划子查询条数上限覆盖')
    min_score: float | None = Field(None, ge=0.0, le=1.0, description='自省判据阈值覆盖（精排最高分低于此值触发改写）')


class AgentPlanInfo(SchemaBase):
    """Agent 元数据（done 事件的 ``agent`` 对象 / 非流式响应的 ``agent`` 字段）。"""

    need_retrieval: bool = Field(True, description='T1 自主决策：本轮是否执行了检索')
    sub_queries: list[str] = Field(default_factory=list, description='规划产出的检索子查询')
    plan_rationale: str = Field('', description='规划理由（一句话）')
    grade_score: float = Field(0.0, description='自省判据：精排最高分')
    rewrites: int = Field(0, description='实际发生的改写次数（受服务端预算封顶）')
    tool_calls: int = Field(0, description='内层工具循环的累计调用次数')
    tool_calls_by_name: dict[str, int] = Field(
        default_factory=dict, description='工具调用按工具名分桶（Grafana 分布 + 前端解释「查了什么」）'
    )


class AgentResponse(SchemaBase):
    """非流式 Agent 问答响应（字段 = 流式事件负载并集，与 ``done`` 同源）。

    回答中 ``[n]`` 序号与 ``citations[].n`` 对应；``agent`` 保留规划与自省轨迹，
    便于前端解释「为什么检索了这些子查询 / 为什么改写」。
    """

    kb_name: str = Field(description='知识库标识（单库路径参数）')
    kb_names: list[str] = Field(default_factory=list, description='本次检索的知识库（单库为单元素）')
    mode: str = Field('hybrid', description='实际生效检索模式：vector / hybrid')
    model_spec: str = Field('', description='实际生效 chat 模型 spec（provider_id:model_id）')
    hit_count: int = Field(0, description='文本命中数（精排后 final_top_k 内）')
    visual_count: int = Field(0, description='视觉召回命中数（不进引用）')
    answer: str = Field(description='完整回答文本（无命中时为约定文案）')
    reason: ChatDoneReason = Field(description='结束原因：complete / empty_result / max_tokens')
    citations: list[CitationItem] = Field(default_factory=list, description='引用条目（D24）')
    images: list[ImageSourceItem] = Field(default_factory=list, description='视觉来源（经 /rag/images 回源）')
    route: RouteInfoItem = Field(description='路由信息（显式参数语义，selector=explicit）')
    steps: list[QueryStepItem] = Field(
        default_factory=list, description='过程轨迹（plan/act/grade/rewrite/generate 按执行序）'
    )
    agent: AgentPlanInfo = Field(
        default_factory=lambda: AgentPlanInfo(
            need_retrieval=True,
            sub_queries=[],
            plan_rationale='',
            grade_score=0.0,
            rewrites=0,
            tool_calls=0,
            tool_calls_by_name={},
        ),
        description='Agent 规划与自省元数据',
    )
    usage: ChatUsage = Field(default_factory=ChatUsage, description='token 用量')
