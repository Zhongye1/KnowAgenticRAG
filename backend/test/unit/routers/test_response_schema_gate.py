"""路由级响应契约门禁：带响应体的 2xx 必须有可用的 schema。

空 schema 会一路传到 `web/openapi.json`，再生成成 `unknown`，前端只能手写类型兜底。
本门禁把「没有字段信息」变成可失败的工程状态，并保证它只能被消除、不能被新增。

判定只读 `app.openapi()`，不依赖 FastAPI 内部的路由对象结构：除 204/205 之外，每个 2xx 都要
在它声明的某一种媒体类型下给出带字段信息的 schema。JSON 端点因此必须声明 `response_model`；
流与文件端点要么给出内容类型与 schema，要么把 `content` 留空——后者会被本门禁拦下，这曾经是
三条事件流与八个下载端点的状态。迁移期的基线名单已随缺口清零一并删除，现在是严格模式。
"""

from __future__ import annotations

import copy
from collections.abc import Mapping
from typing import Any

import pytest

from ars.config.runtime import lite_mode_enabled
from server.main import app

pytestmark = pytest.mark.unit

STREAM_MEDIA_TYPE = "text/event-stream"
RUN_EVENTS_PATH = "/api/agent/runs/{run_id}/events"


def _is_usable(schema: object, schemas: Mapping[str, object], seen: frozenset[str] = frozenset()) -> bool:
    """schema 是否带有可生成的字段信息。

    三类都算不可用：空 schema、形状不受限的 object（`response_model=dict` 的产物）、
    以及指向零字段模型的 `$ref`。最后一条要求把引用解析到目标模型再判，否则一个空模型
    只要被引用就能骗过本门禁。具名标量与枚举本身携带类型信息，算可用。
    """

    if not isinstance(schema, dict) or not schema:
        return False

    ref = schema.get("$ref")
    if isinstance(ref, str):
        name = ref.rsplit("/", 1)[-1]
        if name in seen or name not in schemas:
            return False
        return _is_usable(schemas[name], schemas, seen | {name})

    if schema.get("properties"):
        return True
    if schema.get("type") == "array":
        return _is_usable(schema.get("items", {}), schemas, seen)
    for key in ("anyOf", "oneOf", "allOf"):
        options = [item for item in schema.get(key, []) if item.get("type") != "null"]
        if options:
            return any(_is_usable(item, schemas, seen) for item in options)
    if schema.get("type") == "object":
        # 类型化的 map 有值类型；布尔 true（形状不受限）没有字段名。
        additional = schema.get("additionalProperties")
        return isinstance(additional, dict) and bool(additional)
    return bool(schema.get("type"))


def _responses_missing_schema(spec: Mapping[str, Any]) -> list[str]:
    """带响应体却没有可用 schema 的 2xx 响应，形如 `GET /api/agent`。

    边界是 HTTP 语义而不是某一种媒体类型：204/205 没有响应体，因此不参与判定；其余 2xx 必须
    在它声明的某一种媒体类型下给出可用 schema。这样「不声明 content」和「声明了却没有字段
    信息」都会被拦下——前者正是三条事件流曾经的状态。
    """

    schemas = spec.get("components", {}).get("schemas", {})
    missing: list[str] = []
    for path, operations in sorted(spec.get("paths", {}).items()):
        for method, operation in sorted(operations.items()):
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            for code, response in sorted(operation.get("responses", {}).items()):
                if not code.startswith("2") or code in {"204", "205"}:
                    continue
                content = response.get("content") or {}
                if not any(
                    _is_usable(entry.get("schema"), schemas)
                    for entry in content.values()
                ):
                    missing.append(f"{method.upper()} {path}")
                    break
    return sorted(missing)


@pytest.mark.skipif(lite_mode_enabled(), reason="LITE 不注册知识域路由，契约面与完整模式不同")
def test_responses_with_a_body_declare_a_usable_schema() -> None:
    missing = _responses_missing_schema(app.openapi())

    assert not missing, (
        "以下 2xx 响应带响应体却没有可用的 schema：JSON 端点声明 response_model，"
        f"流与文件端点声明 response_class 并给出内容类型：{missing}"
    )


@pytest.mark.skipif(lite_mode_enabled(), reason="LITE 不注册知识域路由，契约面与完整模式不同")
def test_stream_responses_declare_their_event_payload() -> None:
    """三条事件流的 200 必须指向各自的载荷模型；前端的事件类型只能来自这里。

    这几条断言是事件流的锚点：删掉响应里的声明，本用例即失败（通用扫描此时按「没有响应体」
    的 204/205 之外的语义仍会报出它，但报告的粒度是路由，锚点负责钉住指向哪个模型）。
    """

    spec = app.openapi()
    expected = {
        "/api/agent/runs/{run_id}/events": "RunEvent",
        "/api/agent/requests/{request_id}/events": "RequestEventPayload",
        "/api/knowledge/databases/{kb_id}/virtual-folders/migrations/{task_id}/events": "TaskProgressPayload",
    }

    for path, component in expected.items():
        content = spec["paths"][path]["get"]["responses"]["200"]["content"]
        assert content == {"text/event-stream": {"schema": {"$ref": f"#/components/schemas/{component}"}}}


def test_stream_schema_scan_recovers_a_route_without_events() -> None:
    """负向案例：掏空事件流的 schema 后，扫描必须报出这条路由。"""

    spec = copy.deepcopy(app.openapi())
    spec["paths"][RUN_EVENTS_PATH]["get"]["responses"]["200"]["content"][STREAM_MEDIA_TYPE]["schema"] = {}

    assert _responses_missing_schema(spec) == [f"GET {RUN_EVENTS_PATH}"]


def test_scan_recovers_a_response_that_declares_no_content() -> None:
    """负向案例：把响应的 content 整段删掉后，扫描同样必须报出它。"""

    spec = copy.deepcopy(app.openapi())
    del spec["paths"][RUN_EVENTS_PATH]["get"]["responses"]["200"]["content"]

    assert _responses_missing_schema(spec) == [f"GET {RUN_EVENTS_PATH}"]


def test_scan_ignores_responses_without_a_body() -> None:
    """204/205 没有响应体，不属于这份契约。"""

    spec = {"paths": {"/x": {"delete": {"responses": {"204": {"description": "No Content"}}}}}}

    assert _responses_missing_schema(spec) == []


def test_is_usable_rejects_a_ref_to_a_zero_field_model() -> None:
    """负向案例：`$ref` 指向零字段模型时，不能因为「有引用」就放行。"""

    schemas = {"Empty": {"properties": {}, "title": "Empty", "type": "object"}}

    assert _is_usable({"$ref": "#/components/schemas/Empty"}, schemas) is False


def test_is_usable_separates_named_shapes_from_shells() -> None:
    """具名模型、类型化 map、数组元素与标量算可用；空 schema 与形状不受限的 object 不算。"""

    schemas = {"Item": {"properties": {"a": {"type": "integer"}}, "type": "object"}}
    item = {"$ref": "#/components/schemas/Item"}

    assert _is_usable({}, schemas) is False
    assert _is_usable({"type": "object", "additionalProperties": True}, schemas) is False
    assert _is_usable({"type": "object", "additionalProperties": {"type": "string"}}, schemas) is True
    assert _is_usable(item, schemas) is True
    assert _is_usable({"type": "array", "items": item}, schemas) is True
    assert _is_usable({"anyOf": [item, {"type": "object", "additionalProperties": True}]}, schemas) is True
    assert _is_usable({"type": "string"}, schemas) is True
