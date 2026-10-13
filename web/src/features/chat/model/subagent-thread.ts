/**
 * 子智能体线程视图的流式装载。
 *
 * 子线程是普通线程：历史走 `/history`，运行态走 run 事件流。流式分片直接写进
 * 全局运行时存储里该子线程自己的运行时（键就是子线程 id），与父线程天然隔离；
 * 组件卸载时释放整个运行时，不残留分片。
 */
import * as React from 'react';

import { agentRunApi } from '../api/agent-api';
import { createStreamHandler } from './stream-handler';
import {
  disposeThreadRuntime,
  getThreadRuntime,
  getThreadRuntimeOrNull,
} from './thread-runtime-store';
import { createRunStream } from './run-stream';
import { createStreamSmoother } from '../lib/stream-smoother';
import { useThreadRuntime } from './thread-runtime-store';
import { useStreamingMessages } from './streamed-messages';
import type { ChatMessage } from '../api/agent-api';

/** 运行状态的终态集合；与 run-stream 的口径一致，另含 interrupted。 */
const TERMINAL_RUN_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
  'interrupted',
]);

export type SubagentThreadController = {
  loading: boolean;
  error: string;
};

/**
 * 子线程消息装载：进入线程拉历史，运行中订阅 run 事件流，终态后重拉权威历史。
 *
 * 返回渲染用的历史与流式消息；调用方只负责传子线程 id 与 run id。
 */
export function useSubagentThreadMessages(input: {
  /** 子线程 id；为空时什么都不做。 */
  childThreadId: string | undefined;
  /** 子智能体 run id；非终态时订阅它的事件流。 */
  runId: string | undefined;
  runStatus: string | undefined;
  active: boolean;
}): { loading: boolean; error: string } {
  const { childThreadId, runId, runStatus, active } = input;
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  // 子线程自己的运行时与流控制器；父线程的流不受影响
  const runStreamRef = React.useRef<ReturnType<typeof createRunStream> | null>(
    null,
  );
  const generationRef = React.useRef(0);

  React.useEffect(() => {
    if (!childThreadId || !active) return;
    const generation = (generationRef.current += 1);
    const smoother = createStreamSmoother({
      getThreadState: (threadId) => getThreadRuntimeOrNull(threadId),
    });
    const handler = createStreamHandler({
      getThreadRuntime: (id) => getThreadRuntime(id),
      streamSmoother: smoother,
    });
    const runStream = createRunStream({
      currentAgentId: () => undefined,
      handleStreamChunk: (chunk, threadId) => {
        handler.handleStreamChunk(chunk, threadId);
      },
      fetchThreadMessages: async () => undefined,
      fetchAgentState: () => undefined,
      resetOnGoingConv: (threadId) => {
        const runtime = getThreadRuntime(threadId);
        runtime.onGoingConv.msgChunks = {};
      },
      streamSmoother: smoother,
    });
    runStreamRef.current = runStream;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { history } = await agentRunApi.getAgentHistory(childThreadId);
        if (generationRef.current !== generation) return;
        const runtime = getThreadRuntime(childThreadId);
        runtime.messages = history;
        runtime.historyLoaded = true;

        const streamingRun =
          runId && runStatus && !TERMINAL_RUN_STATUSES.has(runStatus)
            ? runId
            : null;
        if (streamingRun) {
          // 在飞的那条 run 的消息从流里来，历史里的同名 run 过滤掉，避免整段重播
          runtime.messages = runtime.messages.filter(
            (message) =>
              (message.extra_metadata?.run_id ?? message.run_id) !==
              streamingRun,
          );
          runStream.startRunStream(childThreadId, streamingRun, '0-0');
        }
      } catch {
        if (generationRef.current !== generation) return;
        setError('加载子智能体消息失败');
      } finally {
        if (generationRef.current === generation) setLoading(false);
      }
    };
    void load();

    return () => {
      generationRef.current += 1;
      runStream.stopRunStreamSubscription(childThreadId);
      smoother.flushThread(childThreadId);
      runStreamRef.current = null;
      // 子线程视图只属于这个分区；离开时整份释放，不残留分片与定时器
      disposeThreadRuntime(childThreadId);
    };
  }, [childThreadId, runId, runStatus, active]);

  return { loading, error };
}

/** 子线程的流式消息；键与主对话用的同一个全局存储。 */
export function useSubagentStreamingMessages(
  childThreadId: string | undefined,
): ReturnType<typeof useStreamingMessages> {
  'use no memo';
  return useStreamingMessages(childThreadId);
}

/** 子线程的权威历史；与主对话同一个存储键。 */
export function useSubagentHistory(
  childThreadId: string | undefined,
): ChatMessage[] {
  'use no memo';
  const runtime = useThreadRuntime(childThreadId);
  return runtime?.messages ?? [];
}
