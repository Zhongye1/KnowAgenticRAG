"""Agent runtime streaming service.

This module is the LangGraph execution path used by the worker after an
``AgentRun`` has already been created. It restores input messages, builds the
agent runtime context, streams model/tool events, persists assistant output and
extracts UI-facing agent state.

Do not put run creation, request id idempotency, queueing or external
invocation response formatting here. Those responsibilities belong to
``agent_run_service`` and the Invocation HTTP adapters respectively. Keeping
this file focused on execution makes normal chat, resume runs and subagent runs
share the same runtime behavior once they reach the worker.
"""

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from typing import Any, Literal

from ars.agents.backends.paths import runtime_workdir_path
from ars.agents.backends.sandbox import ProvisionerSandboxBackend
from ars.agents.base import _json_safe
from ars.agents.buildin import agent_manager
from ars.agents.context import build_agent_input_context, normalize_agent_context_config
from ars.agents.skills.service import get_user_skills_root_dir
from ars.agents.state import AgentStatePayload
from ars.config.options import system_options
from ars.repositories.agent_repository import AgentRepository
from ars.repositories.agent_run_repository import AgentRunRepository
from ars.repositories.conversation_repository import ConversationRepository
from ars.repositories.subagent_thread_repository import SubagentThreadRepository
from ars.services.attachment_service import serialize_attachment
from ars.services.input_message_service import AgentRunInputMessage
from ars.services.langfuse_service import (
    LangfuseRunContext,
    build_run_context,
    flush_langfuse,
    get_trace_info,
)
from ars.services.project_service import create_implicit_project
from ars.services.run_queue_service import publish_cancel_signal
from ars.services.subagent_run_service import serialize_subagent_run_state
from ars.services.workdir_service import resolve_conversation_workdir_path
from ars.storage.postgres.manager import pg_manager
from ars.storage.postgres.models_business import Agent, User
from ars.utils.guard import content_guard
from ars.utils.logging_config import logger
from ars.utils.question_utils import (
    normalize_questions as _normalize_interrupt_questions,
)
from ars.utils.thread_utils import extract_thread_id as _metadata_thread_id
from ars.workspace.paths import ensure_bound_user_workdir
from langchain.messages import AIMessage, AIMessageChunk, HumanMessage
from langgraph.types import Command


def _with_attachment_context(message: HumanMessage, attachments: list[dict]) -> HumanMessage:
    """把线程附件路径追加到本轮模型输入，不污染持久化用户消息。"""
    attachment_lines = [
        f"- {item.get('file_name') or '未知文件'}: {item['path']}"
        for item in attachments
        if isinstance(item.get("path"), str) and item["path"].strip()
    ]
    if not attachment_lines:
        return message

    context = "\n".join(
        [
            "<attachment_context>",
            "以下是本线程当前可用的历史附件。需要内容时，请使用 read_file 读取对应路径：",
            *attachment_lines,
            "</attachment_context>",
        ]
    )
    if isinstance(message.content, str):
        content: str | list = f"{message.content}\n\n{context}"
    else:
        content = [*message.content, {"type": "text", "text": context}]
    return message.model_copy(update={"content": content})


def _build_agent_context(agent, input_context: dict):
    context = agent.context_schema()
    context.update(input_context)
    return context


async def _get_langgraph_messages(agent_instance, config_dict, *, context):
    graph = await agent_instance.get_graph(context=context)
    state = await graph.aget_state(config_dict)

    if not state or not state.values:
        logger.warning("No state found in LangGraph")
        return None

    return state.values.get("messages", [])


def _build_langfuse_run_context(
    *,
    current_user,
    thread_id: str,
    agent_id: str,
    request_id: str,
    operation: str,
    backend_id: str | None = None,
    message_type: str | None = None,
    meta: dict | None = None,
) -> LangfuseRunContext:
    extra_metadata = None
    extra_tags = None
    invocation_meta = (meta or {}).get("agent_invocation_meta") if isinstance(meta, dict) else None
    evaluation = invocation_meta.get("evaluation") if isinstance(invocation_meta, dict) else None
    # 如果请求来自智能体评测，添加评测相关的 metadata 和 tags，方便在 Langfuse 中进行过滤和分析
    if (meta or {}).get("source") == "agent_evaluation" or (isinstance(evaluation, dict) and evaluation):
        extra_metadata = {
            "source": "agent_evaluation",
            "feature": "agent_evaluation",
        }
        extra_tags = ["agent_evaluation"]
        if isinstance(evaluation, dict):
            dataset_name = evaluation.get("dataset_name")
            experiment_name = evaluation.get("experiment_name")
            for key in ("dataset_name", "dataset_item_id", "experiment_name"):
                value = evaluation.get(key)
                if value:
                    extra_metadata[f"evaluation_{key}"] = str(value)
            if dataset_name:
                extra_tags.append(f"dataset:{dataset_name}")
            if experiment_name:
                extra_tags.append(f"experiment:{experiment_name}")

    return build_run_context(
        user_id=str(getattr(current_user, "uid", current_user.id)),
        thread_id=thread_id,
        agent_id=agent_id,
        request_id=request_id,
        operation=operation,
        backend_id=backend_id,
        message_type=message_type,
        username=getattr(current_user, "username", None),
        login_user_id=getattr(current_user, "uid", None),
        department_id=getattr(current_user, "department_id", None),
        extra_metadata=extra_metadata,
        extra_tags=extra_tags,
    )


def _normalize_agent_artifact_path(path: object, workdir_path: str | None) -> object:
    if not isinstance(path, str) or not workdir_path:
        return path
    legacy_root = "/home/gem/user-data"
    for namespace in ("uploads", "outputs"):
        prefix = f"{legacy_root}/{namespace}"
        if path == prefix or path.startswith(f"{prefix}/"):
            return f"{workdir_path}{path[len(legacy_root) :]}"
    return path


def extract_agent_state(values: dict, *, workdir_path: str | None = None) -> AgentStatePayload:
    """从 LangGraph state 中提取 agent 状态"""
    if not isinstance(values, dict):
        return {"todos": [], "files": {}, "artifacts": [], "subagent_runs": [], "token_usage": None}

    # 直接获取，信任 state 的数据结构
    todos = values.get("todos")
    artifacts = values.get("artifacts")
    subagent_runs = values.get("subagent_runs")
    token_usage = values.get("token_usage")
    result: AgentStatePayload = {
        "todos": list(todos)[:20] if todos else [],
        "files": values.get("files") or {},
        "artifacts": [_normalize_agent_artifact_path(path, workdir_path) for path in artifacts] if artifacts else [],
        "subagent_runs": list(subagent_runs) if subagent_runs else [],
        "token_usage": dict(token_usage) if isinstance(token_usage, dict) else None,
    }

    return result


def _agent_state_signature(agent_state: AgentStatePayload | dict | None) -> str:
    if not agent_state:
        return ""
    try:
        return json.dumps(agent_state, ensure_ascii=False, sort_keys=True)
    except Exception:
        return str(agent_state)


def _current_run_token_usage(agent_state: AgentStatePayload | dict | None, run_id: str | None) -> dict:
    """提取只属于当前 Run 的用量；缺失时保留明确的不可用事实。"""

    token_usage = agent_state.get("token_usage") if isinstance(agent_state, dict) else None
    if isinstance(token_usage, dict) and run_id and token_usage.get("current_run_id") == run_id:
        run_usage = token_usage.get("run")
        if isinstance(run_usage, dict):
            return dict(run_usage)
    return {"available": False}


