"""ARS adapter for DeepAgents conversation summarization middleware."""

from __future__ import annotations

import asyncio
import hashlib
import re
import warnings
from collections.abc import Awaitable, Callable, Iterable
from contextvars import ContextVar
from typing import Any

from deepagents.middleware.summarization import (
    Command,
    ContextOverflowError,
    SummarizationMiddleware,
    _aclip_overflow_tail,
    _clip_overflow_tail,
)
from langchain.agents.middleware.summarization import ContextSize
from langchain.agents.middleware.types import ExtendedModelResponse, ModelRequest, ModelResponse
from langchain.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AnyMessage, ToolMessage, get_buffer_string
from langchain_core.messages.utils import count_tokens_approximately
from langgraph.config import get_stream_writer
from langgraph.constants import TAG_NOSTREAM

from ars.utils.logging_config import logger

_APPROX_CHARS_PER_TOKEN = 4
_DEFAULT_SUMMARY_TOOL_RESULT_LIMIT_TOKENS = 300
_DEFAULT_L1_L2_TRIGGER_RATIO = 0.4
_DEFAULT_TOOL_ARG_MAX_LENGTH = 2000
_TRUNCATED_TOOL_ARG_TEXT = "...(argument truncated for context view)"
_TOOL_RESULT_SAVED_MARKER = "ars_tool_result_saved"
_SUMMARY_SANITIZED_MESSAGES: ContextVar[dict[tuple[int, ...], list[AnyMessage]] | None] = ContextVar(
    "ars_summary_sanitized_messages",
    default=None,
)
_SUMMARY_COMPRESSION_STATE: ContextVar[dict[str, bool] | None] = ContextVar(
    "ars_summary_compression_state",
    default=None,
)


def _emit_compression(status: str, **extra: Any) -> None:
    try:
        writer = get_stream_writer()
    except RuntimeError:
        return
    writer({"type": "ars.context_compression", "status": status, **extra})


def _emit_compression_started_once() -> None:
    state = _SUMMARY_COMPRESSION_STATE.get()
    if state is not None and state.get("started"):
        return
    if state is not None:
        state["started"] = True
    _emit_compression("started")


def _count_tokens_for_summary_trigger(messages: Iterable[Any], **kwargs: Any) -> int:
    kwargs.pop("use_usage_metadata_scaling", None)
    return count_tokens_approximately(messages, use_usage_metadata_scaling=False, **kwargs)


def _extract_text_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "\n".join(part for part in parts if part)
    return "" if content is None else str(content)


def _tool_result_path(tool_name: str | None, content: str, large_tool_results_prefix: str) -> str:
    safe_tool_name = re.sub(r"[^A-Za-z0-9_.-]+", "-", (tool_name or "").strip()).strip(".-") or "tool-result"
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]
    return f"{large_tool_results_prefix}/{safe_tool_name}-{digest}.txt"


def _preview_tool_result(content: str, token_limit: int | None) -> tuple[str, int]:
    text = content.strip()
    if token_limit is None:
        return text, 0
    if token_limit <= 0:
        return "", len(text)

    max_chars = token_limit * _APPROX_CHARS_PER_TOKEN
    if len(text) <= max_chars:
        return text, 0

    preview = text[:max_chars].rstrip()
    return preview, len(text) - len(preview)


def _write_tool_result(backend, path: str, content: str) -> str | None:
    if backend is None:
        return None

    result = backend.write(path, content)
    error = getattr(result, "error", None)
    if not error:
        return path
    if "already exists" in str(error).lower():
        return path
    raise RuntimeError(f"Failed to write tool result to {path}: {error}")


