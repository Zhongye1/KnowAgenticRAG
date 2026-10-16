"""路由级响应契约门禁：有 schema 可言的 2xx 响应必须有可用的 schema。

空 schema 会一路传到 `web/openapi.json`，再生成成 `unknown`，前端只能手写类型兜底。
本门禁把「没有字段信息」变成可失败的工程状态，并保证它只能被消除、不能被新增。

判定只读 `app.openapi()`，不依赖 FastAPI 内部的路由对象结构：凡声明了
`application/json` 或 `text/event-stream` 的 2xx 响应，其 schema 必须带字段信息。流与文件
端点因此必须显式声明自己的 `response_class`（媒体类型不再是 JSON），否则会被 JSON 那一半
拦下；运行事件流声明了 `text/event-stream`，因此必须给出事件模型，新增的流式端点无法再
只留一个 description。两条判定的共同边界是：完全没有声明该媒体类型的 2xx（204、文件下载、
另一条流）不属于这份契约。

迁移期用 `response_schema_baseline.json` 记录尚未补齐的 JSON 路由：

- 出现基线之外的新缺口 → 失败（新增端点无法再留空 schema）。
- 基线里有条目已经补好 → 失败（基线只能缩小，必须同步删除，避免它腐烂成豁免名单）。

基线清空后本门禁即为严格模式，也可以直接删除基线文件。
"""

from __future__ import annotations

import copy
import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import pytest

from ars.config.runtime import lite_mode_enabled
from server.main import app

pytestmark = pytest.mark.unit

BASELINE_PATH = Path(__file__).with_name("response_schema_baseline.json")
JSON_MEDIA_TYPE = "application/json"
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


def _responses_missing_schema(spec: Mapping[str, Any], media_type: str) -> list[str]:
    """缺少可用 schema 的响应，形如 `GET /api/agent`。"""

    schemas = spec.get("components", {}).get("schemas", {})
    missing: list[str] = []
    for path, operations in sorted(spec.get("paths", {}).items()):
        for method, operation in sorted(operations.items()):
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            for code, response in sorted(operation.get("responses", {}).items()):
                if not code.startswith("2"):
                    continue
                schema = response.get("content", {}).get(media_type, {}).get("schema")
                if schema is None:
                    continue
                if not _is_usable(schema, schemas):
                    missing.append(f"{method.upper()} {path}")
                    break
    return sorted(missing)


def _load_baseline() -> list[str]:
    if not BASELINE_PATH.exists():
        return []
    return sorted(json.loads(BASELINE_PATH.read_text(encoding="utf-8")))


@pytest.mark.skipif(lite_mode_enabled(), reason="LITE 不注册知识域路由，契约面与完整模式不同")
def test_json_responses_do_not_introduce_schema_gaps() -> None:
    missing = _responses_missing_schema(app.openapi(), JSON_MEDIA_TYPE)
    baseline = _load_baseline()

    new_gaps = sorted(set(missing) - set(baseline))
    assert not new_gaps, (
        "以下返回 JSON 的响应没有可用的 schema；新增路由必须声明 response_model，"
        f"流与文件端点改声明 response_class：{new_gaps}"
    )


@pytest.mark.skipif(lite_mode_enabled(), reason="LITE 不注册知识域路由，契约面与完整模式不同")
def test_schema_baseline_has_no_stale_entries() -> None:
    missing = set(_responses_missing_schema(app.openapi(), JSON_MEDIA_TYPE))
    stale = sorted(set(_load_baseline()) - missing)

    assert not stale, f"以下路由已经补好响应 schema，请从 response_schema_baseline.json 删除：{stale}"


@pytest.mark.skipif(lite_mode_enabled(), reason="LITE 不注册知识域路由，契约面与完整模式不同")
def test_run_events_stream_declares_event_schema() -> None:
    """运行事件流的 200 必须指向事件模型；前端的事件类型只能来自这里。

    这条断言是事件流的锚点：删掉响应里的声明，本用例即失败。
    """

    content = app.openapi()["paths"][RUN_EVENTS_PATH]["get"]["responses"]["200"]["content"]

    assert content[STREAM_MEDIA_TYPE]["schema"] == {"$ref": "#/components/schemas/RunEvent"}


@pytest.mark.skipif(lite_mode_enabled(), reason="LITE 不注册知识域路由，契约面与完整模式不同")
def test_stream_responses_do_not_introduce_schema_gaps() -> None:
    assert _responses_missing_schema(app.openapi(), STREAM_MEDIA_TYPE) == []


def test_stream_schema_scan_recovers_a_route_without_events() -> None:
    """负向案例：把事件流的 schema 掏空后，扫描必须报出这条路由。"""

    spec = copy.deepcopy(app.openapi())
    spec["paths"][RUN_EVENTS_PATH]["get"]["responses"]["200"]["content"][STREAM_MEDIA_TYPE]["schema"] = {}

    assert _responses_missing_schema(spec, STREAM_MEDIA_TYPE) == [f"GET {RUN_EVENTS_PATH}"]


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
