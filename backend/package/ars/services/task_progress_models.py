"""后台任务进度流的载荷模型。

虚拟文件夹迁移的进度流逐条推送任务快照，且**不带 SSE 事件名**（帧里只有 `data:`）。快照由
`Task.to_dict()` 产出，流出去时去掉 `payload`（它可能很大且只对服务端有意义），其余字段都
对外可见。这里把去掉 `payload` 后的形状建模，并在产侧用它构造一次。
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict

TASK_PROGRESS_SCHEMA_NAME = "TaskProgressPayload"
TASK_PROGRESS_SCHEMA_REF = {"$ref": f"#/components/schemas/{TASK_PROGRESS_SCHEMA_NAME}"}


class TaskProgressPayload(BaseModel):
    """任务快照去掉 `payload` 后的形状。"""

    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    type: str
    status: str
    progress: float
    message: str
    created_at: str
    updated_at: str
    started_at: str | None = None
    completed_at: str | None = None
    result: Any | None = None
    error: str | None = None
    cancel_requested: bool = False
