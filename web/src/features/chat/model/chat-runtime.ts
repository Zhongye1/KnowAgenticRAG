/**
 * 聊天运行时：把线程状态、流式平滑、事件分片与 run 流订阅装配成一套可用的接口。
 *
 * 页面只依赖这里的 `sendMessage` / `cancelRun` / `resume`，不直接接触 SSE 细节。
 */
import * as React from 'react';

import { processSseResponse } from '@/shared/lib/files';
import { createStreamSmoother } from '../lib/stream-smoother';
import {
  isRunInterruptedConflict,
  type ToolApprovalMode,
} from '../lib/tool-approval';
import {
  agentRunApi,
  chatThreadApi,
  type ChatThread,
  type CreateRunResult,
} from '../api/agent-api';
import { invalidateAgentStateReads } from './agent-state';
import { createRunStream } from './run-stream';
import { createStreamHandler, type StreamNotice } from './stream-handler';
import {
  IDLE_QUEUE_SNAPSHOT,
  abortRunStream,
  getThreadRuntime,
  getThreadRuntimeOrNull,
  hasThreadRuntime,
  notifyThreadRuntime,
  resetOnGoingConv,
  setRunController,
  setThreadMessages,
  type ThreadRuntimeState,
} from './thread-runtime-store';

/**
 * 事件流自己结束（没有终态帧）时，存活超过这个时长的才重新订阅。
 * 短命流（后端立刻断开）只做一次同步，否则「静默结束 → 重订阅」会变成热循环。
 */
const SILENT_STREAM_RESUBSCRIBE_MS = 60_000;

/** 排队请求的终态：后端不再派发，界面据此收尾并提示。 */
const REQUEST_TERMINAL_NOTICES: Record<string, string> = {
  cancelled: '排队请求已取消。',
  rejected: '排队请求被拒绝。',
  failed: '排队请求执行失败。',
  error: '排队请求的事件流报告了错误。',
};

