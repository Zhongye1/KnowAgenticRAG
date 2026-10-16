"""Run 事件流的信封与载荷模型。

事件流的形状此前只存在于约定里：`format_sse` 拼裸 dict，`text/event-stream` 不进
OpenAPI，前端按事件名与字段名读取。这里把信封和六个 wire 事件名的载荷建模，由
`run_queue_service.build_run_event_envelope` 在产侧构造，让事件名、终态取值这类判别性
字段在写事件时就失败，而不是留到前端落进兜底分支。

`payload` 建模到控制字段；`chunk`、`msg`、`stream_event` 是 LLM 流载荷，字段跨多个
producer 且仍在演进，保持开放对象，并在载荷基类上允许额外键，避免建模反而丢字段。

信封与事件模型同时是 `GET /api/agent/runs/{run_id}/events` 的响应契约，注册方式见
`server/utils/openapi_run_events.py`。
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

RUN_EVENT_SCHEMA_VERSION = 1
RUN_EVENT_SCHEMA_NAME = "RunEvent"
RUN_EVENT_SCHEMA_REF = {"$ref": f"#/components/schemas/{RUN_EVENT_SCHEMA_NAME}"}

# 终态的事实源是仓库状态机（`AGENT_RUN_TERMINAL_STATUSES`）。此处显式展开是为了让
# `Literal` 可被静态识别，两者的一致性由 `test_run_event_models.py` 的用例守住。
RunEventStatus = Literal["completed", "failed", "cancelled", "interrupted"]


class RunEventPayload(BaseModel):
    """载荷基类：控制字段之外一律原样保留。"""

    model_config = ConfigDict(extra="allow")


class MetadataPayload(RunEventPayload):
    request_id: str | None = None
    agent_slug: str | None = None
    uid: str | None = None
    source: str | None = None
    run_type: str | None = None
    created_by_run_id: str | None = None
    subagent_slug: str | None = None
    agent_invocation_meta: dict[str, Any] | None = None


class MessagesPayload(RunEventPayload):
    """进度事件：新增分片走 `items`，单条分片走 `chunk`。"""

    items: list[Any] | None = None
    chunk: dict[str, Any] | None = None


class CustomPayload(RunEventPayload):
    """自定义事件：`name` 区分 `ars.agent_state`、`ars.warning` 与 `ars.<status>`。"""

    name: str
    chunk: dict[str, Any] | None = None
    agent_state: dict[str, Any] | None = None


class InterruptPayload(RunEventPayload):
    reason: str
    chunk: dict[str, Any] | None = None


class ErrorPayload(RunEventPayload):
    """运行错误；`run_id`/`message`/`reason` 来自事件流自身不可用的那条分支。"""

    chunk: dict[str, Any] | None = None
    retryable: bool | None = None
    run_id: str | None = None
    message: str | None = None
    reason: str | None = None


class EndPayload(RunEventPayload):
    status: RunEventStatus
    request_id: str | None = None
    chunk: dict[str, Any] | None = None


class RunEventEnvelope(BaseModel):
    """信封公共字段；`event` 由各事件模型收窄为判别键。

    `request_id` 只在 `verbose=false` 的信封上出现（紧凑路径从载荷里抽出来提到顶层），
    verbose 路径不传它因此不会出现在 dump 结果里；声明成可选字段是为了让紧凑形状也满足
    这份 schema——浏览器默认走 `verbose=false`。
    """

    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = RUN_EVENT_SCHEMA_VERSION
    run_id: str
    thread_id: str | None = None
    request_id: str | None = None
    created_at: str


class MetadataRunEvent(RunEventEnvelope):
    event: Literal["metadata"] = "metadata"
    payload: MetadataPayload


class MessagesRunEvent(RunEventEnvelope):
    event: Literal["messages"] = "messages"
    payload: MessagesPayload


class CustomRunEvent(RunEventEnvelope):
    event: Literal["custom"] = "custom"
    payload: CustomPayload


class InterruptRunEvent(RunEventEnvelope):
    event: Literal["interrupt"] = "interrupt"
    payload: InterruptPayload


class ErrorRunEvent(RunEventEnvelope):
    event: Literal["error"] = "error"
    payload: ErrorPayload


class EndRunEvent(RunEventEnvelope):
    event: Literal["end"] = "end"
    payload: EndPayload


RUN_EVENT_MODELS: dict[str, type[RunEventEnvelope]] = {
    "metadata": MetadataRunEvent,
    "messages": MessagesRunEvent,
    "custom": CustomRunEvent,
    "interrupt": InterruptRunEvent,
    "error": ErrorRunEvent,
    "end": EndRunEvent,
}

RunEvent = Annotated[
    Union[
        MetadataRunEvent,
        MessagesRunEvent,
        CustomRunEvent,
        InterruptRunEvent,
        ErrorRunEvent,
        EndRunEvent,
    ],
    Field(discriminator="event"),
]
