"""问题和选项规范化工具"""

import json
import uuid
from typing import Any

_WRAPPER_OPTION_KEYS = ("item", "items", "options", "list", "choices", "data")
_WRAPPER_QUESTION_KEYS = ("questions", "items", "item", "list", "data")


def _normalize_collection(
    value: Any,
    *,
    wrapper_keys: tuple[str, ...],
    is_item,
    mapping_as_options: bool = False,
) -> list[Any]:
    """把 JSON、包装对象或单项对象统一成列表。"""
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if not isinstance(parsed, str):
                value = parsed
        except (TypeError, ValueError, RecursionError):
            return []

    if isinstance(value, list):
        return value
    if not isinstance(value, dict):
        return []

    for key in wrapper_keys:
        if key not in value:
            continue
        wrapped = value[key]
        if isinstance(wrapped, list):
            return wrapped
        if isinstance(wrapped, dict) and is_item(wrapped):
            return [wrapped]

    if is_item(value):
        return [value]
    if mapping_as_options:
        return [{"label": str(label), "value": str(option)} for option, label in value.items()]
    return []


def _parse_bool(val: Any, default: bool = False) -> bool:
    """健壮地将各类值解析为布尔值。"""
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val != 0
    if isinstance(val, str):
        s = val.strip().lower()
        if s in ("true", "1", "yes", "y", "t"):
            return True
        if s in ("false", "0", "no", "n", "f", ""):
            return False
    return default


def normalize_options(raw_options: Any) -> list[dict[str, Any]]:
    """规范化选项列表，支持列表、包装对象或字符串输入。"""
    raw_options = _normalize_collection(
        raw_options,
        wrapper_keys=_WRAPPER_OPTION_KEYS,
        is_item=lambda item: bool(item.get("label") or item.get("value")),
        mapping_as_options=True,
    )

    options: list[dict[str, Any]] = []
    for item in raw_options:
        if isinstance(item, dict):
            label = str(item.get("label") or item.get("value") or item.get("title") or item.get("text") or "").strip()
            value = str(item.get("value") or item.get("label") or item.get("id") or item.get("key") or "").strip()
            description = str(item.get("description") or item.get("desc") or "").strip()
            if label and value:
                opt: dict[str, Any] = {"label": label, "value": value}
                if description:
                    opt["description"] = description
                options.append(opt)
        else:
            label = str(item).strip()
            if label:
                options.append({"label": label, "value": label})
    return options


def normalize_questions(raw_questions: Any, default_question_id_prefix: str = "q") -> list[dict[str, Any]]:
    """规范化问题列表，支持列表或包装对象输入。"""
    raw_questions = _normalize_collection(
        raw_questions,
        wrapper_keys=_WRAPPER_QUESTION_KEYS,
        is_item=lambda item: bool(item.get("question") or item.get("title") or item.get("text")),
    )

    questions: list[dict[str, Any]] = []
    for idx, item in enumerate(raw_questions):
        if not isinstance(item, dict):
            continue

        question = str(item.get("question") or item.get("title") or item.get("text") or "").strip()
        if not question:
            continue

        raw_id = (
            item.get("question_id")
            or item.get("questionId")
            or item.get("id")
            or f"{default_question_id_prefix}-{idx + 1}"
        )
        question_id = str(raw_id).strip()
        if not question_id:
            question_id = str(uuid.uuid4())

        options_val = item.get("options") if item.get("options") is not None else item.get("choices")

        normalized_question: dict[str, Any] = {
            "question_id": question_id,
            "question": question,
            "options": normalize_options(options_val),
            "multi_select": _parse_bool(item.get("multi_select", item.get("multiSelect", False)), False),
            "allow_other": _parse_bool(item.get("allow_other", item.get("allowOther", True)), True),
        }

        operation = item.get("operation")
        if isinstance(operation, str) and operation.strip():
            normalized_question["operation"] = operation.strip()

        questions.append(normalized_question)

    return questions
