"""响应契约的字段覆盖检查。

`response_model` 会按模型裁剪响应体：模型漏掉的字段会被 FastAPI 静默丢弃，
前端读到的就是缺字段的数据。因此补 schema 时必须能证明「声明模型覆盖了真实载荷
的每个字段」。`uncovered_paths` 就是这条证明：给出载荷有、而模型没有的字段路径，
非空即表示会丢字段。

嵌套模型、`Optional`、`list[X]`、`dict[str, X]` 与 `Any` 都会被正确展开；映射类型的键
是任意的，因此只检查它的值。多个非 None 分支的联合类型按「任一分支覆盖即算覆盖」处理。
"""

from __future__ import annotations

import types
import typing
from collections.abc import Mapping

_NONE_TYPE = type(None)


def _strip_annotation(annotation: object) -> object:
    """剥掉 Annotated 外壳，返回真正的类型注解。"""

    while typing.get_origin(annotation) is not None and hasattr(annotation, "__metadata__"):
        annotation = typing.get_args(annotation)[0]
    return annotation


def _non_none_options(annotation: object) -> list[object] | None:
    """联合类型去掉 NoneType 后的分支；非联合返回 None。"""

    origin = typing.get_origin(annotation)
    if origin is not typing.Union and origin is not types.UnionType:
        return None
    options = [item for item in typing.get_args(annotation) if item is not _NONE_TYPE]
    return options


def uncovered_paths(payload: object, annotation: object, prefix: str = "") -> list[str]:
    """载荷有、而模型注解没有覆盖的字段路径。

    返回空列表表示该模型不会裁掉任何字段；非空即表示这些字段会从响应里消失。
    """

    annotation = _strip_annotation(annotation)

    options = _non_none_options(annotation)
    if options is not None:
        candidates = [uncovered_paths(payload, option, prefix) for option in options]
        if not candidates:
            return []
        # 联合类型：字段被任一分支覆盖就算覆盖，所以未覆盖集取各分支的交集。
        return [
            path
            for path in candidates[0]
            if all(path in other for other in candidates[1:])
        ]

    if annotation is typing.Any or annotation is object:
        return []

    origin = typing.get_origin(annotation)
    if origin in (list, tuple, set, frozenset) or origin is typing.Sequence:
        args = typing.get_args(annotation)
        element = args[0] if args else typing.Any
        if isinstance(payload, (list, tuple, set, frozenset)):
            result: list[str] = []
            for item in payload:
                result.extend(uncovered_paths(item, element, prefix))
            return result
        return []

    if isinstance(origin, type) and issubclass(origin, Mapping):
        # dict[str, X] / Mapping[str, X] / MutableMapping[str, X] 等同属一类。
        args = typing.get_args(annotation)
        value_type = args[1] if len(args) == 2 else typing.Any
        if isinstance(payload, Mapping):
            result = []
            for value in payload.values():
                result.extend(uncovered_paths(value, value_type, prefix))
            return result
        return []

    if isinstance(annotation, type) and getattr(annotation, "model_fields", None):
        if not isinstance(payload, Mapping):
            return []
        result = []
        for key, value in payload.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            field = annotation.model_fields.get(str(key))
            if field is None:
                result.append(path)
                continue
            result.extend(uncovered_paths(value, field.annotation, path))
        return result

    return []


__all__ = ["uncovered_paths"]
