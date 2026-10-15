/**
 * 线程运行时状态。
 *
 * 状态放在模块级 Map 里：高频流式增量每秒会来很多次，放进 React state 会按帧重渲
 * 整棵消息树。组件用 `useThreadRuntime` 订阅版本号，读到的仍是可变对象本身。
 *
 * AbortController 与「正在收流的线程」不进入订阅面，避免仅因控制句柄变化触发渲染。
 *
 * `useThreadRuntime` 上的 `'use no memo'` 是必需的：React Compiler 会把「读这两个可变
 * Map」的表达式按参数缓存住，重新渲染时仍返回上一次的值，界面就再也看不到流式更新。
 */
import * as React from 'react';

import type { ChatMessage, ThreadRequest } from '../api/agent-api';
import type { StreamChunk } from '../lib/stream-smoother';

export type OnGoingConvState = {
  msgChunks: Record<string, StreamChunk[] | undefined>;
  currentRequestKey: string | null;
  currentAssistantKey: string | null;
  toolCallBuffers: Record<string, unknown>;
};

export type QueueSnapshot = {
  status: string;
  paused_reason: string | null;
  blocking_run_id: string | null;
  can_continue: boolean;
};

export type ThreadRuntimeState = {
  isStreaming: boolean;
  activeRunId: string | null;
  activeRunSteerable: boolean;
  runLastSeq: string;
  lastRetryableJobTry: number | null;
  replyLoadingVisible: boolean;
  pendingRequestId: string | null;
  pendingInterrupt: unknown;
  contextCompressing: boolean;
  onGoingConv: OnGoingConvState;
  agentState: unknown;
  /** 线程消息历史（权威来源），与流式分片分开保存。 */
  messages: ChatMessage[];
  /** 历史是否已加载过，避免重复请求与首屏闪烁。 */
  historyLoaded: boolean;
  queuedRequests: ThreadRequest[];
  queueSnapshot: QueueSnapshot;
  continueQueueInFlight: boolean;
  requestStreams: Record<string, { controller?: AbortController }>;
};

export const IDLE_QUEUE_SNAPSHOT: QueueSnapshot = Object.freeze({
  status: 'idle',
  paused_reason: null,
  blocking_run_id: null,
  can_continue: false,
});

const createOnGoingConvState = (): OnGoingConvState => ({
  msgChunks: {},
  currentRequestKey: null,
  currentAssistantKey: null,
  toolCallBuffers: {},
});

const runtimes = new Map<string, ThreadRuntimeState>();
const runControllers = new Map<string, AbortController>();
const versions = new Map<string, number>();
const listeners = new Set<() => void>();

/** 取线程运行时；不存在时创建，调用方拿到的是可变对象。 */
export function getThreadRuntime(threadId: string): ThreadRuntimeState {
  let runtime = runtimes.get(threadId);
  if (!runtime) {
    runtime = {
      isStreaming: false,
      activeRunId: null,
      activeRunSteerable: false,
      runLastSeq: '0-0',
      lastRetryableJobTry: null,
      replyLoadingVisible: false,
      pendingRequestId: null,
      pendingInterrupt: null,
      contextCompressing: false,
      onGoingConv: createOnGoingConvState(),
      agentState: null,
      messages: [],
      historyLoaded: false,
      queuedRequests: [],
      queueSnapshot: { ...IDLE_QUEUE_SNAPSHOT },
      continueQueueInFlight: false,
      requestStreams: {},
    };
    runtimes.set(threadId, runtime);
  }
  return runtime;
}

/** 取线程运行时；不存在时返回 null，不创建。清理与只读路径用它，避免把已删线程复活。 */
export function getThreadRuntimeOrNull(
  threadId: string,
): ThreadRuntimeState | null {
  return runtimes.get(threadId) ?? null;
}

/** 线程运行时是否还在。 */
export function hasThreadRuntime(threadId: string): boolean {
  return runtimes.has(threadId);
}

/** 写入线程消息历史（权威来源覆盖本地缓存）。 */
export function setThreadMessages(
  threadId: string,
  messages: ChatMessage[],
): void {
  const runtime = getThreadRuntime(threadId);
  runtime.messages = messages;
  runtime.historyLoaded = true;
  notifyThreadRuntime(threadId);
}

/** 通知订阅者：某个线程或全局状态发生变化。 */
export function notifyThreadRuntime(threadId?: string): void {
  if (threadId) versions.set(threadId, (versions.get(threadId) ?? 0) + 1);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 订阅某个线程的版本号；返回值为可变状态对象，未创建时返回 null。 */
export function useThreadRuntime(
  threadId: string | undefined,
): ThreadRuntimeState | null {
  // React Compiler 会把「读可变 Map」的表达式按 threadId 缓存住，导致重新渲染时
  // 仍然返回上一次的值；这里显式退出编译优化，订阅语义由下面的版本号负责。
  'use no memo';
  React.useSyncExternalStore(
    subscribe,
    () => (threadId ? (versions.get(threadId) ?? 0) : 0),
    () => 0,
  );
  return threadId ? (runtimes.get(threadId) ?? null) : null;
}

export function getRunController(
  threadId: string,
): AbortController | undefined {
  return runControllers.get(threadId);
}

export function setRunController(
  threadId: string,
  controller: AbortController | null,
): void {
  if (controller) {
    runControllers.set(threadId, controller);
    return;
  }
  runControllers.delete(threadId);
}

/** 中止某线程的 run 流；不影响其它线程。 */
export function abortRunStream(threadId: string): void {
  const controller = runControllers.get(threadId);
  if (!controller) return;
  controller.abort();
  runControllers.delete(threadId);
}

/** 清空线程的进行中会话状态（切线程、重发、终态后调用）。 */
export function resetOnGoingConv(
  threadId: string,
  {
    preserveRunStream = false,
    preserveRequestStreams = false,
  }: { preserveRunStream?: boolean; preserveRequestStreams?: boolean } = {},
): void {
  const runtime = runtimes.get(threadId);
  if (!runtime) return;
  if (!preserveRunStream) abortRunStream(threadId);
  if (!preserveRequestStreams) {
    for (const entry of Object.values(runtime.requestStreams)) {
      entry.controller?.abort();
    }
    runtime.requestStreams = {};
  }
  runtime.onGoingConv = createOnGoingConvState();
  runtime.replyLoadingVisible = false;
  runtime.pendingRequestId = null;
  notifyThreadRuntime(threadId);
}

/** 删除线程运行时并中止其所有流。 */
export function disposeThreadRuntime(threadId: string): void {
  abortRunStream(threadId);
  const runtime = runtimes.get(threadId);
  if (runtime) {
    for (const entry of Object.values(runtime.requestStreams)) {
      entry.controller?.abort();
    }
  }
  runtimes.delete(threadId);
  versions.delete(threadId);
  notifyThreadRuntime();
}