def _metadata_namespace(metadata: dict | None) -> list[str]:
    if not isinstance(metadata, dict):
        return []
    namespace = metadata.get("namespace")
    if isinstance(namespace, list):
        return [str(item) for item in namespace]
    return []


def _apply_model_override(input_context: dict, meta: dict | None) -> None:
    """对话级模型覆盖：meta.model_spec 优先于智能体配置的 model。值已在创建 run 时校验。"""
    model_spec = (meta or {}).get("model_spec")
    model_spec = model_spec.strip() if isinstance(model_spec, str) else model_spec
    if model_spec:
        input_context["model"] = model_spec


def _apply_input_context_field(input_context: dict, meta: dict | None, key: str) -> None:
    """把 meta[key] 快照注入运行上下文，值已在 run 创建时校验。"""
    value = (meta or {}).get(key)
    if value:
        input_context[key] = value


def _apply_subagent_runtime_context(input_context: dict, meta: dict | None) -> None:
    """把子智能体 run 的父线程信息注入运行 context。"""
    meta = meta or {}
    if meta.get("run_type") != "subagent":
        for key in ("parent_thread_id", "is_subagent_runtime"):
            input_context.pop(key, None)
        return
    parent_thread_id = str(meta.get("parent_thread_id") or "").strip()
    if not parent_thread_id:
        raise ValueError("子智能体运行缺少必需的 parent_thread_id")
    input_context["parent_thread_id"] = parent_thread_id
    # 标记为子智能体运行，供下游逻辑判断
    input_context["is_subagent_runtime"] = True


def _validate_subagent_attachment_root(*, root_conversation, conversation, uid: str) -> None:
    """确保 SubAgent 只读取同一 Project 根 Conversation 的附件。"""
    if (
        root_conversation is None
        or root_conversation.uid != uid
        or root_conversation.project_id != conversation.project_id
    ):
        raise ValueError("子智能体根 Conversation 的 Project Workdir 不可用")


def _runtime_agent_config(agent_config: dict | None, execution_snapshot: dict | None) -> dict:
    """优先使用 manifest 同次解析的配置，再由调用方追加工作区上下文。"""
    snapshot_context = execution_snapshot.get("normalized_context") if isinstance(execution_snapshot, dict) else None
    return snapshot_context if isinstance(snapshot_context, dict) else dict(agent_config or {})


def _stream_message_key(metadata: dict | None, namespace: list[str], thread_id: str | None) -> tuple[str, str]:
    if not isinstance(metadata, dict):
        return thread_id or "", "/".join(namespace)
    return thread_id or "", str(metadata.get("run_id") or metadata.get("langgraph_node") or "/".join(namespace))


def _stream_message_id(
    message_ids: dict[tuple[str, str], str],
    key: tuple[str, str],
    preferred: str | None = None,
) -> str:
    if preferred:
        message_ids[key] = preferred
        return preferred
    return message_ids.setdefault(key, str(uuid.uuid4()))


