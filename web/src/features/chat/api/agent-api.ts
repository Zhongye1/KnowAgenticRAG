/**
 * Run 相关端点。
 *
 * 普通请求走契约生成的 SDK；事件流需要 `Last-Event-ID` 续传游标，
 * 生成物不覆盖该形态，因此经 `apiFetch` 直接发起。
 */
import { ApiError, apiFetch } from '@/shared/api';
import {
  createThreadApiChatThreadPost,
  cancelAgentRunApiAgentRunsRunIdCancelPost,
  cancelRequestApiAgentRequestsRequestIdCancelPost,
  continueThreadRequestsApiAgentThreadThreadIdRequestsContinuePost,
  getThreadHistoryApiChatThreadThreadIdHistoryGet,
  getDefaultAgentApiAgentDefaultGet,
  createAgentRunApiAgentRunsPost,
  getAgentRunApiAgentRunsRunIdGet,
  getRequestApiAgentRequestsRequestIdGet,
  listThreadRequestsApiAgentThreadThreadIdRequestsGet,
  steerRequestApiAgentRequestsRequestIdSteerPost,
  getThreadActiveRunApiAgentThreadThreadIdActiveRunGet,
} from '@/shared/api/generated/sdk.gen';

export type RunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type AgentRun = {
  id: string;
  status: RunStatus;
  run_type?: string;
  request_id?: string;
  agent_slug?: string;
  /** 后端字段名是 conversation_thread_id；thread_id 只出现在创建响应的顶层。 */
  conversation_thread_id?: string;
};

/** 创建 run 的响应：字段在顶层，不套 `{ run }` 外壳。 */
export type CreateRunResult = {
  request_id: string;
  status: string;
  run_id: string;
  thread_id: string;
  message_id?: number;
  queue_policy?: string;
  queue_position?: number | null;
  stream_url?: string;
  request_events_url?: string | null;
};

/** 线程历史里的一条消息（字段以后端返回为准）。 */
export type ChatMessage = {
  id: number | string;
  type: string;
  content: string;
  created_at?: string;
  run_id?: string | null;
  request_id?: string | null;
  message_type?: string | null;
  delivery_status?: string | null;
  error_message?: string | null;
  extra_metadata?: Record<string, unknown> | null;
};

/** 线程内一条排队请求；字段取自 `GET /api/agent/thread/{id}/requests`。 */
export type ThreadRequest = {
  request_id: string;
  status?: string;
  source?: string;
  /** 这条请求对应的用户输入，队列条用它做展示文案。 */
  content?: string | null;
  queue_policy?: string;
  /** 从 1 开始的排队位次；已派发时为 null。 */
  queue_position?: number | null;
  dispatched_run_id?: string | null;
  error_message?: string | null;
  created_at?: string;
};

/** 线程队列状态；字段与后端 `queue` 对象一致。 */
export type QueueState = {
  status: string;
  paused_reason: string | null;
  blocking_run_id: string | null;
  can_continue: boolean;
};

export type ThreadQueue = {
  requests: ThreadRequest[];
  queue: QueueState;
};

/** 对话线程；字段取自 `POST /api/chat/thread` 的响应。 */
export type ChatThread = {
  id: string;
  agent_id: string;
  title?: string | null;
  project_id?: string | null;
};

export type RunRequest = {
  request_id: string;
  thread_id?: string;
  source?: string;
  status?: string;
};

/**
 * 生成物默认 fields 返回风格：解一层 `{ data, error }`。
 * 泛型由调用方显式给出，因为生成物的返回类型是成功/失败的联合。
 */
function unwrap<T>(result: {
  data?: unknown;
  error?: unknown;
  response?: Response;
}): T {
  if (result.error !== undefined) {
    throw new ApiError(
      // 网络错误或构造请求就失败时没有 response，status 退化为 0。
      result.response?.status ?? 0,
      backendDetail(result.error),
    );
  }
  return result.data as T;
}

/**
 * 生成物把整段响应体放在 `error` 里（形如 `{detail: {...}}`），
 * 而 `apiFetch` 那条路径只带 `detail` 本体；这里对齐成后者，
 * 让调用方与 `ApiError` 只面对一种 detail 形状。
 */
function backendDetail(error: unknown): unknown {
  if (error && typeof error === 'object' && 'detail' in error) {
    return (error as { detail?: unknown }).detail;
  }
  return error;
}

