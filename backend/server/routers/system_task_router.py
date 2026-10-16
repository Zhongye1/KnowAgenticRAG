from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ars.storage.postgres.models_business import User
from ars.services.task_service import tasker
from server.utils.auth_middleware import get_admin_user

tasks = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskSummaryItem(BaseModel):
    """任务列表条目；对齐 `Task.to_summary_dict()`（不含 payload/result）。"""

    id: str
    name: str
    type: str
    status: str
    progress: float
    message: str
    created_at: str
    updated_at: str
    started_at: str | None
    completed_at: str | None
    error: str | None
    cancel_requested: bool


class TaskListSummary(BaseModel):
    """任务列表汇总计数。"""

    total: int
    filtered_total: int
    status_counts: dict[str, int]
    type_counts: dict[str, int]


class TaskListResponse(BaseModel):
    """任务列表响应；对齐 `Tasker.list_tasks`。"""

    tasks: list[TaskSummaryItem]
    summary: TaskListSummary


class TaskItem(BaseModel):
    """任务详情；对齐 `Task.to_dict()`。"""

    id: str
    name: str
    type: str
    status: str
    progress: float
    message: str
    created_at: str
    updated_at: str
    started_at: str | None
    completed_at: str | None
    payload: dict[str, Any]
    result: Any | None
    error: str | None
    cancel_requested: bool


class TaskItemResponse(BaseModel):
    """单个任务响应。"""

    task: TaskItem


class TaskActionResponse(BaseModel):
    """任务取消/删除结果。"""

    task_id: str
    status: str


@tasks.get("", response_model=TaskListResponse, response_model_exclude_unset=True)
async def list_tasks(
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=100),
    current_user: User = Depends(get_admin_user),
):
    """List tasks, optionally filtered by status."""
    return await tasker.list_tasks(status=status, limit=limit)


@tasks.get("/{task_id}", response_model=TaskItemResponse, response_model_exclude_unset=True)
async def get_task(task_id: str, current_user: User = Depends(get_admin_user)):
    """Retrieve a single task by id."""
    task = await tasker.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task": task}


@tasks.post("/{task_id}/cancel", response_model=TaskActionResponse, response_model_exclude_unset=True)
async def cancel_task(task_id: str, current_user: User = Depends(get_admin_user)):
    """Request cancellation of a task."""
    success = await tasker.cancel_task(task_id)
    if not success:
        raise HTTPException(status_code=400, detail="Task cannot be cancelled")
    return {"task_id": task_id, "status": "cancelled"}


@tasks.delete("/{task_id}", response_model=TaskActionResponse, response_model_exclude_unset=True)
async def delete_task(task_id: str, current_user: User = Depends(get_admin_user)):
    """Delete a task by id."""
    success = await tasker.delete_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task_id": task_id, "status": "deleted"}
