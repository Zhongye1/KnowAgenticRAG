"""把 Run 事件流的模型注册进 OpenAPI components。

`GET /api/agent/runs/{run_id}/events` 用 `response_class=StreamingResponse` 声明，FastAPI
不从它推导媒体类型，所以响应在契约里只有一个 description；而 FastAPI 也不会注册手写
`responses` 里的模型。这里在 `app.openapi()` 之后补一步：把事件模型的 `$defs` 注入
`components.schemas`，并把联合本身注册成 `RunEvent`，供响应里的 `$ref` 指向。

注入后的文档里不残留内联 `$defs`：`@hey-api/json-schema-ref-parser` 会把 `#/$defs/X`
按文档根解析，内联定义会让契约生成崩溃。
"""

from __future__ import annotations

from typing import Any

from ars.services.run_event_models import RUN_EVENT_SCHEMA_NAME, RunEvent
from fastapi import FastAPI
from pydantic import TypeAdapter

# 生成器只认 `#/components/schemas/...` 形式的引用，Pydantic 的默认模板指向 `#/$defs/`。
RUN_EVENT_REF_TEMPLATE = "#/components/schemas/{model}"


def install_run_event_schema(app: FastAPI) -> None:
    """让应用文档带上 Run 事件模型；可重复调用。"""

    original_openapi = app.openapi

    def openapi() -> dict[str, Any]:
        document = original_openapi()
        schemas = document.setdefault("components", {}).setdefault("schemas", {})
        if RUN_EVENT_SCHEMA_NAME in schemas:
            return document

        schema = TypeAdapter(RunEvent).json_schema(ref_template=RUN_EVENT_REF_TEMPLATE)
        # 联合的成员与它们的嵌套引用都在 $defs 里，一并平移到 components 顶层。
        definitions = schema.pop("$defs", {})
        collisions = sorted(set(definitions) & set(schemas))
        if collisions:
            # 静默覆盖会让两个含义不同的模型共用一个名字，契约随之说谎。
            raise RuntimeError(f"Run 事件模型与既有 schema 重名：{collisions}")
        schemas.update(definitions)
        schemas[RUN_EVENT_SCHEMA_NAME] = schema
        return document

    app.openapi = openapi