export const agentRunApi = {
  createRun: async (payload: {
    /** 新请求传用户输入；审批/提问恢复时传 null。 */
    query: string | null;
    agent_slug: string;
    thread_id: string;
    meta?: Record<string, unknown>;
    image_content?: string | null;
    model_spec?: string | null;
    tool_approval_mode?: string | null;
    /** 审批或提问的中断恢复载荷；不传表示一次新请求。 */
    resume?: unknown;
    created_by_run_id?: string | null;
    queue_policy?: string;
  }): Promise<CreateRunResult> =>
    unwrap<CreateRunResult>(
      await createAgentRunApiAgentRunsPost({
        body: {
          query: payload.query,
          agent_slug: payload.agent_slug,
          thread_id: payload.thread_id,
          meta: payload.meta ?? {},
          image_content: payload.image_content ?? null,
          model_spec: payload.model_spec ?? null,
          tool_approval_mode: payload.tool_approval_mode ?? null,
          resume: payload.resume ?? null,
          created_by_run_id: payload.created_by_run_id ?? null,
          queue_policy: payload.queue_policy ?? 'enqueue',
        },
      }),
    ),

  getRun: async (runId: string): Promise<{ run: AgentRun }> =>
    unwrap<{ run: AgentRun }>(
      await getAgentRunApiAgentRunsRunIdGet({ path: { run_id: runId } }),
    ),

  getThreadActiveRun: async (
    threadId: string,
  ): Promise<{ run: AgentRun | null }> =>
    unwrap<{ run: AgentRun | null }>(
      await getThreadActiveRunApiAgentThreadThreadIdActiveRunGet({
        path: { thread_id: threadId },
      }),
    ),

  /** 线程消息历史；进入已有线程时渲染，终态后重新拉取以对齐权威状态。 */
  getAgentHistory: async (threadId: string): Promise<{ history: ChatMessage[] }> =>
    unwrap<{ history: ChatMessage[] }>(
      await getThreadHistoryApiChatThreadThreadIdHistoryGet({
        path: { thread_id: threadId },
      }),
    ),

  /** 默认智能体；对话页用它作为未显式选择时的发送目标。 */
  getDefaultAgent: async (): Promise<{ agent?: { slug?: string } }> =>
    unwrap<{ agent?: { slug?: string } }>(await getDefaultAgentApiAgentDefaultGet()),

  /** 线程内排队请求与队列状态。 */
  listThreadRequests: async (
    threadId: string,
    agentSlug: string,
  ): Promise<ThreadQueue> =>
    unwrap<ThreadQueue>(
      await listThreadRequestsApiAgentThreadThreadIdRequestsGet({
        path: { thread_id: threadId },
        query: { agent_slug: agentSlug },
      }),
    ),

  /** 把普通排队请求提升为下一条执行的引导请求。 */
  steerRequest: async (requestId: string) =>
    unwrap<unknown>(
      await steerRequestApiAgentRequestsRequestIdSteerPost({
        path: { request_id: requestId },
      }),
    ),

  cancelRequest: async (requestId: string) =>
    unwrap<unknown>(
      await cancelRequestApiAgentRequestsRequestIdCancelPost({
        path: { request_id: requestId },
      }),
    ),

  /** 手动继续被暂停的线程队列（failed/cancelled 之后）。 */
  continueThreadQueue: async (threadId: string, agentSlug: string) =>
    unwrap<{ request_id?: string }>(
      await continueThreadRequestsApiAgentThreadThreadIdRequestsContinuePost({
        path: { thread_id: threadId },
        query: { agent_slug: agentSlug },
      }),
    ),

  /** 单条请求的权威状态；用于判定 run 是否可被 steer。 */
  getRequest: async (requestId: string): Promise<{ request: RunRequest }> =>
    unwrap<{ request: RunRequest }>(
      await getRequestApiAgentRequestsRequestIdGet({
        path: { request_id: requestId },
      }),
    ),

  /**
   * 单条请求的事件流：排队位次变化、被派发成 run、或被取消/失败。
   * 端点不接受续传游标，断线后按请求当前状态重新判定即可。
   */
  streamRequestEvents: async (
    requestId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<Response> =>
    apiFetch(`/api/agent/requests/${encodeURIComponent(requestId)}/events`, {
      method: 'GET',
      signal: options.signal,
    }),

  cancelRun: async (runId: string) =>
    unwrap<unknown>(
      await cancelAgentRunApiAgentRunsRunIdCancelPost({
        path: { run_id: runId },
      }),
    ),

  /** 打开 run 事件流；调用方负责通过 `signal` 关闭。 */
  streamRunEvents: async (
    runId: string,
    afterSeq = '0-0',
    options: { signal?: AbortSignal; verbose?: boolean } = {},
  ): Promise<Response> => {
    const headers: Record<string, string> = {};
    const cursor = String(afterSeq || '0-0');
    if (cursor && cursor !== '0-0') headers['Last-Event-ID'] = cursor;
    const verbose = options.verbose ? 'true' : 'false';

    return apiFetch(
      `/api/agent/runs/${encodeURIComponent(runId)}/events?verbose=${verbose}`,
      { method: 'GET', headers, signal: options.signal },
    );
  },
};

/**
 * 对话线程接口。
 *
 * 建线程用 `agent_id` 字段名，但后端收的是 agent slug（`create_thread` 把它
 * 直接当作 `agent_slug` 传给 view），这里按真实语义命名参数。
 */
export const chatThreadApi = {
  createThread: async (payload: {
    agentSlug: string;
    title?: string;
    metadata?: Record<string, unknown>;
    /** 幂等重放标识：重试同一次创建时复用，避免产生多条空线程。 */
    requestId?: string;
  }): Promise<ChatThread> =>
    unwrap<ChatThread>(
      await createThreadApiChatThreadPost({
        body: {
          agent_id: payload.agentSlug,
          title: payload.title ?? '新的对话',
          metadata: payload.metadata ?? {},
          ...(payload.requestId ? { request_id: payload.requestId } : {}),
        },
      }),
    ),
};