def _message_chunk_ars_events(
    msg_dict: dict[str, Any],
    *,
    message_id: str,
    thread_id: str | None,
    namespace: list[str],
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    route = {"thread_id": thread_id, "namespace": namespace}
    content = msg_dict.get("content")
    additional_kwargs = msg_dict.get("additional_kwargs") if isinstance(msg_dict.get("additional_kwargs"), dict) else {}
    reasoning_content = msg_dict.get("reasoning_content")
    additional_reasoning_content = additional_kwargs.get("reasoning_content")

    message_event: dict[str, Any] = {"type": "message_delta", "message_id": message_id, **route}
    if isinstance(content, str) and content:
        message_event["content"] = content
    if isinstance(reasoning_content, str) and reasoning_content:
        message_event["reasoning_content"] = reasoning_content
    if isinstance(additional_reasoning_content, str) and additional_reasoning_content:
        message_event["additional_reasoning_content"] = additional_reasoning_content
    if len(message_event) > 4:
        events.append(message_event)

    tool_call_chunks = msg_dict.get("tool_call_chunks")
    if isinstance(tool_call_chunks, list):
        for tool_call_chunk in tool_call_chunks:
            if not isinstance(tool_call_chunk, dict):
                continue
            args_delta = tool_call_chunk.get("args")
            if args_delta is None:
                args_delta = ""
            elif not isinstance(args_delta, str):
                args_delta = json.dumps(args_delta, ensure_ascii=False)
            if not tool_call_chunk.get("id") and not tool_call_chunk.get("name") and not args_delta:
                continue
            events.append(
                {
                    "type": "tool_call_delta",
                    "message_id": message_id,
                    "tool_call_id": tool_call_chunk.get("id"),
                    "name": tool_call_chunk.get("name") or None,
                    "args_delta": args_delta,
                    "index": tool_call_chunk.get("index") if tool_call_chunk.get("index") is not None else 0,
                    **route,
                }
            )
    return events


def _protocol_event_ars_event(
    event: dict[str, Any],
    *,
    message_id: str | None,
    thread_id: str | None,
    namespace: list[str],
) -> dict[str, Any] | None:
    event_name = event.get("event")
    if event_name in {"message-start", "content-block-start", "message-finish"} or not message_id:
        return None

    route = {"thread_id": thread_id, "namespace": namespace}
    if event_name == "content-block-delta":
        delta = event.get("delta") if isinstance(event.get("delta"), dict) else {}
        text = delta.get("text")
        if delta.get("type") == "text-delta" and isinstance(text, str) and text:
            return {"type": "message_delta", "message_id": message_id, "content": text, **route}
        return None

    if event_name == "content-block-finish":
        content = event.get("content") if isinstance(event.get("content"), dict) else {}
        if content.get("type") != "tool_call" or not content.get("id") and not content.get("name"):
            return None
        return {
            "type": "tool_call",
            "message_id": message_id,
            "tool_call_id": content.get("id"),
            "name": content.get("name"),
            "args": content.get("args") if content.get("args") is not None else {},
            "index": event.get("index") if event.get("index") is not None else 0,
            **route,
        }

    return None


def _context_compression_payload(payload: Any) -> dict | None:
    if isinstance(payload, dict) and payload.get("type") == "ars.context_compression":
        return payload
    return None


def _stream_event_response(event: dict[str, Any]) -> str:
    if event.get("type") != "message_delta":
        return ""
    return str(event.get("content") or "")


def _message_payload_ars_events(
    msg: Any,
    *,
    metadata: dict[str, Any],
    namespace: list[str],
    thread_id: str | None,
    protocol_message_ids: dict[tuple[str, str], str],
) -> list[dict[str, Any]]:
    message_key = _stream_message_key(metadata, namespace, thread_id)
    if isinstance(msg, dict) and isinstance(msg.get("event"), str):
        preferred_message_id = str(msg["id"]) if msg.get("event") == "message-start" and msg.get("id") else None
        message_id = _stream_message_id(protocol_message_ids, message_key, preferred_message_id)
        stream_event = _protocol_event_ars_event(
            msg,
            message_id=message_id,
            thread_id=thread_id,
            namespace=namespace,
        )
        return [stream_event] if stream_event else []

    if isinstance(msg, AIMessageChunk) or hasattr(msg, "model_dump"):
        msg_dict = msg.model_dump()
    elif isinstance(msg, dict):
        msg_dict = dict(msg)
    else:
        msg_dict = {"content": str(msg)}

    message_id = str(msg_dict.get("id") or _stream_message_id(protocol_message_ids, message_key))
    return _message_chunk_ars_events(
        msg_dict,
        message_id=message_id,
        thread_id=thread_id,
        namespace=namespace,
    )


async def _stream_agent_events(agent, messages, *, input_context=None, **kwargs):
    async for mode, payload in agent.stream_messages_with_state(
        messages,
        input_context=input_context,
        **kwargs,
    ):
        yield mode, payload


async def _ensure_persistent_sandbox(*, runtime_scope_id: str, uid: str, workdir_path: str) -> None:
    """物化 Sandbox 的用户级挂载根并确认持久 runtime 可用。"""
    # Workdir 已在 ARQ 发布前物化；这里只补齐首次构图前缺失的 Skill 投影根。
    await asyncio.to_thread(get_user_skills_root_dir, uid)
    backend = ProvisionerSandboxBackend(
        thread_id=runtime_scope_id,
        uid=uid,
        workdir_path=workdir_path,
    )
    await asyncio.to_thread(backend.ensure_available)


async def _get_existing_message_ids(conv_repo: ConversationRepository, thread_id: str) -> set[str]:
    existing_messages = await conv_repo.get_messages_by_thread_id(thread_id)
    return {
        msg.extra_metadata["id"]
        for msg in existing_messages
        if msg.extra_metadata and "id" in msg.extra_metadata and isinstance(msg.extra_metadata["id"], str)
    }


async def _save_ai_message(
    conv_repo: ConversationRepository,
    thread_id: str,
    msg_dict: dict,
    trace_info: dict[str, Any] | None = None,
    run_id: str | None = None,
    request_id: str | None = None,
    commit: bool = True,
):
    content = msg_dict.get("content", "")
    tool_calls_data = msg_dict.get("tool_calls") or []
    if isinstance(content, list):
        if not tool_calls_data:
            tool_calls_data = [
                {"id": item.get("id"), "name": item.get("name"), "args": item.get("args") or {}}
                for item in content
                if isinstance(item, dict) and item.get("type") == "tool_call"
            ]
        content = "\n".join(
            item.get("text", "") for item in content if isinstance(item, dict) and isinstance(item.get("text"), str)
        )
    elif not isinstance(content, str):
        content = str(content)
    extra_metadata = dict(msg_dict)
    if trace_info:
        extra_metadata.update(trace_info)

    ai_msg = await conv_repo.add_message_by_thread_id(
        thread_id=thread_id,
        role="assistant",
        content=content,
        message_type="text",
        extra_metadata=extra_metadata,
        run_id=run_id,
        request_id=request_id,
        commit=commit,
    )

    if ai_msg and tool_calls_data:
        for tc in tool_calls_data:
            await conv_repo.add_tool_call(
                message_id=ai_msg.id,
                tool_name=tc.get("name") or "unknown",
                tool_input=tc.get("args", {}),
                status="pending",
                langgraph_tool_call_id=tc.get("id"),
                commit=commit,
            )

    return ai_msg


async def _save_tool_message(conv_repo: ConversationRepository, msg_dict: dict, *, commit: bool = True) -> None:
    tool_call_id = msg_dict.get("tool_call_id")
    content = msg_dict.get("content", "")

    if not tool_call_id:
        return

    if isinstance(content, list):
        tool_output = json.dumps(content) if content else ""
    else:
        tool_output = str(content)

    await conv_repo.update_tool_call_output(
        langgraph_tool_call_id=tool_call_id,
        tool_output=tool_output,
        status="success",
        commit=commit,
    )


async def _publish_execution_tree_cancel_signals(cancelled: list[tuple[str, str]]) -> None:
    """尽力通知已由 PostgreSQL 收敛的后代 Run 停止执行。"""

    if not cancelled:
        return
    results = await asyncio.gather(
        *(publish_cancel_signal(run_id) for run_id, _thread_id in cancelled),
        return_exceptions=True,
    )
    for (run_id, _thread_id), result in zip(cancelled, results, strict=True):
        if isinstance(result, BaseException):
            logger.warning("Failed to publish execution-tree cancel signal: run=%s", run_id, exc_info=result)


async def save_partial_message(
    conv_repo: ConversationRepository,
    thread_id: str,
    full_msg=None,
    error_message: str | None = None,
    error_type: str = "interrupted",
    trace_info: dict[str, Any] | None = None,
    run_id: str | None = None,
    request_id: str | None = None,
    worker_id: str | None = None,
    interrupt_run: bool = False,
):
    cancelled_descendants: list[tuple[str, str]] = []
    try:
        extra_metadata = {
            "error_type": error_type,
            "is_error": True,
            "error_message": error_message or f"发生错误: {error_type}",
        }
        if full_msg:
            msg_dict = full_msg.model_dump() if hasattr(full_msg, "model_dump") else {}
            content = full_msg.content if hasattr(full_msg, "content") else str(full_msg)
            extra_metadata = msg_dict | extra_metadata
        else:
            content = ""

        if trace_info:
            extra_metadata.update(trace_info)

        run_repo = AgentRunRepository(conv_repo.db) if run_id else None
        if run_id:
            if not worker_id or not request_id:
                raise ValueError("持久化 AgentRun 部分输出需要当前 worker 和 request")
            locked_run = await run_repo.lock_output_persistence(
                run_id,
                worker_id=worker_id,
                conversation_thread_id=thread_id,
                request_id=request_id,
            )
            if locked_run is None:
                raise ValueError(f"AgentRun 不存在: {run_id}")

        message = await conv_repo.add_message_by_thread_id(
            thread_id=thread_id,
            role="assistant",
            content=content,
            message_type="text",
            extra_metadata=extra_metadata,
            run_id=run_id,
            request_id=request_id,
            commit=run_id is None,
        )
        if run_id and message is not None:
            await run_repo.set_output_message(run_id, message.id, worker_id=worker_id)
            if interrupt_run:
                terminal_run, changed = await run_repo.set_terminal_status(
                    run_id,
                    status="interrupted",
                    error_type=error_type,
                    error_message=error_message,
                    token_usage={"available": False},
                    worker_id=worker_id,
                )
                if terminal_run is None or not changed:
                    raise ValueError("AgentRun 部分输出已写入但 interrupted 终态未能在同一事务提交")
                cancelled_descendants = await run_repo.cancel_active_execution_tree_descendants(terminal_run)
            await conv_repo.db.commit()
            await _publish_execution_tree_cancel_signals(cancelled_descendants)
        elif run_id and interrupt_run:
            raise ValueError("AgentRun 中断输出消息未能持久化")
        return message

    except Exception as e:
        if run_id:
            await conv_repo.db.rollback()
        logger.exception(f"Error saving message: {e}")
        if interrupt_run:
            raise
        return None


async def save_messages_from_langgraph_state(
    agent_instance,
    thread_id: str,
    conv_repo: ConversationRepository,
    config_dict: dict,
    context,
    trace_info: dict[str, Any] | None = None,
    run_id: str | None = None,
    request_id: str | None = None,
    worker_id: str | None = None,
    complete_run: bool = False,
    interrupt_run: bool = False,
    interrupt_error_type: str | None = None,
    interrupt_error_message: str | None = None,
    token_usage: dict[str, Any] | None = None,
) -> bool:
    """在有效 lease 锁内原子写入消息与完成或中断终态。"""

    if complete_run and interrupt_run:
        raise ValueError("AgentRun 不能同时完成和中断")

    run_repo = AgentRunRepository(conv_repo.db) if run_id else None
    cancelled_descendants: list[tuple[str, str]] = []
    try:
        if run_id:
            if not worker_id or not request_id:
                raise ValueError("持久化 AgentRun 输出需要 worker、thread 和 request 因果归属")
            locked_run = await run_repo.lock_output_persistence(
                run_id,
                worker_id=worker_id,
                conversation_thread_id=thread_id,
                request_id=request_id,
            )
            if locked_run is None:
                raise ValueError(f"AgentRun 不存在: {run_id}")

        messages = await _get_langgraph_messages(agent_instance, config_dict, context=context)
        existing_ids = await _get_existing_message_ids(conv_repo, thread_id)
        last_ai_message = None
        for msg in messages or []:
            if hasattr(msg, "model_dump"):
                msg_dict = msg.model_dump()
            elif isinstance(msg, dict):
                msg_dict = dict(msg)
            else:
                continue

            msg_type = msg_dict.get("type", "unknown")
            if msg_type == "unknown":
                role = msg_dict.get("role")
                if role in {"assistant", "ai"}:
                    msg_type = "ai"
                elif role in {"user", "human"}:
                    msg_type = "human"
                elif role == "tool":
                    msg_type = "tool"

            msg_id = getattr(msg, "id", None) or msg_dict.get("id")
            if msg_type == "human" or msg_id in existing_ids:
                continue

            if msg_type == "ai":
                last_ai_message = await _save_ai_message(
                    conv_repo,
                    thread_id,
                    msg_dict,
                    trace_info=trace_info,
                    run_id=run_id,
                    request_id=request_id,
                    commit=run_id is None,
                )
            elif msg_type == "tool":
                await _save_tool_message(conv_repo, msg_dict, commit=run_id is None)

        if run_id:
            if last_ai_message is not None:
                await run_repo.set_output_message(
                    run_id,
                    last_ai_message.id,
                    worker_id=worker_id,
                )
            terminal_status = "completed" if complete_run else "interrupted" if interrupt_run else None
            if terminal_status:
                terminal_run, changed = await run_repo.set_terminal_status(
                    run_id,
                    status=terminal_status,
                    error_type=interrupt_error_type if interrupt_run else None,
                    error_message=interrupt_error_message if interrupt_run else None,
                    token_usage=token_usage or {"available": False},
                    worker_id=worker_id,
                )
                if terminal_run is None or not changed:
                    raise ValueError(f"AgentRun 输出已写入但 {terminal_status} 终态未能在同一事务提交")
                cancelled_descendants = await run_repo.cancel_active_execution_tree_descendants(terminal_run)
            await conv_repo.db.commit()
            await _publish_execution_tree_cancel_signals(cancelled_descendants)
            return terminal_status is not None
        return False
    except asyncio.CancelledError:
        if run_id:
            await conv_repo.db.rollback()
        raise
    except Exception:
        if run_id:
            await conv_repo.db.rollback()
        raise


def _extract_interrupt_info(state) -> Any | None:
    """从 LangGraph state 中提取中断信息"""
    if hasattr(state, "tasks") and state.tasks:
        for task in state.tasks:
            if hasattr(task, "interrupts") and task.interrupts:
                return task.interrupts[0]

    interrupt_data = state.values.get("__interrupt__")
    if isinstance(interrupt_data, list) and interrupt_data:
        return interrupt_data[0]

    return None


def _coerce_interrupt_payload(info: Any) -> dict:
    """将 LangGraph interrupt 对象转换为 dict 结构。"""
    if isinstance(info, dict):
        return info

    payload = getattr(info, "value", None)
    if isinstance(payload, dict):
        return payload

    questions = getattr(info, "questions", None)
    source = getattr(info, "source", None)
    result: dict[str, Any] = {}
    if isinstance(questions, list):
        result["questions"] = questions
    if isinstance(source, str) and source.strip():
        result["source"] = source
    return result


def _build_ask_user_question_payload(payload: dict, thread_id: str) -> dict[str, Any]:
    """将已标准化的 interrupt payload 转换为 ask_user_question_required 载荷。"""

    questions = _normalize_interrupt_questions(payload.get("questions"))

    if not questions:
        questions = [
            {
                "question_id": str(uuid.uuid4()),
                "question": "请选择一个选项",
                "options": [],
                "multi_select": False,
                "allow_other": True,
            }
        ]

    source = str(payload.get("source") or payload.get("tool_name") or "interrupt")

    return {
        "questions": questions,
        "source": source,
        "thread_id": thread_id,
    }


def _build_tool_approval_payload(payload: dict, thread_id: str) -> dict[str, Any] | None:
    """将已标准化的 interrupt payload 转换为 tool_approval_required 载荷。"""
    action_requests = payload.get("action_requests")
    review_configs = payload.get("review_configs")
    if not isinstance(action_requests, list) or not isinstance(review_configs, list):
        return None
    if not action_requests or len(action_requests) != len(review_configs):
        return None
    return {
        "approval": {
            "action_requests": _json_safe(action_requests),
            "review_configs": _json_safe(review_configs),
        },
        "thread_id": thread_id,
    }


def _build_pending_interrupt_payload(info: Any, thread_id: str) -> dict[str, Any]:
    """将 checkpoint 中断信息转换为前端可恢复的统一载荷。"""
    coerced = _coerce_interrupt_payload(info)
    approval_payload = _build_tool_approval_payload(coerced, thread_id)
    if approval_payload:
        return {"status": "human_approval_required", **approval_payload}

    question_payload = _build_ask_user_question_payload(coerced, thread_id)
    return {"status": "ask_user_question_required", **question_payload}


def _interrupt_terminal_details(chunk: bytes) -> tuple[str, str]:
    """从待发送中断 chunk 提取持久终态的错误类型与摘要。"""
    try:
        payload = json.loads(chunk)
    except (TypeError, ValueError):
        return "interrupted", "等待用户交互"
    status = str(payload.get("status") or "interrupted")
    if status == "human_approval_required":
        return status, "需要用户审批工具操作"
    questions = payload.get("questions")
    if isinstance(questions, list) and questions and isinstance(questions[0], dict):
        question = str(questions[0].get("question") or "").strip()
        if question:
            return status, question
    return status, str(payload.get("message") or "需要用户回答问题")


def _ensure_full_msg(full_msg: AIMessage | None, accumulated_content: list[str]) -> AIMessage | None:
    """如果 full_msg 为空且有累积内容，构建 AIMessage"""
    if not full_msg and accumulated_content:
        return AIMessage(content="".join(accumulated_content))
    return full_msg


def _extract_ai_message(messages: list[Any] | None) -> AIMessage | None:
    """从消息列表中提取最后一条 AIMessage。"""
    if not isinstance(messages, list):
        return None

    for msg in reversed(messages):
        if isinstance(msg, AIMessage):
            return msg

        msg_dict = msg.model_dump() if hasattr(msg, "model_dump") else {}
        if msg_dict.get("type") == "ai":
            content = msg_dict.get("content", "")
            return msg if hasattr(msg, "content") else AIMessage(content=content)

    return None


async def _resolve_agent_runtime(
    *,
    db,
    user: User,
    requested_agent_slug: str | None,
    thread_id: str | None,
    agent_kind: Literal["main", "subagent"] = "main",
) -> tuple[Agent, Any, dict, Any | None]:
    """解析智能体运行时，并返回已校验的线程快照。"""
    agent_repo = AgentRepository(db)
    conv_repo = ConversationRepository(db)
    resolved_agent_slug = requested_agent_slug
    conversation = None

    if thread_id:
        conversation = await conv_repo.get_conversation_by_thread_id(thread_id)
        if conversation:
            if conversation.uid != str(user.uid) or conversation.status == "deleted":
                raise ValueError("对话线程不存在")
            # Conversation.agent_id 是历史字段名，实际保存的是 Agent.slug。
            if requested_agent_slug and requested_agent_slug != conversation.agent_id:
                raise ValueError("已有线程已绑定智能体，不能切换")
            await resolve_conversation_workdir_path(conversation=conversation, uid=str(user.uid), db=db)
            resolved_agent_slug = conversation.agent_id

    if not resolved_agent_slug:
        raise ValueError("缺少必需的 agent_slug 字段")

    agent_item = await agent_repo.get_visible_by_slug(slug=resolved_agent_slug, user=user, kind=agent_kind)
    if not agent_item:
        raise ValueError("智能体不存在或无权限访问")

    backend = agent_manager.get_agent(agent_item.backend_id)
    if not backend:
        raise ValueError(f"智能体后端 {agent_item.backend_id} 不存在")

    agent_config = await normalize_agent_context_config(
        (agent_item.config_json or {}).get("context", {}),
        db=db,
        user=user,
        context_schema=backend.context_schema,
    )
    return agent_item, backend, agent_config, conversation


async def check_and_handle_interrupts(
    agent,
    langgraph_config: dict,
    make_chunk,
    meta: dict,
    thread_id: str,
    context,
) -> AsyncIterator[bytes]:
    try:
        graph = await agent.get_graph(context=context)
        state = await graph.aget_state(langgraph_config)

        if not state or not state.values:
            return

        interrupt_info = _extract_interrupt_info(state)
        if interrupt_info:
            pending_interrupt = _build_pending_interrupt_payload(interrupt_info, thread_id)
            status = pending_interrupt.pop("status")
            meta["interrupt"] = pending_interrupt
            yield make_chunk(status=status, meta=meta, **pending_interrupt)

    except Exception as e:
        logger.exception(f"Error checking interrupts: {e}")


async def _ensure_thread_bound_agent(
    *,
    conv_repo: ConversationRepository,
    conversation: Any | None,
    thread_id: str,
    uid: str,
    agent_item: Agent,
    db,
) -> Any:
    if not conversation:
        project = await create_implicit_project(uid=uid, db=db)
        conversation = await conv_repo.add_conversation(
            uid=uid,
            agent_id=agent_item.slug,
            thread_id=thread_id,
            metadata={"backend_id": agent_item.backend_id},
            project_id=project.id,
        )
        await db.commit()
        ensure_bound_user_workdir(uid, project.workdir_path)
        return conversation

    if conversation.agent_id != agent_item.slug:
        raise ValueError("已有线程已绑定智能体，不能切换")
    return conversation


async def stream_agent_chat(
    *,
    agent_slug: str,
    thread_id: str | None,
    meta: dict,
    input_message: AgentRunInputMessage,
    current_user,
    db,
    save_user_message: bool = True,
    execution_snapshot: dict | None = None,
) -> AsyncIterator[bytes]:
    start_time = asyncio.get_event_loop().time()

    def make_chunk(content=None, **kwargs):
        chunk_thread_id = kwargs.pop("thread_id", None) or meta.get("thread_id") or thread_id
        return (
            json.dumps(
                {"request_id": meta.get("request_id"), "response": content, "thread_id": chunk_thread_id, **kwargs},
                ensure_ascii=False,
            ).encode("utf-8")
            + b"\n"
        )

    meta = dict(meta or {})
    if "request_id" not in meta or not meta.get("request_id"):
        logger.warning("请求缺少 request_id，已自动生成一个新的 request_id")
        meta["request_id"] = str(uuid.uuid4())

    uid = str(current_user.uid)
    if not thread_id:
        thread_id = str(uuid.uuid4())
        logger.warning(f"No thread_id provided, generated new thread_id: {thread_id}")

    query = input_message.content
    image_content = input_message.image_content
    human_message = input_message.require_langchain_message()
    message_type = input_message.message_type
    system_config = await system_options.get(db)
    content_guard_enabled = bool(system_config["enable_content_guard"])
    request_content_guard = content_guard.configured(
        content_guard_enabled and bool(system_config["enable_content_guard_llm"]),
        str(system_config["content_guard_llm_model"]),
    )

    if content_guard_enabled and await request_content_guard.check(query):
        yield make_chunk(
            status="error", error_type="content_guard_blocked", error_message="输入内容包含敏感词", meta=meta
        )
        return

    try:
        agent_item, agent, agent_config, conversation = await _resolve_agent_runtime(
            db=db,
            user=current_user,
            requested_agent_slug=agent_slug,
            thread_id=thread_id,
            agent_kind="subagent" if meta.get("run_type") == "subagent" else "main",
        )
    except ValueError as e:
        yield make_chunk(status="error", error_type="invalid_agent", error_message=str(e), meta=meta)
        return

    meta.update(
        {
            "query": query,
            "agent_slug": agent_item.slug,
            "backend_id": agent_item.backend_id,
            "thread_id": thread_id,
            "uid": current_user.uid,
            "has_image": bool(image_content),
        }
    )

    full_msg = None
    accumulated_content: list[str] = []
    trace_info: dict[str, Any] = {}
    last_agent_state_signature = ""

    try:
        conv_repo = ConversationRepository(db)
        conversation = await _ensure_thread_bound_agent(
            conv_repo=conv_repo,
            conversation=conversation,
            thread_id=thread_id,
            uid=uid,
            agent_item=agent_item,
            db=db,
        )
        input_context = await build_agent_input_context(
            _runtime_agent_config(agent_config, execution_snapshot),
            thread_id=thread_id,
            uid=uid,
            run_id=meta.get("run_id"),
            request_id=meta.get("request_id"),
            worker_id=meta.get("worker_id"),
        )
        _apply_model_override(input_context, meta)
        _apply_input_context_field(input_context, meta, "tool_approval_mode")
        runtime_scope_id = str(meta.get("runtime_scope_id") or thread_id)
        workdir_path = await resolve_conversation_workdir_path(conversation=conversation, uid=uid, db=db)
        input_context["runtime_scope_id"] = runtime_scope_id
        input_context["workdir_relative_path"] = workdir_path
        input_context["workdir_path"] = runtime_workdir_path(workdir_path)
        meta["runtime_scope_id"] = runtime_scope_id
        meta["workdir_relative_path"] = workdir_path
        meta["workdir_path"] = input_context["workdir_path"]
        _apply_subagent_runtime_context(input_context, meta)
        context = _build_agent_context(agent, input_context)
        if isinstance(execution_snapshot, dict):
            setattr(context, "_skill_runtime_snapshot", execution_snapshot.get("skill_runtime_snapshot"))
        langfuse_run = _build_langfuse_run_context(
            current_user=current_user,
            thread_id=thread_id,
            agent_id=agent_item.slug,
            backend_id=agent_item.backend_id,
            request_id=meta["request_id"],
            operation="agent_chat_stream",
            message_type=message_type,
            meta=meta,
        )

        attachment_conversation = conversation
        if meta.get("run_type") == "subagent":
            attachment_conversation = await conv_repo.get_conversation_by_thread_id(runtime_scope_id)
            _validate_subagent_attachment_root(
                root_conversation=attachment_conversation,
                conversation=conversation,
                uid=uid,
            )
        thread_attachment_records = await conv_repo.get_attachments(attachment_conversation.id)
        request_attachment_records = [
            attachment for attachment in thread_attachment_records if attachment.get("request_id") == meta["request_id"]
        ]
        request_attachments = [
            serialize_attachment(attachment, thread_id=thread_id) for attachment in request_attachment_records
        ]
        thread_attachments = [
            serialize_attachment(attachment, thread_id=thread_id) for attachment in thread_attachment_records
        ]
        messages = [_with_attachment_context(human_message, thread_attachments)]

        init_msg = {
            "role": "user",
            "content": query,
            "type": "human",
            "message_type": message_type,
            "extra_metadata": {
                "request_id": meta.get("request_id"),
                "attachments": request_attachments,
            },
        }
        if image_content:
            init_msg["image_content"] = image_content
        yield make_chunk(status="init", meta=meta, msg=init_msg)

        if save_user_message:
            try:
                await conv_repo.add_message_by_thread_id(
                    thread_id=thread_id,
                    role="user",
                    content=query,
                    message_type=message_type,
                    image_content=image_content,
                    extra_metadata={
                        "raw_message": human_message.model_dump(),
                        "request_id": meta.get("request_id"),
                        "attachments": request_attachments,
                    },
                )
            except Exception as e:
                logger.error(f"Error saving user message: {e}")

        # 智能体流式执行期间不访问业务数据库，先结束预处理事务并归还连接池。
        await db.commit()
        await _ensure_persistent_sandbox(
            runtime_scope_id=runtime_scope_id,
            uid=uid,
            workdir_path=workdir_path,
        )

        # 先构建 langgraph_config
        langgraph_config = {"configurable": {"thread_id": thread_id, "uid": uid}}

        protocol_message_ids: dict[tuple[str, str], str] = {}
        async for mode, payload in _stream_agent_events(
            agent,
            messages,
            input_context=input_context,
            callbacks=langfuse_run.callbacks,
            metadata=langfuse_run.metadata,
            tags=langfuse_run.tags,
        ):
            if mode == "values":
                agent_state = extract_agent_state(
                    payload if isinstance(payload, dict) else {},
                    workdir_path=meta.get("workdir_path"),
                )
                signature = _agent_state_signature(agent_state)
                if signature and signature != last_agent_state_signature:
                    last_agent_state_signature = signature
                    yield make_chunk(status="agent_state", agent_state=agent_state, meta=meta)
                continue

            if mode == "custom":
                compression = _context_compression_payload(payload)
                if compression is not None:
                    yield make_chunk(status="context_compression", compression=compression, meta=meta)
                continue

            if mode == "stream_event":
                yield make_chunk(
                    status="stream_event",
                    event=payload,
                    namespace=payload.get("namespace") if isinstance(payload, dict) else [],
                    meta=meta,
                    thread_id=payload.get("thread_id") if isinstance(payload, dict) else None,
                )
                continue

            msg, metadata = payload
            namespace = _metadata_namespace(metadata)
            chunk_thread_id = _metadata_thread_id(metadata, thread_id if not namespace else None)
            if namespace and not chunk_thread_id:
                continue

            is_subagent_chunk = bool(chunk_thread_id and chunk_thread_id != thread_id)
            stream_events = _message_payload_ars_events(
                msg,
                metadata=metadata,
                namespace=namespace,
                thread_id=chunk_thread_id,
                protocol_message_ids=protocol_message_ids,
            )

            for stream_event in stream_events:
                content = _stream_event_response(stream_event)
                if not is_subagent_chunk and content:
                    trace_info = get_trace_info(langfuse_run)
                    accumulated_content.append(content)
                    content_for_check = "".join(accumulated_content[-10:])
                    if content_guard_enabled and await request_content_guard.check_with_keywords(content_for_check):
                        full_msg = AIMessage(content="".join(accumulated_content))
                        await save_partial_message(
                            conv_repo,
                            thread_id,
                            full_msg,
                            "content_guard_blocked",
                            trace_info=trace_info,
                            run_id=meta.get("run_id"),
                            request_id=meta.get("request_id"),
                            worker_id=meta.get("worker_id"),
                            interrupt_run=True,
                        )
                        meta["time_cost"] = asyncio.get_event_loop().time() - start_time
                        yield make_chunk(
                            status="interrupted",
                            message="检测到敏感内容，已中断输出",
                            meta=meta,
                            terminal_committed=True,
                        )
                        return

                yield make_chunk(
                    content=content,
                    stream_event=stream_event,
                    metadata=metadata,
                    status="loading",
                    thread_id=chunk_thread_id,
                )

        full_msg = _ensure_full_msg(full_msg, accumulated_content)
        trace_info = get_trace_info(langfuse_run)

        if (
            content_guard_enabled
            and hasattr(full_msg, "content")
            and await request_content_guard.check(full_msg.content)
        ):
            await save_partial_message(
                conv_repo,
                thread_id,
                full_msg,
                "content_guard_blocked",
                trace_info=trace_info,
                run_id=meta.get("run_id"),
                request_id=meta.get("request_id"),
                worker_id=meta.get("worker_id"),
                interrupt_run=True,
            )
            meta["time_cost"] = asyncio.get_event_loop().time() - start_time
            yield make_chunk(
                status="interrupted",
                message="检测到敏感内容，已中断输出",
                meta=meta,
                terminal_committed=True,
            )
            return

        interrupted = False
        interrupt_error_type = None
        interrupt_error_message = None
        async for chunk in check_and_handle_interrupts(agent, langgraph_config, make_chunk, meta, thread_id, context):
            interrupted = True
            interrupt_error_type, interrupt_error_message = _interrupt_terminal_details(chunk)
            yield chunk

        meta["time_cost"] = asyncio.get_event_loop().time() - start_time
        try:
            graph = await agent.get_graph(context=context)
            state = await graph.aget_state(langgraph_config)
            agent_state = (
                extract_agent_state(getattr(state, "values", {}), workdir_path=meta.get("workdir_path"))
                if state
                else {}
            )
        except Exception:
            agent_state = {}

        final_signature = _agent_state_signature(agent_state)
        if final_signature and final_signature != last_agent_state_signature:
            last_agent_state_signature = final_signature
            yield make_chunk(status="agent_state", agent_state=agent_state, meta=meta)

        # 先存储数据库，再返回 finished，避免前端查询时数据未落库
        try:
            terminal_committed = await save_messages_from_langgraph_state(
                agent_instance=agent,
                thread_id=thread_id,
                conv_repo=conv_repo,
                config_dict=langgraph_config,
                context=context,
                trace_info=trace_info,
                run_id=meta.get("run_id"),
                request_id=meta.get("request_id"),
                worker_id=meta.get("worker_id"),
                complete_run=not interrupted,
                interrupt_run=interrupted,
                interrupt_error_type=interrupt_error_type,
                interrupt_error_message=interrupt_error_message,
                token_usage=_current_run_token_usage(agent_state, meta.get("run_id")),
            )
        except Exception as e:
            logger.exception(f"Error saving messages from LangGraph state: {e}")
            yield make_chunk(
                status="error",
                error_type="output_persistence_error",
                error_message="最终输出持久化或绑定失败",
                meta=meta,
            )
            return

        if interrupted:
            return

        yield make_chunk(status="finished", meta=meta, terminal_committed=terminal_committed)

    except (asyncio.CancelledError, ConnectionError) as e:
        logger.warning(f"Client disconnected, cancelling stream: {e}")
        yield make_chunk(status="interrupted", message="对话已中断", meta=meta)

    except Exception as e:
        logger.exception(f"Error streaming messages: {e}")

        error_msg = f"Error streaming messages: {e}"
        error_type = "unexpected_error"

        full_msg = _ensure_full_msg(full_msg, accumulated_content)

        async with pg_manager.get_async_session_context() as new_db:
            new_conv_repo = ConversationRepository(new_db)
            await save_partial_message(
                new_conv_repo,
                thread_id,
                full_msg=full_msg,
                error_message=error_msg,
                error_type=error_type,
                trace_info=trace_info,
                run_id=meta.get("run_id"),
                request_id=meta.get("request_id"),
                worker_id=meta.get("worker_id"),
            )

        yield make_chunk(status="error", error_type=error_type, error_message=error_msg, meta=meta)
    finally:
        flush_langfuse()


async def stream_agent_resume(
    *,
    thread_id: str,
    resume_input: Any,
    meta: dict,
    current_user,
    db,
    execution_snapshot: dict | None = None,
) -> AsyncIterator[bytes]:
    start_time = asyncio.get_event_loop().time()

    def make_resume_chunk(content=None, **kwargs):
        chunk_thread_id = kwargs.pop("thread_id", None) or meta.get("thread_id") or thread_id
        return (
            json.dumps(
                {"request_id": meta.get("request_id"), "response": content, "thread_id": chunk_thread_id, **kwargs},
                ensure_ascii=False,
            ).encode("utf-8")
            + b"\n"
        )

    yield make_resume_chunk(status="init", meta=meta)

    uid = str(current_user.uid)
    try:
        agent_item, agent, agent_config, conversation = await _resolve_agent_runtime(
            db=db,
            user=current_user,
            requested_agent_slug=None,
            thread_id=thread_id,
        )
    except ValueError as e:
        yield make_resume_chunk(status="error", error_type="invalid_agent", error_message=str(e), meta=meta)
        return

    if conversation is None:
        yield make_resume_chunk(status="error", error_type="invalid_thread", error_message="对话线程不存在", meta=meta)
        return
    conv_repo = ConversationRepository(db)
    resume_command = Command(resume=resume_input)

    # 恢复流执行期间不访问业务数据库，先结束运行时解析事务并归还连接池。
    await db.commit()
    meta["agent_slug"] = agent_item.slug
    meta["backend_id"] = agent_item.backend_id
    runtime_scope_id = str(meta.get("runtime_scope_id") or thread_id)
    workdir_path = await resolve_conversation_workdir_path(conversation=conversation, uid=uid, db=db)
    meta["runtime_scope_id"] = runtime_scope_id
    meta["workdir_relative_path"] = workdir_path
    meta["workdir_path"] = runtime_workdir_path(workdir_path)
    await _ensure_persistent_sandbox(
        runtime_scope_id=runtime_scope_id,
        uid=uid,
        workdir_path=workdir_path,
    )
    input_context = await build_agent_input_context(
        _runtime_agent_config(agent_config, execution_snapshot),
        thread_id=thread_id,
        uid=uid,
        run_id=meta.get("run_id"),
        request_id=meta.get("request_id"),
        worker_id=meta.get("worker_id"),
    )
    _apply_model_override(input_context, meta)
    _apply_input_context_field(input_context, meta, "tool_approval_mode")
    input_context["runtime_scope_id"] = runtime_scope_id
    input_context["workdir_relative_path"] = workdir_path
    input_context["workdir_path"] = meta["workdir_path"]
    context = _build_agent_context(agent, input_context)
    if isinstance(execution_snapshot, dict):
        setattr(context, "_skill_runtime_snapshot", execution_snapshot.get("skill_runtime_snapshot"))
    langfuse_run = _build_langfuse_run_context(
        current_user=current_user,
        thread_id=thread_id,
        agent_id=agent_item.slug,
        backend_id=agent_item.backend_id,
        request_id=meta.get("request_id") or str(uuid.uuid4()),
        operation="agent_chat_resume",
        message_type="resume",
        meta=meta,
    )
    trace_info: dict[str, Any] = {}
    last_agent_state_signature = ""

    stream_source = agent.stream_resume_with_state(
        resume_command,
        input_context=input_context,
        callbacks=langfuse_run.callbacks,
        metadata=langfuse_run.metadata,
        tags=langfuse_run.tags,
    )

    protocol_message_ids: dict[tuple[str, str], str] = {}

    try:
        async for mode, payload in stream_source:
            if mode == "values":
                agent_state = extract_agent_state(
                    payload if isinstance(payload, dict) else {},
                    workdir_path=meta.get("workdir_path"),
                )
                signature = _agent_state_signature(agent_state)
                if signature and signature != last_agent_state_signature:
                    last_agent_state_signature = signature
                    yield make_resume_chunk(status="agent_state", agent_state=agent_state, meta=meta)
                continue

            if mode == "stream_event":
                event_payload = payload if isinstance(payload, dict) else {}
                yield make_resume_chunk(
                    status="stream_event",
                    event=event_payload,
                    namespace=event_payload.get("namespace") or [],
                    meta=meta,
                    thread_id=event_payload.get("thread_id"),
                )
                continue

            if mode == "custom":
                compression = _context_compression_payload(payload)
                if compression is not None:
                    yield make_resume_chunk(status="context_compression", compression=compression, meta=meta)
                continue

            if mode != "messages":
                continue

            msg, metadata = payload
            metadata = dict(metadata or {})
            namespace = _metadata_namespace(metadata)
            chunk_thread_id = _metadata_thread_id(metadata, thread_id if not namespace else None)
            if namespace and not chunk_thread_id:
                continue

            if chunk_thread_id == thread_id:
                trace_info = get_trace_info(langfuse_run)

            stream_events = _message_payload_ars_events(
                msg,
                metadata=metadata,
                namespace=namespace,
                thread_id=chunk_thread_id,
                protocol_message_ids=protocol_message_ids,
            )

            for stream_event in stream_events:
                content = _stream_event_response(stream_event)
                yield make_resume_chunk(
                    content=content,
                    stream_event=stream_event,
                    metadata=metadata,
                    status="loading",
                    thread_id=chunk_thread_id,
                )

        langgraph_config = {"configurable": {"thread_id": thread_id, "uid": uid}}
        interrupted = False
        interrupt_error_type = None
        interrupt_error_message = None
        async for chunk in check_and_handle_interrupts(
            agent, langgraph_config, make_resume_chunk, meta, thread_id, context
        ):
            interrupted = True
            interrupt_error_type, interrupt_error_message = _interrupt_terminal_details(chunk)
            yield chunk

        meta["time_cost"] = asyncio.get_event_loop().time() - start_time

        try:
            graph = await agent.get_graph(context=context)
            state = await graph.aget_state(langgraph_config)
            agent_state = (
                extract_agent_state(getattr(state, "values", {}), workdir_path=meta.get("workdir_path"))
                if state
                else {}
            )
        except Exception:
            agent_state = {}

        final_signature = _agent_state_signature(agent_state)
        if final_signature and final_signature != last_agent_state_signature:
            yield make_resume_chunk(status="agent_state", agent_state=agent_state, meta=meta)

        # 先存储数据库，再返回 finished，避免前端查询时数据未落库
        try:
            terminal_committed = await save_messages_from_langgraph_state(
                agent_instance=agent,
                thread_id=thread_id,
                conv_repo=conv_repo,
                config_dict=langgraph_config,
                context=context,
                trace_info=trace_info,
                run_id=meta.get("run_id"),
                request_id=meta.get("request_id"),
                worker_id=meta.get("worker_id"),
                complete_run=not interrupted,
                interrupt_run=interrupted,
                interrupt_error_type=interrupt_error_type,
                interrupt_error_message=interrupt_error_message,
                token_usage=_current_run_token_usage(agent_state, meta.get("run_id")),
            )
        except Exception as e:
            logger.exception(f"Error saving messages from LangGraph state: {e}")
            yield make_resume_chunk(
                status="error",
                error_type="output_persistence_error",
                error_message="最终输出持久化或绑定失败",
                meta=meta,
            )
            return

        if interrupted:
            return

        yield make_resume_chunk(status="finished", meta=meta, terminal_committed=terminal_committed)

    except (asyncio.CancelledError, ConnectionError) as e:
        logger.warning(f"Client disconnected during resume: {e}")
        yield make_resume_chunk(status="interrupted", message="对话恢复已中断", meta=meta)

    except Exception as e:
        logger.exception(f"Error during resume: {e}")

        async with pg_manager.get_async_session_context() as new_db:
            new_conv_repo = ConversationRepository(new_db)
            await save_partial_message(
                new_conv_repo,
                thread_id,
                error_message=f"Error during resume: {e}",
                error_type="resume_error",
                trace_info=trace_info,
                run_id=meta.get("run_id"),
                request_id=meta.get("request_id"),
                worker_id=meta.get("worker_id"),
            )

        yield make_resume_chunk(message=f"Error during resume: {e}", status="error")
    finally:
        flush_langfuse()


def _serialize_state_messages(values: dict[str, Any]) -> list[dict[str, Any]]:
    messages = values.get("messages") if isinstance(values, dict) else None
    if not isinstance(messages, list):
        return []
    serialized = []
    for message in messages:
        if hasattr(message, "model_dump"):
            serialized.append(message.model_dump())
        elif isinstance(message, dict):
            serialized.append(dict(message))
        else:
            serialized.append({"type": "unknown", "content": str(message)})
    return serialized


async def _read_checkpoint_state(agent, *, uid: str, thread_id: str, context):
    graph = await agent.get_graph(context=context)
    langgraph_config = {"configurable": {"uid": uid, "thread_id": thread_id}}
    return await graph.aget_state(langgraph_config)


async def get_agent_state_view(
    *,
    thread_id: str,
    current_user: User,
    db,
    include_messages: bool = False,
    include_relations: bool = True,
) -> dict:
    from fastapi import HTTPException

    current_uid = str(current_user.uid)
    conv_repo = ConversationRepository(db)
    agent_repo = AgentRepository(db)
    run_repo = AgentRunRepository(db)
    conversation = await conv_repo.get_conversation_by_thread_id(thread_id)
    if conversation:
        if conversation.uid != str(current_uid) or conversation.status == "deleted":
            raise HTTPException(status_code=404, detail="对话线程不存在")

        agent_item = await agent_repo.get_by_slug(conversation.agent_id)
        if not agent_item:
            raise HTTPException(status_code=404, detail="智能体不存在")
        agent = agent_manager.get_agent(agent_item.backend_id)
        if not agent:
            raise HTTPException(status_code=404, detail="智能体后端不存在")
        agent_config = await normalize_agent_context_config(
            (agent_item.config_json or {}).get("context", {}),
            db=db,
            user=current_user,
            context_schema=agent.context_schema,
        )
        input_context = await build_agent_input_context(
            agent_config,
            thread_id=thread_id,
            uid=current_uid,
        )
        latest_run = await run_repo.get_latest_run_by_thread_for_user(thread_id, current_uid)
        conversation_model_spec = (getattr(conversation, "extra_metadata", None) or {}).get("model_spec")
        if isinstance(conversation_model_spec, str) and conversation_model_spec.strip():
            input_context["model"] = conversation_model_spec.strip()
        elif conversation.status == "subagent" and latest_run and isinstance(latest_run.input_payload, dict):
            model_spec = latest_run.input_payload.get("model_spec")
            if isinstance(model_spec, str) and model_spec.strip():
                input_context["model"] = model_spec.strip()
        if latest_run and isinstance(latest_run.input_payload, dict):
            tool_approval_mode = latest_run.input_payload.get("tool_approval_mode")
            if tool_approval_mode:
                input_context["tool_approval_mode"] = tool_approval_mode
        workdir_path = await resolve_conversation_workdir_path(
            conversation=conversation,
            uid=current_uid,
            db=db,
        )
        runtime_scope_id = str(getattr(latest_run, "runtime_scope_id", None) or thread_id)
        input_context["runtime_scope_id"] = runtime_scope_id
        input_context["workdir_relative_path"] = workdir_path
        input_context["workdir_path"] = runtime_workdir_path(workdir_path)
        context = _build_agent_context(agent, input_context)
        state = await _read_checkpoint_state(agent, uid=current_uid, thread_id=thread_id, context=context)
        values = getattr(state, "values", {}) if state else {}
        response = {
            "agent_state": extract_agent_state(
                values,
                workdir_path=runtime_workdir_path(workdir_path),
            )
        }
        interrupt_info = _extract_interrupt_info(state) if state else None
        if latest_run and latest_run.status == "interrupted" and interrupt_info:
            response["interrupt"] = {
                **_build_pending_interrupt_payload(interrupt_info, thread_id),
                "run_id": latest_run.id,
            }
        if include_relations:
            relation = await SubagentThreadRepository(db).get_by_child_conversation_for_user(
                conversation.id,
                str(current_uid),
            )
            if relation:
                parent_conversation = await conv_repo.get_conversation_by_id(relation.parent_conversation_id)
                if (
                    not parent_conversation
                    or parent_conversation.uid != str(current_uid)
                    or parent_conversation.status == "deleted"
                ):
                    raise HTTPException(status_code=404, detail="父对话线程不存在")
                response["parent_thread_id"] = parent_conversation.thread_id
                response["subagent_thread"] = relation.to_dict()
                latest_run = await run_repo.get_latest_subagent_run_by_thread_for_user(
                    thread_id,
                    str(current_uid),
                )
                if latest_run:
                    try:
                        response["subagent_run"] = serialize_subagent_run_state(latest_run)
                    except ValueError as exc:
                        logger.error(f"子智能体运行记录格式异常: thread_id={thread_id}, run_id={latest_run.id}, {exc}")
                        raise HTTPException(status_code=500, detail="子智能体运行记录格式异常") from exc
        if include_messages:
            response["messages"] = _serialize_state_messages(values)
        return response

    # 子智能体线程在创建时必然同时写入子对话与线程关系（见 SubagentRunService.start），
    # 由上面的 conversation 分支统一处理；走到这里说明该 thread 没有对应对话，即线程不存在。
    raise HTTPException(status_code=404, detail="对话线程不存在")
