/**
 * Run 事件分片到渲染分片的归并。
 *
 * 逐行对照上游 `useAgentStreamHandler.js` 的纯函数部分：把 `stream_event`
 * 语义化成 AI 消息分片、把工具结果转成 `type: 'tool'` 的消息，
 * 其余状态推进线程运行时。
 */
import type { StreamChunk } from '../lib/stream-smoother';
import { extractPendingInterrupt } from '../lib/pending-interrupt';
import { hasPendingInterruptPayload } from '../lib/tool-approval';
import { notifyThreadRuntime, type ThreadRuntimeState } from './thread-runtime-store';

/** 工具参数序列化：字符串原样，空值给空串，其余 JSON。 */
export function serializeToolArgs(args: unknown): string {
  if (typeof args === 'string') return args;
  if (args === undefined || args === null) return '';
  return JSON.stringify(args);
}

/** 把后端的 `stream_event` 语义化成可渲染的消息分片。 */
export function streamEventToMessageChunk(
  streamEvent: unknown,
): StreamChunk | null {
  if (!streamEvent || typeof streamEvent !== 'object') return null;
  const event = streamEvent as Record<string, unknown>;
  const messageId = event.message_id;
  if (!messageId) return null;

  if (event.type === 'message_delta') {
    const chunk: StreamChunk = {
      id: String(messageId),
      type: 'AIMessageChunk',
      content: (event.content as string) || '',
    };
    if (event.reasoning_content) {
      chunk.reasoning_content = event.reasoning_content as string;
    }
    if (event.additional_reasoning_content) {
      chunk.additional_kwargs = {
        reasoning_content: event.additional_reasoning_content as string,
      };
    }
    return chunk;
  }

  if (event.type === 'tool_call' || event.type === 'tool_call_delta') {
    return {
      id: String(messageId),
      type: 'AIMessageChunk',
      content: '',
      tool_call_chunks: [
        {
          index: (event.index as number) || 0,
          id: event.tool_call_id,
          name: event.name,
          args:
            event.type === 'tool_call_delta'
              ? (event.args_delta as string) || ''
              : serializeToolArgs(event.args),
        },
      ],
    };
  }

  return null;
}

/** `loading` 状态下的分片：优先取语义化结果，其次取 `msg`（事件型 msg 丢弃）。 */
export function loadingMessageChunk(chunk: Record<string, unknown>): StreamChunk | null {
  const semantic = streamEventToMessageChunk(chunk?.stream_event);
  if (semantic) return semantic;

  const msg = chunk?.msg as Record<string, unknown> | undefined;
  if (msg?.event) return null;
  return (msg as StreamChunk) ?? null;
}

/**
 * 工具结果不走 messages 流，而是以 `method=tools` 的 stream_event 返回。
 * 取出 `tool-finished` 的 output，交给上层按 `tool_call_id` 与 AI 消息关联。
 */
export function toolFinishedMessage(
  chunk: Record<string, unknown>,
): StreamChunk | null {
  const streamEvent = chunk?.event as Record<string, unknown> | undefined;
  if (!streamEvent || streamEvent.method !== 'tools') return null;

  const data = streamEvent.data as Record<string, unknown> | undefined;
  if (!data || data.event !== 'tool-finished') return null;

  const output = data.output as Record<string, unknown> | undefined;
  if (!output || typeof output !== 'object') return null;

  const id = output.id || output.tool_call_id || data.tool_call_id;
  if (!id) return null;
  return { ...output, type: 'tool', id: String(id) } as StreamChunk;
}

export type StreamNotice = {
  level: 'info' | 'warning' | 'error';
  message: string;
};

export type StreamHandlerOptions = {
  getThreadRuntime: (threadId: string) => ThreadRuntimeState | null;
  streamSmoother?: {
    pushChunk?: (chunk: StreamChunk | null | undefined, threadId: string) => void;
    flushThread: (threadId: string) => void;
  };
  onNotice?: (notice: StreamNotice) => void;
};

