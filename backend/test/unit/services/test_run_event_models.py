"""Run 事件模型：终态取值对齐、产侧失败与 wire 等价。"""

from __future__ import annotations

from typing import get_args

import pytest
from ars.services.run_event_models import RUN_EVENT_MODELS, EndPayload, EndRunEvent, RunEvent
from ars.services.run_queue_service import build_run_event_envelope
from ars.storage.postgres.models_business import AGENT_RUN_TERMINAL_STATUSES
from pydantic import TypeAdapter, ValidationError

pytestmark = pytest.mark.unit

_MINIMAL_PAYLOADS: dict[str, dict] = {
    "metadata": {},
    "messages": {},
    "custom": {"name": "ars.init"},
    "interrupt": {"reason": "cancelled"},
    "error": {},
    "end": {"status": "completed"},
}


def test_end_status_literal_matches_the_run_state_machine() -> None:
    """`end` 的终态取值与 AgentRun 状态机的终态集合保持同一份事实。"""

    statuses = get_args(EndPayload.model_fields["status"].annotation)

    assert set(statuses) == set(AGENT_RUN_TERMINAL_STATUSES)


def test_builder_rejects_unknown_event_name() -> None:
    """负向案例：契约里没有的事件名必须在产侧失败，不能落进兜底分支。"""

    with pytest.raises(ValueError, match="未知的 Run 事件名"):
        build_run_event_envelope(run_id="run-1", event_type="loading")


def test_builder_rejects_unknown_terminal_status() -> None:
    """负向案例：终态漂移在构造时就失败。

    把 `EndPayload.status` 的 `Literal` 放宽成 `str` 后，本用例不再抛错，即为失败。
    """

    with pytest.raises(ValidationError):
        build_run_event_envelope(run_id="run-1", event_type="end", payload={"status": "succeeded"})


def test_every_wire_event_name_builds_an_envelope() -> None:
    """六个 wire 事件名都有对应模型，且判别键与事件名一致。"""

    assert set(_MINIMAL_PAYLOADS) == set(RUN_EVENT_MODELS)

    for name, payload in _MINIMAL_PAYLOADS.items():
        envelope = build_run_event_envelope(run_id="run-1", event_type=name, payload=payload)
        assert envelope["event"] == name


def test_envelope_output_matches_the_shape_before_modelling() -> None:
    """输出形状与建模前一致：信封字段齐全，producer 没给的载荷字段保持缺席。"""

    envelope = build_run_event_envelope(run_id="run-1", event_type="messages", payload={"items": [1]})

    assert set(envelope) == {"schema_version", "run_id", "thread_id", "event", "created_at", "payload"}
    assert envelope["schema_version"] == 1
    assert envelope["thread_id"] is None
    assert isinstance(envelope["created_at"], str)
    # 载荷没有 `chunk` 时不能补一个 null 出来。
    assert envelope["payload"] == {"items": [1]}


def test_null_payload_fields_are_kept() -> None:
    """producer 显式给出的 null 必须留在载荷里，例如 metadata 的 source 与 subagent_slug。"""

    envelope = build_run_event_envelope(
        run_id="run-1",
        event_type="metadata",
        payload={"run_type": "chat", "source": None, "subagent_slug": None},
    )

    assert envelope["payload"] == {"run_type": "chat", "source": None, "subagent_slug": None}


def test_unmodelled_payload_fields_are_kept() -> None:
    """载荷基类允许额外键：建模不能让 producer 新增的字段悄悄消失。"""

    envelope = build_run_event_envelope(
        run_id="run-1",
        event_type="custom",
        payload={"name": "ars.warning", "future_field": {"a": 1}},
        thread_id="thread-1",
    )

    assert envelope["payload"] == {"name": "ars.warning", "future_field": {"a": 1}}


def test_union_discriminates_by_event_name() -> None:
    """联合按 `event` 判别；契约里的 discriminator 映射由此成立。"""

    parsed = TypeAdapter(RunEvent).validate_python(
        {
            "schema_version": 1,
            "run_id": "run-1",
            "thread_id": None,
            "created_at": "2026-10-16T00:00:00+00:00",
            "event": "end",
            "payload": {"status": "completed"},
        }
    )

    assert isinstance(parsed, EndRunEvent)
