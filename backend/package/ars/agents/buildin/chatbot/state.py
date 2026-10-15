from __future__ import annotations

from typing import Annotated, Literal, TypedDict

from ars.agents.state import BaseState


class SubAgentRunState(TypedDict, total=False):
    id: str
    run_id: str
    subagent_slug: str
    subagent_name: str
    child_thread_id: str
    description: str
    status: Literal["pending", "running", "completed", "failed", "cancel_requested", "cancelled", "interrupted"]
    created_at: str
    completed_at: str
    error: str | None
    artifacts: list[str]
    events_url: str
    result_url: str


def merge_subagent_runs(
    existing: list[SubAgentRunState] | None,
    new: list[SubAgentRunState] | None,
) -> list[SubAgentRunState]:
    """LangGraph state reducer：增量合并父 Agent 记录的子智能体运行摘要。

    `run_id` 是一次真实子智能体执行的身份。只有相同 `run_id` 才会更新同一条记录；
    没有 `run_id` 的增量记录直接追加，不用工具调用 ID 或子线程 ID 做旧状态兼容匹配。
    """
    if existing is None:
        return list(new or [])
    if new is None:
        return existing

    merged = [dict(item) for item in existing]
    run_id_index = {item.get("run_id"): position for position, item in enumerate(merged) if item.get("run_id")}
    for item in new:
        run = dict(item)
        run_id = run.get("run_id")
        position = None
        if run_id and run_id in run_id_index:
            position = run_id_index[run_id]

        if position is None:
            position = len(merged)
            merged.append(run)
        else:
            merged[position] = {**merged[position], **run}

        if run_id:
            run_id_index[run_id] = position
    return merged


class ChatBotState(BaseState):
    subagent_runs: Annotated[list[SubAgentRunState], merge_subagent_runs]
