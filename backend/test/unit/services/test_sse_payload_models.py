"""两条非 run 事件流的载荷模型：产侧字段集与必填约束。"""

from __future__ import annotations

from typing import Any

import pytest
from ars.services.request_event_models import build_request_event_payload
from ars.services.task_progress_models import TaskProgressPayload
from pydantic import ValidationError

pytestmark = pytest.mark.unit

# 请求流实际发出的四种载荷。
_REQUEST_EVENT_SHAPES: list[dict[str, Any]] = [
    {"request_id": "req-1", "message": "请求不存在"},
    {"request_id": "req-1", "run_id": "run-1", "stream_url": "/api/agent/runs/run-1/events"},
    {"request_id": "req-1", "status": "cancelled"},
    {"request_id": "req-1", "status": "queued", "position": 3},
]


@pytest.mark.parametrize("fields", _REQUEST_EVENT_SHAPES)
def test_request_payload_keeps_exactly_the_given_fields(fields: dict[str, Any]) -> None:
    """四种载荷都能构造，且 producer 没给的字段不会被补成 null。"""

    assert build_request_event_payload(**fields) == fields


def test_request_payload_requires_request_id() -> None:
    """负向案例：缺 `request_id` 的载荷在产侧就失败。"""

    with pytest.raises(ValidationError):
        build_request_event_payload(status="queued")


def test_task_progress_payload_accepts_a_task_snapshot() -> None:
    """迁移流推的是 `Task.to_dict()` 去掉 `payload` 后的快照。"""

    snapshot = {
        "id": "task-1",
        "name": "迁移虚拟文件夹",
        "type": "knowledge_virtual_folder_migration",
        "status": "running",
        "progress": 0.5,
        "message": "正在迁移",
        "created_at": "2026-10-16T00:00:00+00:00",
        "updated_at": "2026-10-16T00:00:01+00:00",
        "started_at": "2026-10-16T00:00:00+00:00",
        "completed_at": None,
        "result": None,
        "error": None,
        "cancel_requested": False,
    }

    assert TaskProgressPayload(**snapshot).model_dump() == snapshot


def test_task_progress_payload_requires_the_snapshot_keys() -> None:
    """负向案例：快照少字段（不是 `Task.to_dict()` 的形状）在产侧就失败。"""

    with pytest.raises(ValidationError):
        TaskProgressPayload(id="task-1", type="knowledge_virtual_folder_migration")
