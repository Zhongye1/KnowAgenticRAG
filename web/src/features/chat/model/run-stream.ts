/**
 * Run 事件流的订阅生命周期。
 *
 * 索取事件流、按 `id:` 推进续传游标、断线前先用 `getRun` 做权威状态判定再决定重连或收尾，
 * 以及中断态的快照留存。状态存放在可变的线程运行时对象里，每次变更后通知订阅者。
 */
import {
  abortRunStream,
  getRunController,
  getThreadRuntime,
  notifyThreadRuntime,
  setRunController,
  type ThreadRuntimeState,
} from './thread-runtime-store';

import { agentRunApi, type AgentRun } from '../api/agent-api';
import {
  compareRunSeq,
  normalizeRunSeq,
  resolveRunResumeAfterSeq,
} from '../lib/run-seq';
import { processSseResponse } from '@/shared/lib/files';
import type { StreamSmoother } from '../lib/stream-smoother';
import { hasPendingInterruptPayload } from '../lib/tool-approval';

const RUN_INTERRUPTED_STATUS = 'interrupted';
const RUN_TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const ACTIVE_RUN_STORAGE_TTL_MS = 60 * 60 * 1000;
const ACTIVE_RUN_CLIENT_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

type ActiveRunSnapshot = {
  run_id: string;
  last_seq: string;
  created_at: number;
  client_id: string;
};

const storageKey = (threadId: string) => `active_run:${threadId}`;

/** 从事件信封、载荷或分片中依次找线程 id；子代理线程靠它归属。 */
function getThreadIdFromObject(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (typeof record.thread_id === 'string' && record.thread_id.trim()) {
    return record.thread_id.trim();
  }
  for (const key of ['meta', 'metadata', 'configurable', 'stream_event']) {
    const nested = getThreadIdFromObject(record[key]);
    if (nested) return nested;
  }
  return '';
}

function resolveChunkThreadId({
  envelope,
  payload,
  chunk,
  fallbackThreadId,
}: {
  envelope: unknown;
  payload: unknown;
  chunk: unknown;
  fallbackThreadId: string;
}): string {
  return (
    getThreadIdFromObject(envelope) ||
    getThreadIdFromObject(payload) ||
    getThreadIdFromObject(chunk) ||
    fallbackThreadId
  );
}

export type StreamChunk = Record<string, unknown> & { thread_id: string };

export type RunStreamOptions = {
  currentAgentId: () => string | undefined;
  handleStreamChunk: (chunk: StreamChunk, threadId: string) => void;
  fetchThreadMessages: (params: {
    agentId?: string;
    threadId: string;
    delay?: number;
  }) => Promise<unknown>;
  fetchAgentState: (agentId: string | undefined, threadId: string) => void;
  resetOnGoingConv: (
    threadId: string,
    options?: { preserveRequestStreams?: boolean },
  ) => void;
  streamSmoother?: StreamSmoother;
  onScrollToBottom?: () => void;
  onInterruptDetected?: (info: {
    threadId: string;
    runId: string;
    run?: AgentRun | null;
  }) => void;
  onTerminalDetected?: (info: {
    threadId: string;
    runId: string | null;
    touchedThreadIds: string[];
  }) => void;
  onRunStarted?: (info: { threadId: string; runId: string }) => void;
  onStreamError?: (error: unknown) => void;
};

