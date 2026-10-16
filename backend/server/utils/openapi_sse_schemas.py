"""把 SSE 事件流的载荷模型注册进 OpenAPI components。

三条事件流都用 `response_class=StreamingResponse` 声明，FastAPI 不从它推导媒体类型，所以响应
在契约里只剩一个 description；而 FastAPI 也不会注册手写 `responses` 里的模型。这里在
`app.openapi()` 之后补一步：把每个模型 `$defs` 里的成员注入 `components.schemas`，并把模型
本身注册成具名 schema，供各响应里手写的 `$ref` 指向。

注入后不残留内联 `$defs`：`@hey-api/json-schema-ref-parser` 会把 `#/$defs/X` 按文档根解析，
内联定义会让契约生成崩溃。
"""

from __future__ import annotations

from typing import Any

from ars.services.request_event_models import REQUEST_EVENT_SCHEMA_NAME, RequestEventPayload
from ars.services.run_event_models import RUN_EVENT_SCHEMA_NAME, RunEvent
from ars.services.task_progress_models import TASK_PROGRESS_SCHEMA_NAME, TaskProgressPayload
from fastapi import FastAPI
from pydantic import TypeAdapter

# 生成器只认 `#/components/schemas/...` 形式的引用，Pydantic 的默认模板指向 `#/$defs/`。
SSE_SCHEMA_REF_TEMPLATE = "#/components/schemas/{model}"

# 要发布的事件载荷：组件名与它的类型。路由响应里手写的 `$ref` 靠这份清单解析得到。
SSE_EVENT_SCHEMAS: tuple[tuple[str, Any], ...] = (
    (RUN_EVENT_SCHEMA_NAME, RunEvent),
    (REQUEST_EVENT_SCHEMA_NAME, RequestEventPayload),
    (TASK_PROGRESS_SCHEMA_NAME, TaskProgressPayload),
)


def install_sse_event_schemas(app: FastAPI) -> None:
    """让应用文档带上三条事件流的载荷模型；可重复调用。"""

    original_openapi = app.openapi

    def openapi() -> dict[str, Any]:
        document = original_openapi()
        schemas = document.setdefault("components", {}).setdefault("schemas", {})
        if all(name in schemas for name, _ in SSE_EVENT_SCHEMAS):
            return document

        for name, model in SSE_EVENT_SCHEMAS:
            schema = TypeAdapter(model).json_schema(ref_template=SSE_SCHEMA_REF_TEMPLATE)
            definitions = schema.pop("$defs", {})
            # 静默覆盖会让两个含义不同的模型共用一个名字，契约随之说谎。
            collisions = sorted((set(definitions) | {name}) & set(schemas))
            if collisions:
                raise RuntimeError(f"SSE 事件模型与既有 schema 重名：{collisions}")
            schemas.update(definitions)
            schemas[name] = schema
        return document

    app.openapi = openapi