/**
 * 创建事件处理器。返回 `true` 表示这个分片终止了本次流式展示。
 *
 * 当前覆盖文本对话需要的最小集合：`init` / `loading` / `stream_event` /
 * `finished` / `interrupted` / `error` / `warning`。审批与提问交互、
 * 子代理线程的 UI 归并随对应分片补齐。
 */
export function createStreamHandler(options: StreamHandlerOptions) {
  const { getThreadRuntime, streamSmoother, onNotice } = options;

  const push = (chunk: StreamChunk | null, threadId: string) => {
    if (!chunk) return;
    streamSmoother?.pushChunk?.(chunk, threadId);
  };

  const handleStreamChunk = (
    chunk: Record<string, unknown>,
    threadId: string,
  ): boolean => {
    const runtime = getThreadRuntime(threadId);
    if (!runtime) return false;

    const status = chunk.status as string | undefined;
    const chunkMessage = chunk.message as string | undefined;

    switch (status) {
      case 'init': {
        const resolvedRequestId =
          (chunk.request_id as string) || runtime.pendingRequestId;
        if (resolvedRequestId) {
          runtime.pendingRequestId = resolvedRequestId;
        }
        const msg = chunk.msg as Record<string, unknown> | undefined;
        if (resolvedRequestId && msg && msg.type !== 'system') {
          push(
            {
              ...(msg as StreamChunk),
              id: (msg.id as string) || resolvedRequestId,
              type: 'human',
            },
            threadId,
          );
        }
        notifyThreadRuntime(threadId);
        return false;
      }

      case 'loading':
        push(loadingMessageChunk(chunk), threadId);
        push(toolFinishedMessage(chunk), threadId);
        return false;

      case 'stream_event':
        push(streamEventToMessageChunk(chunk.stream_event), threadId);
        return false;

      case 'error':
        streamSmoother?.flushThread(threadId);
        runtime.isStreaming = false;
        runtime.replyLoadingVisible = false;
        notifyThreadRuntime(threadId);
        onNotice?.({
          level: 'error',
          message: chunkMessage || '运行失败，请稍后重试。',
        });
        return true;

      case 'finished':
        streamSmoother?.flushThread(threadId);
        runtime.isStreaming = false;
        runtime.replyLoadingVisible = false;
        runtime.pendingRequestId = null;
        runtime.pendingInterrupt = null;
        runtime.contextCompressing = false;
        notifyThreadRuntime(threadId);
        return true;

      // 审批与提问是「等用户动作」的中断：载荷落到 pendingInterrupt，
      // 之后的提交走创建 run 的 `resume` 字段。
      case 'ask_user_question_required':
      case 'human_approval_required': {
        streamSmoother?.flushThread(threadId);
        runtime.isStreaming = false;
        runtime.replyLoadingVisible = false;
        runtime.pendingRequestId = null;
        const pending = extractPendingInterrupt(chunk, threadId);
        if (pending) runtime.pendingInterrupt = pending;
        notifyThreadRuntime(threadId);
        if (chunkMessage) onNotice?.({ level: 'info', message: chunkMessage });
        return true;
      }

      case 'interrupted': {
        streamSmoother?.flushThread(threadId);
        runtime.isStreaming = false;
        runtime.replyLoadingVisible = false;
        runtime.pendingRequestId = null;
        runtime.contextCompressing = false;
        const pendingInterrupt = (chunk.pending_interrupt ??
          chunk.interrupt) as unknown;
        if (hasPendingInterruptPayload(pendingInterrupt)) {
          runtime.pendingInterrupt = pendingInterrupt;
        }
        notifyThreadRuntime(threadId);
        if (chunkMessage) onNotice?.({ level: 'info', message: chunkMessage });
        return true;
      }

      case 'context_compression': {
        const compression = chunk.compression as { status?: string } | undefined;
        runtime.contextCompressing = compression?.status === 'started';
        notifyThreadRuntime(threadId);
        return false;
      }

      case 'warning':
        if (chunkMessage) onNotice?.({ level: 'warning', message: chunkMessage });
        return false;

      default:
        return false;
    }
  };

  return { handleStreamChunk };
}