/** 客户端生成的请求 id，用于 resume 请求的幂等重放。 */
function createClientRequestId(): string {
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 一条消息进队列的方式。
 *
 * `enqueue` 排在队尾；`steer` 作为引导，等当前步骤结束后优先执行。两者都是后端
 * `queue_policy` 的取值，这里收窄成联合类型，避免页面传出后端不认的字符串。
 */
export type SendQueuePolicy = 'enqueue' | 'steer';

export type ChatRuntimeOptions = {
  currentAgentId: () => string | undefined;
  /** AgentState 的拉取由页面注入；消息历史属于本切片的职责，运行时自己取。 */
  fetchAgentState: (agentId: string | undefined, threadId: string) => void;
  onNotice?: (notice: StreamNotice) => void;
  onScrollToBottom?: () => void;
  /** 一次 run 走到终态或中断时回调；页面据此标记已读。 */
  onRunSettled?: (threadId: string) => void;
};

export type ChatRuntime = {
  /** 进入线程时加载权威消息历史；已加载过则跳过。 */
  loadHistory: (
    threadId: string,
    options?: { force?: boolean },
  ) => Promise<void>;
  /**
   * 页面还没有线程时创建一条，返回后端落库的线程（含 id 与标题）。
   *
   * 同一时刻只允许一次创建：并发调用复用同一个 `request_id`，
   * 后端据此幂等，不会留下多条空线程。
   */
  createThread: (
    agentSlug: string,
    title?: string,
    toolApprovalMode?: ToolApprovalMode | null,
    /** 项目 id；空串表示不使用项目，由后端在发送时创建独立目录。 */
    projectId?: string,
  ) => Promise<ChatThread>;
  /** 同步线程队列（排队请求与队列状态）。 */
  refreshQueue: (threadId: string, agentSlug: string) => Promise<void>;
  /** 把一条排队请求提升为下一条执行。 */
  steer: (params: {
    threadId: string;
    agentSlug: string;
    requestId: string;
  }) => Promise<void>;
  /** 取消一条排队请求；已在运行的请求由后端拒绝，改为取消 run。 */
  cancelQueued: (params: {
    threadId: string;
    agentSlug: string;
    requestId: string;
  }) => Promise<void>;
  /** 手动继续被暂停的队列。 */
  continueQueue: (threadId: string, agentSlug: string) => Promise<void>;
  /** 停止某个线程的全部排队请求订阅（切线程、清理时用）。 */
  stopRequestStreams: (threadId: string) => void;
  /** 提交审批决策或提问回答，以 `resume` 恢复被中断的 run。 */
  submitInterrupt: (params: {
    threadId: string;
    agentSlug: string;
    resume: unknown;
    /** 被中断的 run id；后端据此把恢复请求接到同一条运行链上。 */
    interruptedRunId?: string | null;
  }) => Promise<void>;
  sendMessage: (params: {
    threadId: string;
    agentSlug: string;
    query: string;
    /** 随消息一起发送的图片（裸 base64）；单槽。 */
    imageContent?: string | null;
    /** 本次生效的工具审批模式，随请求下发。 */
    toolApprovalMode?: ToolApprovalMode | null;
    /**
     * 这条消息怎么进队列：`enqueue` 排在队尾，`steer` 作为引导在当前步骤结束后优先执行。
     * 不传时按 `enqueue`。
     */
    queuePolicy?: SendQueuePolicy;
    /**
     * 这条消息使用的模型 spec（`provider:model`）。不传时由后端按会话绑定与智能体配置解析。
     */
    modelSpec?: string | null;
    /**
     * 本次要挂到请求上的会话附件 id。
     *
     * 附件是单次使用的：后端在创建请求的同一事务里把它们绑上去并记下 `request_id`，因此只该带
     * 还没被用掉的那些。
     */
    attachmentFileIds?: string[];
    /** 请求已被后端受理时回调；附件列表要在这时刷新，否则下一次发送会重发已用掉的 id。 */
    onAccepted?: () => void;
    meta?: Record<string, unknown>;
  }) => Promise<void>;
  cancelRun: (threadId: string) => Promise<void>;
  resume: (threadId: string) => Promise<void>;
  stopStream: (threadId: string) => void;
  runtimeFor: (threadId: string) => ThreadRuntimeState;
};

/** 装配一次聊天运行时。页面用 `useChatRuntime` 拿到实例。 */
export function createChatRuntime(options: ChatRuntimeOptions): ChatRuntime {
  const smoother = createStreamSmoother({
    // 只读读取：线程被删（运行时已清）时不再为它排帧，也不会把它复活
    getThreadState: (threadId) => getThreadRuntimeOrNull(threadId),
  });

  const handler = createStreamHandler({
    getThreadRuntime,
    streamSmoother: smoother,
    onNotice: options.onNotice,
  });

  /** 拉取线程历史并写入运行时；`delay` 用于等后端事务提交后再对齐。 */
  const fetchThreadMessages = async ({
    threadId,
    delay = 0,
  }: {
    agentId?: string;
    threadId: string;
    delay?: number;
  }) => {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const { history } = await agentRunApi.getAgentHistory(threadId);
    setThreadMessages(threadId, history);
  };

  /** 队列读取的发起序号；用于丢弃被后发请求超越的旧快照。 */
  const queueGenerations = new Map<string, number>();

  /** 建线程的单飞状态。 */
  let threadCreation: {
    agentSlug: string;
    projectId: string;
    promise: Promise<ChatThread>;
  } | null = null;
  /**
   * 失败后按「智能体 + 项目」保留同一个幂等键，供下一次重试复用。
   *
   * 两者任一变化都算另一次创建：复用旧键会让后端把上一次的意图回放回来，落到别的项目上。
   */
  let failedCreation: {
    agentSlug: string;
    projectId: string;
    requestId: string;
  } | null = null;

  const runStream = createRunStream({
    currentAgentId: options.currentAgentId,
    streamSmoother: smoother,
    handleStreamChunk: (chunk, threadId) =>
      handler.handleStreamChunk(chunk as Record<string, unknown>, threadId),
    fetchThreadMessages,
    fetchAgentState: options.fetchAgentState,
    resetOnGoingConv: (threadId, resetOptions) =>
      resetOnGoingConv(threadId, resetOptions),
    onScrollToBottom: options.onScrollToBottom,
    // 一次 run 收尾会把队头派发出去，队列内容随之变化。
    onTerminalDetected: ({ threadId }) => {
      void refreshQueue(threadId, options.currentAgentId() ?? '');
      options.onRunSettled?.(threadId);
    },
    onInterruptDetected: ({ threadId }) => {
      void refreshQueue(threadId, options.currentAgentId() ?? '');
      options.onRunSettled?.(threadId);
    },
  });

  const createThread: ChatRuntime['createThread'] = (
    agentSlug,
    title,
    toolApprovalMode,
    projectId = '',
  ) => {
    // 单飞按「智能体 + 项目」判定：项目换了就是另一次创建，不能把上一条线程交回去
    if (
      threadCreation?.agentSlug === agentSlug &&
      threadCreation.projectId === projectId
    ) {
      return threadCreation.promise;
    }

    // 响应丢失后的重试要带同一个 request_id，后端据此返回同一条线程而不是新建；
    // 智能体或项目换了都属于另一次创建，不复用旧的幂等键。
    const retryKey = failedCreation;
    const requestId =
      retryKey?.agentSlug === agentSlug && retryKey.projectId === projectId
        ? retryKey.requestId
        : createClientRequestId();
    // 只有调用方显式给出的模式才写进线程 metadata：null 表示交回后端按智能体配置解析
    const mode = toolApprovalMode ?? null;

    const promise = chatThreadApi
      .createThread({
        agentSlug,
        title,
        requestId,
        projectId,
        metadata: mode ? { tool_approval_mode: mode } : {},
      })
      .then((thread) => {
        failedCreation = null;
        return thread;
      })
      .catch((error: unknown) => {
        failedCreation = { agentSlug, projectId, requestId };
        throw error;
      })
      .finally(() => {
        if (threadCreation?.promise === promise) threadCreation = null;
      });
    threadCreation = { agentSlug, projectId, promise };
    return promise;
  };

  /**
   * 处理 `createRun` 的结果：拿到 run 就订阅 run 流，被排队就写进队列、
   * 交给请求事件流后续派发。发送与中断恢复共用这一条路径。
   */
  const handleCreatedRequest = async (
    threadId: string,
    agentSlug: string,
    created: CreateRunResult,
    streamOptions: { steerable?: boolean } = {},
  ) => {
    const runtime = getThreadRuntime(threadId);

    if (!created.run_id) {
      if (!runtime.isStreaming) runtime.replyLoadingVisible = false;
      runtime.queuedRequests = [
        ...runtime.queuedRequests,
        {
          request_id: created.request_id,
          status: created.status,
          queue_policy: created.queue_policy,
          queue_position: created.queue_position ?? null,
        },
      ];
      notifyThreadRuntime(threadId);
      await refreshQueue(threadId, agentSlug);
      return;
    }

    runtime.pendingRequestId = created.request_id;
    runtime.activeRunId = created.run_id;
    notifyThreadRuntime(threadId);
    await runStream.startRunStream(
      threadId,
      created.run_id,
      '0-0',
      streamOptions,
    );
  };

  const sendMessage: ChatRuntime['sendMessage'] = async ({
    threadId,
    agentSlug,
    query,
    imageContent,
    toolApprovalMode,
    queuePolicy,
    modelSpec,
    attachmentFileIds,
    onAccepted,
    meta,
  }) => {
    const runtime = getThreadRuntime(threadId);
    runtime.replyLoadingVisible = true;

    // 先放一条本地用户消息：排队期间后端不会把它放进历史（过滤 delivery_status=queued），
    // 没有这条占位，用户发完消息会看不到自己说了什么。请求 id 交给后端复用，
    // init 分片到达时按同一个键换成后端下发的权威消息。
    const requestId = createClientRequestId();
    runtime.onGoingConv.msgChunks[requestId] = [
      {
        id: requestId,
        type: 'human',
        content: query,
        ...(imageContent ? { image_content: imageContent } : {}),
      },
    ];
    notifyThreadRuntime(threadId);

    let created;
    try {
      created = await agentRunApi.createRun({
        query,
        agent_slug: agentSlug,
        thread_id: threadId,
        image_content: imageContent ?? null,
        tool_approval_mode: toolApprovalMode ?? null,
        queue_policy: queuePolicy,
        model_spec: modelSpec,
        meta: {
          ...meta,
          request_id: requestId,
          ...(attachmentFileIds?.length
            ? { attachment_file_ids: attachmentFileIds }
            : {}),
        },
      });
    } catch (error) {
      // 发送失败时撤掉占位，避免留下一条没有对应请求的消息
      delete runtime.onGoingConv.msgChunks[requestId];
      runtime.replyLoadingVisible = false;
      notifyThreadRuntime(threadId);

      // 409 run_interrupted：线程里有一条被打断的 run 正在等审批。参照的处理是
      // 停掉本地流式态、恢复 pendingInterrupt（fetchAgentState 会带回）、并把这次
      // 输入交还给调用方——它决定是把文本拼回输入框还是提示重试。
      if (isRunInterruptedConflict(error)) {
        runtime.isStreaming = false;
        runtime.activeRunSteerable = false;
        runtime.pendingInterrupt = null;
        notifyThreadRuntime(threadId);
        options.fetchAgentState(agentSlug, threadId);
        throw error;
      }
      throw error;
    }

    // 被拒绝时后端没有绑定附件，此时刷新会把它们当成「还没用掉」——那是事实
    onAccepted?.();

    await handleCreatedRequest(threadId, agentSlug, created, {
      steerable: true,
    });
  };

  const stopRequestStream = (threadId: string, requestId: string) => {
    const runtime = getThreadRuntime(threadId);
    const entry = runtime.requestStreams[requestId];
    if (!entry) return;
    entry.controller?.abort();
    delete runtime.requestStreams[requestId];
  };

  const stopRequestStreams: ChatRuntime['stopRequestStreams'] = (threadId) => {
    // 作废在途的队列读取：否则离开线程后响应才回来，会为已离开的线程重新订阅
    queueGenerations.set(threadId, (queueGenerations.get(threadId) ?? 0) + 1);
    // 只读读取：清理路径不能顺手把运行时创建出来（会话被删时会被复活）
    const runtime = getThreadRuntimeOrNull(threadId);
    if (!runtime) return;
    for (const requestId of Object.keys(runtime.requestStreams)) {
      stopRequestStream(threadId, requestId);
    }
  };

  const startRequestStream = async (
    threadId: string,
    requestId: string,
  ): Promise<void> => {
    if (!threadId || !requestId) return;
    const runtime = getThreadRuntime(threadId);
    if (runtime.requestStreams[requestId]) return;

    const controller = new AbortController();
    runtime.requestStreams[requestId] = { controller };
    // 事件回调可能跨越多次 await，每次都按控制器身份确认自己仍是当前订阅
    const isCurrent = () =>
      getThreadRuntime(threadId).requestStreams[requestId]?.controller ===
      controller;
    // 后端到达连接上限会静默收流；此时必须重新同步，否则队列条停在旧状态
    let settled = false;
    const startedAt = Date.now();

    try {
      const response = await agentRunApi.streamRequestEvents(requestId, {
        signal: controller.signal,
      });

      await processSseResponse(response, (event, data) => {
        if (!isCurrent()) return;
        const payload = (data ?? {}) as {
          position?: number;
          run_id?: string;
        };
        const thread = getThreadRuntime(threadId);

        if (event === 'queued') {
          const queued = thread.queuedRequests.find(
            (item) => item.request_id === requestId,
          );
          if (queued && payload.position) {
            queued.queue_position = payload.position;
            notifyThreadRuntime(threadId);
          }
          return;
        }

        if (event === 'run_created' && payload.run_id) {
          settled = true;
          thread.queuedRequests = thread.queuedRequests.filter(
            (item) => item.request_id !== requestId,
          );
          stopRequestStream(threadId, requestId);
          // 旧 run 已收尾时清掉上一段流式分片；仍在跑则保留已渲染内容
          if (!thread.activeRunId) {
            resetOnGoingConv(threadId, { preserveRequestStreams: true });
          }
          thread.pendingRequestId = requestId;
          notifyThreadRuntime(threadId);
          void runStream.startRunStream(threadId, payload.run_id, '0-0');
          return;
        }

        const notice = REQUEST_TERMINAL_NOTICES[event];
        if (!notice) return;
        settled = true;
        thread.queuedRequests = thread.queuedRequests.filter(
          (item) => item.request_id !== requestId,
        );
        // 只有这条请求或它自己派发的 run 才拥有这些收尾状态
        if (!thread.activeRunId || thread.pendingRequestId === requestId) {
          thread.isStreaming = false;
          thread.replyLoadingVisible = false;
          thread.pendingRequestId = null;
        }
        delete thread.onGoingConv.msgChunks[requestId];
        stopRequestStream(threadId, requestId);
        notifyThreadRuntime(threadId);
        options.onNotice?.({ level: 'error', message: notice });
        void fetchThreadMessages({ threadId }).catch(() => undefined);
      });
    } catch (error) {
      if ((error as Error | null)?.name !== 'AbortError') {
        console.error('Request SSE stream error:', error);
        options.onNotice?.({
          level: 'error',
          message: '队列事件流中断，队列状态可能不是最新。',
        });
      }
    } finally {
      if (isCurrent()) {
        delete getThreadRuntime(threadId).requestStreams[requestId];
        if (!settled && !controller.signal.aborted) {
          const livedLongEnough =
            Date.now() - startedAt >= SILENT_STREAM_RESUBSCRIBE_MS;
          void (async () => {
            const agentSlug = options.currentAgentId() ?? '';
            if (livedLongEnough) {
              // 长命流多半撞到后端连接上限：重新同步并订阅，最多每分钟一次
              await refreshQueue(threadId, agentSlug);
              return;
            }
            if (!(await syncQueue(threadId, agentSlug))) return;
            const thread = getThreadRuntime(threadId);
            const stillQueued = thread.queuedRequests.some(
              (item) => item.request_id === requestId,
            );
            if (!stillQueued && !thread.activeRunId) {
              // 这条请求可能已在静默窗口里被派发，交回 run 侧做权威判定
              await runStream.resumeActiveRunForThread(threadId);
            }
          })().catch((error: unknown) => {
            console.warn('Failed to resync queue after stream end:', error);
          });
        }
      }
    }
  };

  /**
   * 读取并写入队列快照，不建立订阅。
   * 返回是否真的写入：被后发读取超越、或期间调用了 `stopRequestStreams` 时返回 false。
   */
  const syncQueue = async (
    threadId: string,
    agentSlug: string,
  ): Promise<boolean> => {
    if (!threadId || !agentSlug) return false;
    const generation = (queueGenerations.get(threadId) ?? 0) + 1;
    queueGenerations.set(threadId, generation);
    // 正常路径需要时创建运行时；但读取期间线程可能被删（运行时被清掉），
    // 那时不能再写回，否则会把已删会话重新造出来
    const runtime = getThreadRuntime(threadId);
    try {
      const { requests, queue } = await agentRunApi.listThreadRequests(
        threadId,
        agentSlug,
      );
      // 连续操作会让多个读取并发，只接受最后一次发起的结果。
      if (queueGenerations.get(threadId) !== generation) return false;
      if (!hasThreadRuntime(threadId)) return false;
      runtime.queuedRequests = requests ?? [];
      runtime.queueSnapshot = queue ?? { ...IDLE_QUEUE_SNAPSHOT };
      notifyThreadRuntime(threadId);
      return true;
    } catch (error) {
      console.warn('Failed to sync queued requests:', error);
      if (queueGenerations.get(threadId) === generation) {
        options.onNotice?.({
          level: 'warning',
          message: '同步队列状态失败，队列显示可能不是最新。',
        });
      }
      return false;
    }
  };

  const refreshQueue: ChatRuntime['refreshQueue'] = async (
    threadId,
    agentSlug,
  ) => {
    if (!(await syncQueue(threadId, agentSlug))) return;
    for (const request of getThreadRuntime(threadId).queuedRequests) {
      void startRequestStream(threadId, request.request_id);
    }
  };

  const steer: ChatRuntime['steer'] = async ({
    threadId,
    agentSlug,
    requestId,
  }) => {
    await agentRunApi.steerRequest(requestId);
    await refreshQueue(threadId, agentSlug);
    void startRequestStream(threadId, requestId);
  };

  const cancelQueued: ChatRuntime['cancelQueued'] = async ({
    threadId,
    agentSlug,
    requestId,
  }) => {
    await agentRunApi.cancelRequest(requestId);
    stopRequestStream(threadId, requestId);
    await refreshQueue(threadId, agentSlug);
  };

  const continueQueue: ChatRuntime['continueQueue'] = async (
    threadId,
    agentSlug,
  ) => {
    const runtime = getThreadRuntime(threadId);
    if (runtime.continueQueueInFlight) return;
    runtime.continueQueueInFlight = true;
    notifyThreadRuntime(threadId);
    try {
      const dispatched = await agentRunApi.continueThreadQueue(
        threadId,
        agentSlug,
      );
      await refreshQueue(threadId, agentSlug);
      if (dispatched?.request_id) {
        void startRequestStream(threadId, dispatched.request_id);
      }
    } finally {
      runtime.continueQueueInFlight = false;
      notifyThreadRuntime(threadId);
    }
  };

  const submitInterrupt: ChatRuntime['submitInterrupt'] = async ({
    threadId,
    agentSlug,
    resume,
    interruptedRunId = null,
  }) => {
    const runtime = getThreadRuntime(threadId);
    // 用户已经处理了这次中断：作废在途的 state 读取，别让它把审批再弹回来
    invalidateAgentStateReads(threadId);
    const previousInterrupt = runtime.pendingInterrupt;
    runtime.pendingInterrupt = null;
    runtime.replyLoadingVisible = true;
    notifyThreadRuntime(threadId);

    let created;
    try {
      created = await agentRunApi.createRun({
        query: null,
        agent_slug: agentSlug,
        thread_id: threadId,
        meta: { request_id: createClientRequestId() },
        resume,
        created_by_run_id: interruptedRunId,
      });
    } catch (error) {
      // 提交失败时把待处理中断放回去，用户可以重试
      runtime.pendingInterrupt = previousInterrupt;
      runtime.replyLoadingVisible = false;
      notifyThreadRuntime(threadId);
      throw error;
    }

    await handleCreatedRequest(threadId, agentSlug, created);
  };

  const cancelRun: ChatRuntime['cancelRun'] = async (threadId) => {
    const runtime = getThreadRuntime(threadId);
    if (!runtime.activeRunId) return;
    await agentRunApi.cancelRun(runtime.activeRunId);
    runStream.stopRunStreamSubscription(threadId);
    runtime.isStreaming = false;
    runtime.replyLoadingVisible = false;
    notifyThreadRuntime(threadId);
  };

  const loadHistory: ChatRuntime['loadHistory'] = async (
    threadId,
    loadOptions = {},
  ) => {
    const runtime = getThreadRuntime(threadId);
    if (runtime.historyLoaded && !loadOptions.force) return;
    await fetchThreadMessages({ threadId });
  };

  return {
    loadHistory,
    createThread,
    refreshQueue,
    stopRequestStreams,
    steer,
    cancelQueued,
    continueQueue,
    submitInterrupt,
    sendMessage,
    cancelRun,
    resume: (threadId) => runStream.resumeActiveRunForThread(threadId),
    stopStream: (threadId) => {
      runStream.stopRunStreamSubscription(threadId);
      setRunController(threadId, null);
      abortRunStream(threadId);
    },
    runtimeFor: (threadId) => getThreadRuntime(threadId),
  };
}

/** 页面侧入口：把运行时绑定到组件生命周期。 */
export function useChatRuntime(options: ChatRuntimeOptions): ChatRuntime {
  const optionsRef = React.useRef(options);
  // 渲染期写 ref 在并发渲染下不安全，改到提交后同步最新 options；
  // runtime 里的回调只在事件/异步时机读它，提交后读到的一定是最新值
  React.useEffect(() => {
    optionsRef.current = options;
  });

  return React.useMemo(
    () =>
      // createChatRuntime 只保存这些回调，渲染期不会调用它们；optionsRef 只在事件/异步时机被读。
      // 编译器看不进 createChatRuntime，把「传闭包」保守判成渲染期读 ref，这里显式说明。
      // oxlint-disable-next-line react/refs -- 构造运行时不读 ref
      createChatRuntime({
        currentAgentId: () => optionsRef.current.currentAgentId(),
        fetchAgentState: (agentId, threadId) =>
          optionsRef.current.fetchAgentState(agentId, threadId),
        onNotice: (notice) => optionsRef.current.onNotice?.(notice),
        onScrollToBottom: () => optionsRef.current.onScrollToBottom?.(),
        onRunSettled: (threadId) => optionsRef.current.onRunSettled?.(threadId),
      }),
    [],
  );
}

/** 发送冷却窗口；防止发送后连续触发停止/再发送（参照同款 2s）。 */
export const SEND_COOLDOWN_MS = 2000;