def _estimated_content_tokens(content: str) -> int:
    return max((len(content) + _APPROX_CHARS_PER_TOKEN - 1) // _APPROX_CHARS_PER_TOKEN, 1)


def _tool_result_replacement_content(
    message: ToolMessage,
    *,
    backend,
    tool_result_offload_token_limit: int | None,
    large_tool_results_prefix: str,
) -> str:
    content = _extract_text_content(message.content)
    approx_tokens = max((len(content) + _APPROX_CHARS_PER_TOKEN - 1) // _APPROX_CHARS_PER_TOKEN, 1)
    tool_name = message.name if isinstance(message.name, str) and message.name else None
    path = _write_tool_result(
        backend,
        _tool_result_path(tool_name, content, large_tool_results_prefix),
        content,
    )
    preview, omitted_chars = _preview_tool_result(content, tool_result_offload_token_limit)

    lines = [
        "[Tool result saved]",
        f"Tool: {tool_name or 'unknown'}",
        f"Approx tokens: {approx_tokens}",
    ]
    if path:
        lines.append(f"Full output path: {path}")
    if preview:
        lines.extend(["", "Output preview:", preview])
    if omitted_chars:
        lines.append(f"\n[Truncated {omitted_chars} chars. Read the full output from the saved file.]")
    return "\n".join(lines)


def _should_offload_tool_message(message: ToolMessage, trigger_tokens: int | None) -> bool:
    if trigger_tokens is None:
        return True
    if trigger_tokens <= 0:
        return True
    content = _extract_text_content(message.content)
    return _estimated_content_tokens(content) > trigger_tokens


def _replace_tool_message_content(
    message: ToolMessage,
    *,
    backend,
    tool_result_offload_token_limit: int | None,
    large_tool_results_prefix: str,
) -> ToolMessage:
    additional_kwargs = dict(getattr(message, "additional_kwargs", {}) or {})
    additional_kwargs[_TOOL_RESULT_SAVED_MARKER] = True
    return message.model_copy(
        update={
            "content": _tool_result_replacement_content(
                message,
                backend=backend,
                tool_result_offload_token_limit=tool_result_offload_token_limit,
                large_tool_results_prefix=large_tool_results_prefix,
            ),
            "additional_kwargs": additional_kwargs,
        }
    )


def _truncate_string_arg(value: str, max_length: int) -> str:
    if len(value) <= max_length:
        return value
    return f"{value[:20]}{_TRUNCATED_TOOL_ARG_TEXT}"


def _truncate_tool_call_args(tool_call: dict[str, Any], max_length: int) -> tuple[dict[str, Any], bool]:
    if tool_call.get("name") not in {"write_file", "edit_file"}:
        return tool_call, False
    args = tool_call.get("args")
    if not isinstance(args, dict):
        return tool_call, False

    truncated_args: dict[str, Any] = {}
    modified = False
    for key, value in args.items():
        if isinstance(value, str) and len(value) > max_length:
            truncated_args[key] = _truncate_string_arg(value, max_length)
            modified = True
        else:
            truncated_args[key] = value
    if not modified:
        return tool_call, False
    return {**tool_call, "args": truncated_args}, True


def _truncate_provider_tool_calls(additional_kwargs: dict[str, Any], max_length: int) -> tuple[dict[str, Any], bool]:
    raw_tool_calls = additional_kwargs.get("tool_calls")
    if not isinstance(raw_tool_calls, list):
        return additional_kwargs, False

    updated_tool_calls: list[Any] = []
    modified = False
    for raw_call in raw_tool_calls:
        if not isinstance(raw_call, dict):
            updated_tool_calls.append(raw_call)
            continue
        function = raw_call.get("function")
        if not isinstance(function, dict):
            updated_tool_calls.append(raw_call)
            continue
        if function.get("name") not in {"write_file", "edit_file"}:
            updated_tool_calls.append(raw_call)
            continue
        arguments = function.get("arguments")
        if not isinstance(arguments, str) or len(arguments) <= max_length:
            updated_tool_calls.append(raw_call)
            continue

        updated_function = {**function, "arguments": _truncate_string_arg(arguments, max_length)}
        updated_tool_calls.append({**raw_call, "function": updated_function})
        modified = True

    if not modified:
        return additional_kwargs, False
    return {**additional_kwargs, "tool_calls": updated_tool_calls}, True


def _truncate_ai_tool_call_args(message: AIMessage, *, max_length: int) -> AIMessage:
    if not message.tool_calls and not getattr(message, "additional_kwargs", None):
        return message

    updated_tool_calls: list[Any] = []
    tool_calls_modified = False
    for tool_call in message.tool_calls or []:
        if not isinstance(tool_call, dict):
            updated_tool_calls.append(tool_call)
            continue
        updated, modified = _truncate_tool_call_args(tool_call, max_length)
        updated_tool_calls.append(updated)
        tool_calls_modified = tool_calls_modified or modified

    additional_kwargs = dict(getattr(message, "additional_kwargs", {}) or {})
    additional_kwargs, additional_kwargs_modified = _truncate_provider_tool_calls(additional_kwargs, max_length)

    if not tool_calls_modified and not additional_kwargs_modified:
        return message

    updated_message = message.model_copy(update={"additional_kwargs": additional_kwargs})
    if tool_calls_modified:
        updated_message.tool_calls = updated_tool_calls
    return updated_message


def sanitize_messages_for_summary(
    messages: list[AnyMessage],
    *,
    large_tool_results_prefix: str,
    backend=None,
    tool_result_offload_token_limit: int | None = _DEFAULT_SUMMARY_TOOL_RESULT_LIMIT_TOKENS,
) -> list[AnyMessage]:
    """Build a compact summary/offload view by replacing only ToolMessage content."""
    sanitized: list[AnyMessage] = []
    for message in messages:
        if isinstance(message, ToolMessage):
            if getattr(message, "additional_kwargs", {}).get(_TOOL_RESULT_SAVED_MARKER) is True:
                sanitized.append(message)
                continue
            sanitized.append(
                _replace_tool_message_content(
                    message,
                    backend=backend,
                    tool_result_offload_token_limit=tool_result_offload_token_limit,
                    large_tool_results_prefix=large_tool_results_prefix,
                )
            )
            continue
        sanitized.append(message)
    return sanitized


class ArsSummarizationMiddleware(SummarizationMiddleware):
    """DeepAgents summarization middleware with Ars-specific tool-call sanitization."""

    def __init__(
        self,
        *args,
        tool_result_offload_token_limit: int | None = _DEFAULT_SUMMARY_TOOL_RESULT_LIMIT_TOKENS,
        l1_l2_trigger_ratio: float = _DEFAULT_L1_L2_TRIGGER_RATIO,
        tool_arg_max_length: int = _DEFAULT_TOOL_ARG_MAX_LENGTH,
        **kwargs,
    ) -> None:
        super().__init__(*args, **kwargs)
        self.tool_result_offload_token_limit = tool_result_offload_token_limit
        self.l1_l2_trigger_ratio = l1_l2_trigger_ratio
        self.tool_arg_max_length = tool_arg_max_length

    def _should_summarize(self, messages: list[AnyMessage], total_tokens: int) -> bool:
        if not self._lc_helper._trigger_clauses:
            return False

        for clause in self._lc_helper._trigger_clauses:
            clause_met = True
            for kind, value in clause.items():
                if kind == "messages":
                    if len(messages) < value:
                        clause_met = False
                        break
                elif kind == "tokens":
                    if total_tokens < value:
                        clause_met = False
                        break
                elif kind == "fraction":
                    max_input_tokens = self._get_profile_limits()
                    if max_input_tokens is None:
                        clause_met = False
                        break
                    threshold = int(max_input_tokens * value)
                    if threshold <= 0:
                        threshold = 1
                    if total_tokens < threshold:
                        clause_met = False
                        break
            if clause_met:
                return True
        return False

    def _sanitize_messages_for_summary(
        self,
        messages: list[AnyMessage],
        *,
        backend,
    ) -> list[AnyMessage]:
        _ = backend
        cache = _SUMMARY_SANITIZED_MESSAGES.get()
        cache_key = tuple(id(message) for message in messages)
        if cache is not None and cache_key in cache:
            return cache[cache_key]

        sanitized = messages
        if cache is not None:
            cache[cache_key] = sanitized
        return sanitized

    def _sanitize_messages_for_l1(
        self,
        messages: list[AnyMessage],
        *,
        backend,
    ) -> list[AnyMessage]:
        compacted: list[AnyMessage] = []
        modified = False
        for message in messages:
            if isinstance(message, AIMessage):
                updated = _truncate_ai_tool_call_args(message, max_length=self.tool_arg_max_length)
                compacted.append(updated)
                modified = modified or updated is not message
                continue
            if isinstance(message, ToolMessage) and _should_offload_tool_message(
                message,
                self.tool_result_offload_token_limit,
            ):
                updated = _replace_tool_message_content(
                    message,
                    backend=backend,
                    tool_result_offload_token_limit=self.tool_result_offload_token_limit,
                    large_tool_results_prefix=self._large_tool_results_prefix,
                )
                compacted.append(updated)
                modified = modified or updated is not message
                continue
            compacted.append(message)
        return compacted if modified else messages

    def _entry_trigger_tokens(self) -> int | None:
        token_thresholds: list[int] = []
        for clause in getattr(self._lc_helper, "_trigger_clauses", []) or []:
            value = clause.get("tokens")
            if isinstance(value, int) and value > 0:
                token_thresholds.append(value)
            fraction = clause.get("fraction")
            if isinstance(fraction, int | float):
                max_input_tokens = self._get_profile_limits()
                if max_input_tokens is not None:
                    threshold = int(max_input_tokens * fraction)
                    token_thresholds.append(max(threshold, 1))
        return min(token_thresholds) if token_thresholds else None

    def _should_run_l1(self, messages: list[AnyMessage], total_tokens: int) -> bool:
        return self._should_summarize(messages, total_tokens)

    def _should_run_l2(self, compacted_total_tokens: int, entry_threshold_tokens: int | None) -> bool:
        if entry_threshold_tokens is None:
            return True
        threshold = max(int(entry_threshold_tokens * self.l1_l2_trigger_ratio), 1)
        return compacted_total_tokens > threshold

    @staticmethod
    def _summarization_event_from_result(result: Any) -> dict | None:
        if not isinstance(result, ExtendedModelResponse):
            return None
        command = getattr(result, "command", None)
        update = getattr(command, "update", None) if command is not None else None
        if not isinstance(update, dict):
            return None
        event = update.get("_summarization_event")
        return event if isinstance(event, dict) else None

    def _emit_completed(self, result: Any) -> None:
        event = self._summarization_event_from_result(result)
        if event is not None:
            _emit_compression(
                "completed",
                cutoff_index=event.get("cutoff_index"),
                file_path=event.get("file_path"),
            )

    # 重写 _create_summary/_acreate_summary 以在摘要 LLM 调用上挂 TAG_NOSTREAM：父类
    # 的 model.invoke 带 lc_source 元数据但无 nostream 标记，其 token 流会被 LangGraph
    # messages stream 捕获并广播到前端，形成 phantom 摘要消息。带 TAG_NOSTREAM 后流式
    # 层在源头跳过该调用，无需 chat_service 下游过滤，主 messages 流天然只含用户可见回复。
    # 父类硬编码 invoke config 且无 tags 钩子（self.model 为中间件实例共享属性，并发下不能
    # 临时换绑 bind(tags=...)），故只能重写；trim/format 是纯同步逻辑，抽到 _build_summary_prompt
    # 供 sync/async 两条路径共用，避免逐字重复。
    _SUMMARY_INVOKE_CONFIG = {"metadata": {"lc_source": "summarization"}, "tags": [TAG_NOSTREAM]}

    def _build_summary_prompt(self, sanitized: list[AnyMessage]) -> str | None:
        trimmed = self._lc_helper._trim_messages_for_summary(sanitized)
        if not trimmed:
            return None
        return self._lc_helper.summary_prompt.format(messages=get_buffer_string(trimmed, format="xml")).rstrip()

    def _create_summary(self, messages_to_summarize: list[AnyMessage]) -> str:
        sanitized = self._sanitize_messages_for_summary(
            messages_to_summarize,
            backend=self._backend,
        )
        if not sanitized:
            return "No previous conversation history."
        prompt = self._build_summary_prompt(sanitized)
        if prompt is None:
            return "Previous conversation was too long to summarize."
        try:
            return self.model.invoke(prompt, config=self._SUMMARY_INVOKE_CONFIG).text.strip()
        except Exception as e:
            return f"Error generating summary: {e!s}"

    async def _acreate_summary(self, messages_to_summarize: list[AnyMessage]) -> str:
        sanitized = self._sanitize_messages_for_summary(
            messages_to_summarize,
            backend=self._backend,
        )
        if not sanitized:
            return "No previous conversation history."
        prompt = self._build_summary_prompt(sanitized)
        if prompt is None:
            return "Previous conversation was too long to summarize."
        try:
            response = await self.model.ainvoke(prompt, config=self._SUMMARY_INVOKE_CONFIG)
            return response.text.strip()
        except Exception as e:
            return f"Error generating summary: {e!s}"

    def _offload_to_backend(self, backend, messages: list[AnyMessage], session_id: str) -> str | None:
        _emit_compression_started_once()
        return super()._offload_to_backend(
            backend,
            self._sanitize_messages_for_summary(
                messages,
                backend=backend,
            ),
            session_id,
        )

    async def _aoffload_to_backend(self, backend, messages: list[AnyMessage], session_id: str) -> str | None:
        _emit_compression_started_once()
        return await super()._aoffload_to_backend(
            backend,
            self._sanitize_messages_for_summary(
                messages,
                backend=backend,
            ),
            session_id,
        )

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        sanitized_token = _SUMMARY_SANITIZED_MESSAGES.set({})
        compression_state: dict[str, bool] = {"started": False}
        compression_token = _SUMMARY_COMPRESSION_STATE.set(compression_state)
        try:
            try:
                result = self._wrap_model_call_with_l1(request, handler)
            except Exception as exc:
                if compression_state.get("started"):
                    _emit_compression("failed", error=repr(exc))
                raise
            self._emit_completed(result)
            return result
        finally:
            _SUMMARY_COMPRESSION_STATE.reset(compression_token)
            _SUMMARY_SANITIZED_MESSAGES.reset(sanitized_token)

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        sanitized_token = _SUMMARY_SANITIZED_MESSAGES.set({})
        compression_state: dict[str, bool] = {"started": False}
        compression_token = _SUMMARY_COMPRESSION_STATE.set(compression_state)
        try:
            try:
                result = await self._awrap_model_call_with_l1(request, handler)
            except Exception as exc:
                if compression_state.get("started"):
                    _emit_compression("failed", error=repr(exc))
                raise
            self._emit_completed(result)
            return result
        finally:
            _SUMMARY_COMPRESSION_STATE.reset(compression_token)
            _SUMMARY_SANITIZED_MESSAGES.reset(sanitized_token)

    def _wrap_model_call_with_l1(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse | ExtendedModelResponse:
        effective_messages = self._get_effective_messages(request)
        total_tokens = self._count_tokens(effective_messages, request.system_message, request.tools)
        truncated_messages, _ = self._truncate_args(effective_messages, total_tokens)
        should_run_l1 = self._should_run_l1(truncated_messages, total_tokens)

        overflow_triggered = False
        if not should_run_l1:
            try:
                return handler(request.override(messages=truncated_messages))
            except ContextOverflowError:
                overflow_triggered = True

        backend = self._backend
        l1_messages = self._sanitize_messages_for_l1(truncated_messages, backend=backend)
        if should_run_l1:
            _emit_compression_started_once()

        l1_total_tokens = self._count_tokens(l1_messages, request.system_message, request.tools)
        should_run_l2 = overflow_triggered or self._should_run_l2(l1_total_tokens, self._entry_trigger_tokens())

        if not should_run_l2:
            try:
                response = handler(request.override(messages=l1_messages))
            except ContextOverflowError:
                overflow_triggered = True
            else:
                if should_run_l1:
                    _emit_compression("completed")
                return response

        cutoff_index = self._determine_cutoff_index(l1_messages)
        if cutoff_index <= 0:
            response = handler(request.override(messages=l1_messages))
            if should_run_l1:
                _emit_compression("completed")
            return response

        messages_to_summarize, preserved_messages = self._partition_messages(l1_messages, cutoff_index)
        new_state_tail: list[AnyMessage] = []
        if overflow_triggered:
            preserved_messages, new_state_tail = _clip_overflow_tail(
                preserved_messages,
                backend,
                keep=self._lc_helper.keep,
                max_input_tokens=self._get_profile_limits(),
                token_counter=self.token_counter,
                large_tool_results_prefix=self._large_tool_results_prefix,
            )

        # 采纳 0.7 inline media offload：内联 data: 媒体先落盘为路径引用，
        # offload 与 summary 两路都收到不含原始媒体字节的视图。
        offloaded_media_messages, failed_media = self._offload_inline_media(backend, messages_to_summarize)
        session_id = self._get_session_id(request.state)

        file_path = self._offload_to_backend(backend, offloaded_media_messages, session_id)
        if file_path is None:
            msg = (
                "Offloading conversation history to backend failed during summarization. "
                "Older messages will not be recoverable."
            )
            logger.error(msg)
            warnings.warn(msg, stacklevel=2)
        elif failed_media:
            logger.warning(
                "Conversation history offloaded to %s, but %d media block(s) could not be offloaded.",
                file_path,
                failed_media,
            )

        summary = self._create_summary(offloaded_media_messages)
        new_messages = self._build_new_messages_with_path(summary, file_path)
        previous_event = request.state.get("_summarization_event")
        state_cutoff_index = self._compute_state_cutoff(previous_event, cutoff_index)
        new_event = {
            "cutoff_index": state_cutoff_index,
            "summary_message": new_messages[0],
            "file_path": file_path,
        }

        response = handler(request.override(messages=[*new_messages, *preserved_messages]))
        update: dict[str, Any] = {
            "_summarization_event": new_event,
            "_summarization_session_id": session_id,
        }
        if new_state_tail:
            update["messages"] = list(new_state_tail)
        return ExtendedModelResponse(model_response=response, command=Command(update=update))

    async def _awrap_model_call_with_l1(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse | ExtendedModelResponse:
        effective_messages = self._get_effective_messages(request)
        total_tokens = self._count_tokens(effective_messages, request.system_message, request.tools)
        truncated_messages, _ = self._truncate_args(effective_messages, total_tokens)
        should_run_l1 = self._should_run_l1(truncated_messages, total_tokens)

        overflow_triggered = False
        if not should_run_l1:
            try:
                return await handler(request.override(messages=truncated_messages))
            except ContextOverflowError:
                overflow_triggered = True

        backend = self._backend
        l1_messages = self._sanitize_messages_for_l1(truncated_messages, backend=backend)
        if should_run_l1:
            _emit_compression_started_once()

        l1_total_tokens = self._count_tokens(l1_messages, request.system_message, request.tools)
        should_run_l2 = overflow_triggered or self._should_run_l2(l1_total_tokens, self._entry_trigger_tokens())

        if not should_run_l2:
            try:
                response = await handler(request.override(messages=l1_messages))
            except ContextOverflowError:
                overflow_triggered = True
            else:
                if should_run_l1:
                    _emit_compression("completed")
                return response

        cutoff_index = self._determine_cutoff_index(l1_messages)
        if cutoff_index <= 0:
            response = await handler(request.override(messages=l1_messages))
            if should_run_l1:
                _emit_compression("completed")
            return response

        messages_to_summarize, preserved_messages = self._partition_messages(l1_messages, cutoff_index)
        new_state_tail: list[AnyMessage] = []
        if overflow_triggered:
            preserved_messages, new_state_tail = await _aclip_overflow_tail(
                preserved_messages,
                backend,
                keep=self._lc_helper.keep,
                max_input_tokens=self._get_profile_limits(),
                token_counter=self.token_counter,
                large_tool_results_prefix=self._large_tool_results_prefix,
            )

        # Offload 与 summary 互相独立，并发执行以避免串行等待一次文件 I/O + 一次
        # LLM 调用；_SUMMARY_SANITIZED_MESSAGES 的 id 缓存保证两路 sanitize 不会重复
        # 写入工具结果文件，offload 失败返回 None 时 summary 仍可独立完成。
        offloaded_media_messages, failed_media = await self._aoffload_inline_media(backend, messages_to_summarize)
        session_id = self._get_session_id(request.state)
        file_path, summary = await asyncio.gather(
            self._aoffload_to_backend(backend, offloaded_media_messages, session_id),
            self._acreate_summary(offloaded_media_messages),
        )
        if file_path is None:
            msg = (
                "Offloading conversation history to backend failed during summarization. "
                "Older messages will not be recoverable."
            )
            logger.error(msg)
            warnings.warn(msg, stacklevel=2)
        elif failed_media:
            logger.warning(
                "Conversation history offloaded to %s, but %d media block(s) could not be offloaded.",
                file_path,
                failed_media,
            )

        new_messages = self._build_new_messages_with_path(summary, file_path)
        previous_event = request.state.get("_summarization_event")
        state_cutoff_index = self._compute_state_cutoff(previous_event, cutoff_index)
        new_event = {
            "cutoff_index": state_cutoff_index,
            "summary_message": new_messages[0],
            "file_path": file_path,
        }

        response = await handler(request.override(messages=[*new_messages, *preserved_messages]))
        update: dict[str, Any] = {
            "_summarization_event": new_event,
            "_summarization_session_id": session_id,
        }
        if new_state_tail:
            update["messages"] = list(new_state_tail)
        return ExtendedModelResponse(model_response=response, command=Command(update=update))


def create_summary_middleware(
    model: str | BaseChatModel,
    *,
    backend,
    trigger: ContextSize | list[ContextSize] | None,
    keep: ContextSize | list[ContextSize] | None,
    summary_prompt: str | None = None,
    trim_tokens_to_summarize: int | None = None,
    tool_result_offload_token_limit: int | None = _DEFAULT_SUMMARY_TOOL_RESULT_LIMIT_TOKENS,
    l1_l2_trigger_ratio: float = _DEFAULT_L1_L2_TRIGGER_RATIO,
) -> SummarizationMiddleware:
    """Create DeepAgents summarization middleware bound to a per-run backend instance.

    DeepAgents 0.7 要求 backend 是已初始化实例；history/large_tool_results 前缀由
    CompositeBackend.artifacts_root 派生，不再手写私有前缀。
    """
    middleware_kwargs = {
        "model": model,
        "backend": backend,
        "trigger": trigger,
        "keep": keep,
        "token_counter": _count_tokens_for_summary_trigger,
        "trim_tokens_to_summarize": trim_tokens_to_summarize,
        "tool_result_offload_token_limit": tool_result_offload_token_limit,
        "l1_l2_trigger_ratio": l1_l2_trigger_ratio,
    }
    if summary_prompt and summary_prompt.strip():
        middleware_kwargs["summary_prompt"] = summary_prompt
    return ArsSummarizationMiddleware(**middleware_kwargs)