/** 创建某次会话的 run 流控制器。 */
export function createRunStream(options: RunStreamOptions) {
  const {
    currentAgentId,
    handleStreamChunk,
    fetchThreadMessages,
    fetchAgentState,
    resetOnGoingConv,
    streamSmoother,
    onScrollToBottom,
    onInterruptDetected,
    onTerminalDetected,
    onRunStarted,
    onStreamError,
  } = options;

  const saveActiveRunSnapshot = (
    threadId: string,
    runId: string,
    lastSeq = '0-0',
  ) => {
    if (!threadId || !runId) return;
    const snapshot: ActiveRunSnapshot = {
      run_id: runId,
      last_seq: normalizeRunSeq(lastSeq),
      created_at: Date.now(),
      client_id: ACTIVE_RUN_CLIENT_ID,
    };
    localStorage.setItem(storageKey(threadId), JSON.stringify(snapshot));
  };

  const loadActiveRunSnapshot = (
    threadId: string,
  ): ActiveRunSnapshot | null => {
    if (!threadId) return null;
    try {
      const raw = localStorage.getItem(storageKey(threadId));
      return raw ? (JSON.parse(raw) as ActiveRunSnapshot) : null;
    } catch {
      return null;
    }
  };

  const clearActiveRunSnapshot = (threadId: string) => {
    if (!threadId) return;
    localStorage.removeItem(storageKey(threadId));
  };

  const stopRunStreamSubscription = (threadId: string) => {
    const runtime = getThreadRuntime(threadId);
    streamSmoother?.flushThread(threadId);
    if (getRunController(threadId)) {
      abortRunStream(threadId);
      runtime.isStreaming = false;
      notifyThreadRuntime(threadId);
    }
  };

  const hasPendingInterruptForRun = (
    runtime: ThreadRuntimeState | null,
    runId: string,
  ): boolean => {
    const pending = runtime?.pendingInterrupt as {
      interruptedRunId?: string;
    } | null;
    if (!hasPendingInterruptPayload(pending)) return false;
    return !pending?.interruptedRunId || pending.interruptedRunId === runId;
  };

  const hasPendingInterruptInThreads = (
    threadIds: Set<string>,
    runId: string,
  ) =>
    [...threadIds].some((id) =>
      hasPendingInterruptForRun(getThreadRuntime(id), runId),
    );

  const clearPendingInterruptForRun = (threadId: string, runId: string) => {
    const runtime = getThreadRuntime(threadId);
    if (hasPendingInterruptForRun(runtime, runId)) {
      runtime.pendingInterrupt = null;
    }
  };

  const resolveRunSteerable = async (run: AgentRun): Promise<boolean> => {
    if (
      !run?.request_id ||
      run.status !== 'running' ||
      run.run_type !== 'chat'
    ) {
      return false;
    }
    try {
      const { request } = await agentRunApi.getRequest(run.request_id);
      return request?.source === 'chat';
    } catch {
      return false;
    }
  };

  const finalizeRunStream = (
    threadId: string,
    runId: string,
    touchedThreadIds: Set<string>,
    {
      delay = 200,
      scroll = false,
      status = '',
    }: { delay?: number; scroll?: boolean; status?: string } = {},
  ) => {
    const runtime = getThreadRuntime(threadId);
    if (runtime.activeRunId !== runId) return;

    const isInterrupted =
      status === RUN_INTERRUPTED_STATUS &&
      hasPendingInterruptInThreads(touchedThreadIds, runId);
    touchedThreadIds.forEach((id) => streamSmoother?.flushThread(id));
    runtime.isStreaming = false;
    runtime.activeRunSteerable = false;

    if (isInterrupted) {
      runtime.activeRunId = runId;
      saveActiveRunSnapshot(threadId, runId, runtime.runLastSeq);
    } else {
      runtime.activeRunId = null;
      clearActiveRunSnapshot(threadId);
      touchedThreadIds.forEach((id) => clearPendingInterruptForRun(id, runId));
    }
    runtime.lastRetryableJobTry = null;
    runtime.replyLoadingVisible = false;
    runtime.pendingRequestId = null;
    notifyThreadRuntime(threadId);

    void fetchThreadMessages({
      agentId: currentAgentId(),
      threadId,
      delay,
    }).finally(() => {
      const latest = getThreadRuntime(threadId);
      if (!latest.activeRunId || latest.activeRunId === runId) {
        resetOnGoingConv(threadId, { preserveRequestStreams: true });
      }
      fetchAgentState(currentAgentId(), threadId);
      if (scroll) onScrollToBottom?.();
      if (isInterrupted) {
        onInterruptDetected?.({ threadId, runId });
      } else {
        onTerminalDetected?.({
          threadId,
          runId,
          touchedThreadIds: [...touchedThreadIds],
        });
      }
    });
  };

  const preserveInterruptedRun = async (
    threadId: string,
    run: AgentRun,
    snapshot: ActiveRunSnapshot | null = null,
  ): Promise<boolean> => {
    const runtime = getThreadRuntime(threadId);
    if (!run?.id) return false;

    streamSmoother?.flushThread(threadId);
    runtime.activeRunId = run.id;
    runtime.activeRunSteerable = false;
    runtime.runLastSeq = normalizeRunSeq(
      snapshot?.last_seq || runtime.runLastSeq || '0-0',
    );
    runtime.lastRetryableJobTry = null;
    runtime.isStreaming = false;
    runtime.replyLoadingVisible = false;
    runtime.pendingRequestId = null;
    notifyThreadRuntime(threadId);
    saveActiveRunSnapshot(threadId, run.id, runtime.runLastSeq);

    try {
      await fetchThreadMessages({ agentId: currentAgentId(), threadId });
    } catch (error) {
      console.warn(
        'Failed to refresh messages for interrupted run:',
        threadId,
        error,
      );
    }
    fetchAgentState(currentAgentId(), threadId);
    onInterruptDetected?.({ threadId, runId: run.id, run });
    return true;
  };

  const scheduleRunReconnect = (
    threadId: string,
    runId: string,
    delay = 500,
  ) => {
    const runtime = getThreadRuntime(threadId);
    if (runtime.activeRunId !== runId) return;
    setTimeout(() => {
      const latest = getThreadRuntime(threadId);
      if (latest.activeRunId === runId && !getRunController(threadId)) {
        void startRunStream(threadId, runId, latest.runLastSeq);
      }
    }, delay);
  };

  const startRunStream = async (
    threadId: string,
    runId: string,
    afterSeq = '0-0',
    streamOptions: { steerable?: boolean } = {},
  ): Promise<void> => {
    if (!threadId || !runId) return;
    const runtime = getThreadRuntime(threadId);

    const isSameRun = runtime.activeRunId === runId;
    const initialSteerable =
      streamOptions.steerable ??
      (isSameRun && runtime.activeRunSteerable === true);
    stopRunStreamSubscription(threadId);

    const controller = new AbortController();
    setRunController(threadId, controller);
    runtime.activeRunId = runId;
    runtime.activeRunSteerable = initialSteerable;
    runtime.runLastSeq = normalizeRunSeq(afterSeq);
    runtime.lastRetryableJobTry = null;
    runtime.isStreaming = true;
    notifyThreadRuntime(threadId);
    saveActiveRunSnapshot(threadId, runId, runtime.runLastSeq);
    onRunStarted?.({ threadId, runId });

    const touchedThreadIds = new Set<string>([threadId]);
    let sawTerminalEvent = false;

    try {
      const response = await agentRunApi.streamRunEvents(
        runId,
        runtime.runLastSeq,
        {
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new Error(`SSE response not ok: ${response.status}`);
      }

      await processSseResponse(response, (event, rawData, eventId) => {
        const data = rawData as Record<string, unknown>;
        if (!data || runtime.activeRunId !== runId) return;

        if (eventId) {
          const incomingSeq = normalizeRunSeq(eventId);
          if (compareRunSeq(incomingSeq, runtime.runLastSeq) <= 0) return;
          runtime.runLastSeq = incomingSeq;
          saveActiveRunSnapshot(threadId, runId, incomingSeq);
        }

        const payload = (data.payload ?? {}) as Record<string, unknown>;
        if (event === 'metadata') {
          runtime.activeRunSteerable =
            payload.run_type === 'chat' && payload.source === 'chat';
        }

        const terminalStatus =
          event === 'end'
            ? (payload.status as string)
            : (data.status as string);
        const isRetryableError =
          event === 'error' &&
          ((payload as { retryable?: boolean }).retryable === true ||
            (payload.chunk as { retryable?: boolean } | undefined)
              ?.retryable === true);
        if (isRetryableError) {
          const parsedJobTry = Number.parseInt(
            String(
              (payload.chunk as { job_try?: unknown } | undefined)?.job_try ??
                '',
            ),
            10,
          );
          const retryJobTry = Number.isNaN(parsedJobTry) ? null : parsedJobTry;
          if (
            retryJobTry !== null &&
            runtime.lastRetryableJobTry === retryJobTry
          ) {
            return;
          }
          runtime.lastRetryableJobTry = retryJobTry;
          console.warn(
            'Run encountered retryable error, waiting for worker retry',
            {
              threadId,
              runId,
              retryJobTry,
            },
          );
          return;
        }

        const routeChunk = (chunk: Record<string, unknown>) => {
          const routeThreadId = resolveChunkThreadId({
            envelope: data,
            payload,
            chunk,
            fallbackThreadId: threadId,
          });
          touchedThreadIds.add(routeThreadId);
          handleStreamChunk(
            {
              ...chunk,
              request_id: chunk.request_id ?? data.request_id,
              run_id: chunk.run_id ?? data.run_id ?? runId,
              thread_id: routeThreadId,
            } as StreamChunk,
            routeThreadId,
          );
        };

        if (Array.isArray(payload.items)) {
          payload.items.forEach((chunk) =>
            routeChunk(chunk as Record<string, unknown>),
          );
        } else if (payload.chunk) {
          routeChunk(payload.chunk as Record<string, unknown>);
        }

        if (event === 'end') {
          sawTerminalEvent = true;
          if (terminalStatus === RUN_INTERRUPTED_STATUS) {
            finalizeRunStream(threadId, runId, touchedThreadIds, {
              status: terminalStatus,
            });
          } else if (RUN_TERMINAL_STATUSES.has(terminalStatus)) {
            finalizeRunStream(threadId, runId, touchedThreadIds, {
              status: terminalStatus,
            });
          } else {
            touchedThreadIds.forEach((id) => streamSmoother?.flushThread(id));
            runtime.isStreaming = false;
            notifyThreadRuntime(threadId);
          }
        }

        if (event === 'error') {
          sawTerminalEvent = true;
          finalizeRunStream(threadId, runId, touchedThreadIds, {
            delay: 300,
            scroll: true,
          });
        }
      });

      if (
        !sawTerminalEvent &&
        !controller.signal.aborted &&
        runtime.activeRunId === runId
      ) {
        try {
          const run = (await agentRunApi.getRun(runId)).run;
          if (run?.status === RUN_INTERRUPTED_STATUS) {
            if (hasPendingInterruptInThreads(touchedThreadIds, run.id)) {
              await preserveInterruptedRun(threadId, run);
            } else {
              finalizeRunStream(threadId, runId, touchedThreadIds, {
                status: run.status,
              });
            }
          } else if (run && RUN_TERMINAL_STATUSES.has(run.status)) {
            finalizeRunStream(threadId, runId, touchedThreadIds, {
              status: run.status,
            });
          } else {
            scheduleRunReconnect(threadId, runId);
          }
        } catch (error) {
          console.warn(
            'Run SSE closed before terminal event; reconnecting after status check failed:',
            error,
          );
          scheduleRunReconnect(threadId, runId);
        }
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        streamSmoother?.flushThread(threadId);
        console.error('Run SSE stream error:', error);
        onStreamError?.(error);
        scheduleRunReconnect(threadId, runId);
      }
    } finally {
      if (getRunController(threadId) === controller) {
        setRunController(threadId, null);
      }
      if (!runtime.activeRunId) {
        runtime.isStreaming = false;
        runtime.replyLoadingVisible = false;
        runtime.pendingRequestId = null;
        notifyThreadRuntime(threadId);
      }
    }
  };

  const resumeActiveRunForThread = async (threadId: string): Promise<void> => {
    if (!threadId) return;
    const runtime = getThreadRuntime(threadId);

    if (getRunController(threadId)) {
      if (!runtime.activeRunId) return;
      try {
        const run = (await agentRunApi.getRun(runtime.activeRunId)).run;
        if (run?.status === RUN_INTERRUPTED_STATUS) {
          stopRunStreamSubscription(threadId);
          const snapshot = loadActiveRunSnapshot(threadId);
          if (hasPendingInterruptForRun(runtime, run.id)) {
            await preserveInterruptedRun(threadId, run, snapshot);
          } else {
            resetOnGoingConv(threadId);
            await startRunStream(threadId, run.id, '0-0');
          }
        } else if (run && RUN_TERMINAL_STATUSES.has(run.status)) {
          stopRunStreamSubscription(threadId);
          runtime.activeRunId = null;
          runtime.activeRunSteerable = false;
          runtime.isStreaming = false;
          runtime.replyLoadingVisible = false;
          runtime.pendingRequestId = null;
          clearPendingInterruptForRun(threadId, run.id);
          clearActiveRunSnapshot(threadId);
          notifyThreadRuntime(threadId);
          onTerminalDetected?.({
            threadId,
            runId: run.id,
            touchedThreadIds: [threadId],
          });
        }
      } catch (error) {
        console.warn(
          'Failed to refresh active run while stream is open:',
          threadId,
          error,
        );
      }
      return;
    }

    const snapshot = loadActiveRunSnapshot(threadId);
    if (snapshot?.run_id) {
      if (
        Date.now() - Number(snapshot.created_at || 0) >
        ACTIVE_RUN_STORAGE_TTL_MS
      ) {
        clearActiveRunSnapshot(threadId);
      } else {
        try {
          const run = (await agentRunApi.getRun(snapshot.run_id)).run;
          if (run?.status === RUN_INTERRUPTED_STATUS) {
            // 仅当本地仍持有该中断时才据快照恢复；否则交由 active_run 做权威判定，
            // 避免重放一个已被回复的旧中断。
            if (hasPendingInterruptForRun(runtime, run.id)) {
              await preserveInterruptedRun(threadId, run, snapshot);
              return;
            }
          } else if (run && !RUN_TERMINAL_STATUSES.has(run.status)) {
            const afterSeq = resolveRunResumeAfterSeq({
              snapshot,
              threadState: runtime,
            });
            if (afterSeq === '0-0') {
              resetOnGoingConv(threadId, { preserveRequestStreams: true });
            }
            await startRunStream(threadId, run.id, afterSeq, {
              steerable: await resolveRunSteerable(run),
            });
            return;
          }
        } catch {
          // 快照不可信时继续走 active_run 的权威判定
        }
        clearActiveRunSnapshot(threadId);
      }
    }

    try {
      const run = (await agentRunApi.getThreadActiveRun(threadId)).run;
      if (run?.status === RUN_INTERRUPTED_STATUS) {
        if (hasPendingInterruptForRun(runtime, run.id)) {
          await preserveInterruptedRun(threadId, run);
          return;
        }
        resetOnGoingConv(threadId, { preserveRequestStreams: true });
        await startRunStream(threadId, run.id, '0-0', {
          steerable: await resolveRunSteerable(run),
        });
        return;
      }
      if (run && !RUN_TERMINAL_STATUSES.has(run.status)) {
        resetOnGoingConv(threadId);
        await startRunStream(threadId, run.id, '0-0');
        return;
      }
    } catch (error) {
      console.warn('Failed to load active run for thread:', threadId, error);
    }

    runtime.activeRunId = null;
    runtime.activeRunSteerable = false;
    runtime.runLastSeq = '0-0';
    runtime.isStreaming = false;
    runtime.replyLoadingVisible = false;
    runtime.pendingRequestId = null;
    runtime.pendingInterrupt = null;
    clearActiveRunSnapshot(threadId);
    notifyThreadRuntime(threadId);
    onTerminalDetected?.({
      threadId,
      runId: null,
      touchedThreadIds: [threadId],
    });
  };

  return {
    startRunStream,
    resumeActiveRunForThread,
    stopRunStreamSubscription,
  };
}
