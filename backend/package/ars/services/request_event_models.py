"""Request 事件流（排队位置与派发）的载荷模型。

这条流的载荷是裸 dict：排队中报位置、派发时报 run 与其事件流地址、终态事件报请求状态。
各事件出现的字段不同，但载荷里没有事件名（事件名在 SSE 帧上），所以这里建模成可选字段的
合集而不是判别联合；`build_request_event_payload` 是产侧唯一的构造点。
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict

REQUEST_EVENT_SCHEMA_NAME = "RequestEventPayload"
REQUEST_EVENT_SCHEMA_REF = {"$ref": f"#/components/schemas/{REQUEST_EVENT_SCHEMA_NAME}"}


class RequestEventPayload(BaseModel):
    """一条请求事件的载荷；`request_id` 恒有，其余字段按事件各自出现。"""

    model_config = ConfigDict(extra="allow")

    request_id: str
    status: str | None = None
    position: int | None = None
    run_id: str | None = None
    stream_url: str | None = None
    message: str | None = None


def build_request_event_payload(**fields: Any) -> dict[str, Any]:
    """按模型构造载荷；producer 没给的字段不出现在结果里。"""

    return RequestEventPayload(**fields).model_dump(exclude_unset=True)
