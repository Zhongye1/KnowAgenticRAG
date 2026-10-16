/**
 * Run 相关端点。
 *
 * 普通请求走契约生成的 SDK；事件流需要 `Last-Event-ID` 续传游标，
 * 生成物不覆盖该形态，因此经 `apiFetch` 直接发起。
 */
import {
  ApiError,
  UNAUTHORIZED_EVENT,
  setAccessToken,
} from '@/shared/api';
import {
  createThreadApiChatThreadPost,
  deleteThreadApiChatThreadThreadIdDelete,
  listThreadsApiChatThreadsGet,
  markThreadViewedApiChatThreadThreadIdViewedPost,
  searchThreadsApiChatThreadsSearchGet,
  updateThreadApiChatThreadThreadIdPut,
  cancelAgentRunApiAgentRunsRunIdCancelPost,
  cancelRequestApiAgentRequestsRequestIdCancelPost,
  continueThreadRequestsApiAgentThreadThreadIdRequestsContinuePost,
  getThreadHistoryApiChatThreadThreadIdHistoryGet,
  getDefaultAgentApiAgentDefaultGet,
  createAgentRunApiAgentRunsPost,
  getAgentRunApiAgentRunsRunIdGet,
  getRequestApiAgentRequestsRequestIdGet,
  getAgentRunLangfuseLinkRouteApiAgentRunsRunIdLangfuseGet,
  listThreadRequestsApiAgentThreadThreadIdRequestsGet,
  steerRequestApiAgentRequestsRequestIdSteerPost,
  streamRunEventsApiAgentRunsRunIdEventsGet,
  streamRequestEventsRouteApiAgentRequestsRequestIdEventsGet,
  getThreadActiveRunApiAgentThreadThreadIdActiveRunGet,
  getThreadStateApiChatThreadThreadIdStateGet,
  uploadImageApiChatImageUploadPost,
  callApiChatCallPost,
} from '@/shared/api/generated/sdk.gen';
import type {
  AgentActiveRunResponse,
  AgentRequestCancelResponse,
  AgentRequestQueueState,
  AgentRequestResponse,
  AgentRequestSteerResponse,
  AgentRunCreateResponse,
  AgentRunItem,
  AgentRunLangfuseResponse,
  AgentRunResponse,
  AgentThreadContinueResponse,
  AgentThreadRequestsResponse,
  CallResponse,
  EndRunEvent,
  ImageUploadResponse,
  RunEvent,
  ThreadDeleteResponse,
  ThreadHistoryResponse,
  ThreadResponse,
  ThreadSearchItem as ThreadSearchItemModel,
  ThreadSearchResponse,
  ThreadStateResponse,
} from '@/shared/api/generated/types.gen';
import {
  buildConversationTitlePrompt,
  sanitizeGeneratedTitle,
} from '../lib/thread-title';
import type { ToolApprovalMode } from '../lib/tool-approval';

/** 运行任务条目；字段对齐后端 `AgentRunItem` 契约（状态是后端下发的枚举字符串）。 */
export type AgentRun = AgentRunItem;

/** 创建 run 的响应：字段在顶层，不套 `{ run }` 外壳。 */
export type CreateRunResult = AgentRunCreateResponse;

/** 事件流的一帧；判别键是信封上的 `event`，因此按它收窄载荷。 */
export type RunStreamEvent = RunEvent;

/** `end` 事件的终态取值，与后端 `EndPayload.status` 同一份事实。 */
export type RunEndStatus = EndRunEvent['payload']['status'];

/** 一条工具调用；后端把结果嵌在同一条 AI 消息里（`tool_call_result`）。 */
export type ChatToolCall = {
  id?: string;
  name?: string;
  /** 流式分片里的位次，用于把同一次回复的多个调用归并到一起。 */
  index?: number;
  /** 部分来源用 function 包裹工具名与参数。 */
  function?: { name?: string; arguments?: string };
  args?: unknown;
  /** 成功时是 `{content}`，失败时后端返回 null。 */
  tool_call_result?: { content?: unknown } | null;
  status?: string;
  error_message?: string | null;
  /** 子智能体等工具由渲染层补的展示名。 */
  display_label?: string;
};

/** 线程历史里的一条消息；字段与 `GET /api/chat/thread/{id}/history` 的返回一致。 */
export type ChatMessage = {
  id: number | string;
  type: string;
  content: string;
  created_at?: string | null;
  run_id?: string | null;
  request_id?: string | null;
  delivery_status?: string | null;
  error_type?: string | null;
  error_message?: string | null;
  extra_metadata?: Record<string, unknown> | null;
  message_type?: string | null;
  image_content?: string | null;
  /** 反馈由 `GET /history` 按当前用户过滤；`rating` 是 like / dislike 一类的字符串。 */
  feedback?: {
    id?: number;
    rating?: string;
    reason?: string | null;
    created_at?: string | null;
  } | null;
  /** 只有助手消息带；工具结果已经嵌在这里，历史里不再有独立的 tool 消息。 */
  tool_calls?: ChatToolCall[];
  /** 只有助手消息带，用于计算「处理过程」耗时。 */
  run_started_at?: string | null;
  run_finished_at?: string | null;
  /** 客户端追加：会话被用户中止时标记。 */
  isStoppedByUser?: boolean;
};

/** 线程内一条排队请求；字段取自 `GET /api/agent/thread/{id}/requests`。 */
export type ThreadRequest = {
  request_id: string;
  status?: string;
  source?: string;
  /** 这条请求对应的用户输入，队列条用它做展示文案。 */
  content?: string | null;
  /** 排队策略；契约允许 null（未下发时）。 */
  queue_policy?: string | null;
  /** 从 1 开始的排队位次；已派发时为 null。 */
  queue_position?: number | null;
  dispatched_run_id?: string | null;
  error_message?: string | null;
  created_at?: string;
};

/** 线程队列状态；字段对齐后端 `AgentRequestQueueState` 契约。 */
export type QueueState = AgentRequestQueueState;

/** 对话线程；字段取自 `POST /api/chat/thread` 与 `GET /api/chat/threads` 的响应。 */
export type ChatThread = {
  id: string;
  agent_id: string;
  title?: string | null;
  project_id?: string | null;
  is_pinned?: boolean;
  thread_status?: string;
  created_at?: string;
  updated_at?: string;
  /** 会话级展示配置；工具审批模式存在 `metadata.tool_approval_mode`。 */
  metadata?: Record<string, unknown> | null;
};

/** 搜索命中的一条会话；字段对齐后端 `ThreadSearchItem` 契约（片段与命中数由搜索接口下发）。 */
export type ThreadSearchItem = ThreadSearchItemModel;

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
  /** 上传聊天图片：服务端压缩后返回裸 base64，前端只做校验与展示。 */
  uploadImage: async (file: File): Promise<ImageUploadResponse> =>
    unwrap<ImageUploadResponse>(
      await uploadImageApiChatImageUploadPost({ body: { file } }),
    ),

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

  getRun: async (runId: string): Promise<AgentRunResponse> =>
    unwrap<AgentRunResponse>(
      await getAgentRunApiAgentRunsRunIdGet({ path: { run_id: runId } }),
    ),

  getThreadActiveRun: async (
    threadId: string,
  ): Promise<AgentActiveRunResponse> =>
    unwrap<AgentActiveRunResponse>(
      await getThreadActiveRunApiAgentThreadThreadIdActiveRunGet({
        path: { thread_id: threadId },
      }),
    ),

  /** 线程消息历史；进入已有线程时渲染，终态后重新拉取以对齐权威状态。 */
  getAgentHistory: async (threadId: string): Promise<ThreadHistoryResponse> =>
    unwrap<ThreadHistoryResponse>(
      await getThreadHistoryApiChatThreadThreadIdHistoryGet({
        path: { thread_id: threadId },
      }),
    ),

  /** 默认智能体；对话页用它作为未显式选择时的发送目标。 */
  getDefaultAgent: async (options: { signal?: AbortSignal } = {}) =>
    unwrap<{
      agent?: {
        slug?: string;
        /** 智能体配置；工具审批默认值在 `context.tool_approval_mode`，非管理员会被角色过滤掉。 */
        config_json?: {
          context?: { tool_approval_mode?: string | null } | null;
        } | null;
      };
    }>(await getDefaultAgentApiAgentDefaultGet({ signal: options.signal })),

  /**
   * 某次 Run 的 Langfuse 链接；后端没配 Langfuse 时返回 `{available: false}`。
   * 消息调试面板用它开新窗口，因此这里只把原始载荷交给调用方判安全。
   */
  getRunLangfuseLink: async (
    runId: string,
  ): Promise<AgentRunLangfuseResponse> =>
    unwrap<AgentRunLangfuseResponse>(
      await getAgentRunLangfuseLinkRouteApiAgentRunsRunIdLangfuseGet({
        path: { run_id: runId },
      }),
    ),

  /** 线程内排队请求与队列状态。 */
  listThreadRequests: async (
    threadId: string,
    agentSlug: string,
  ): Promise<AgentThreadRequestsResponse> =>
    unwrap<AgentThreadRequestsResponse>(
      await listThreadRequestsApiAgentThreadThreadIdRequestsGet({
        path: { thread_id: threadId },
        query: { agent_slug: agentSlug },
      }),
    ),

  /** 把普通排队请求提升为下一条执行的引导请求。 */
  steerRequest: async (requestId: string) =>
    unwrap<AgentRequestSteerResponse>(
      await steerRequestApiAgentRequestsRequestIdSteerPost({
        path: { request_id: requestId },
      }),
    ),

  cancelRequest: async (requestId: string) =>
    unwrap<AgentRequestCancelResponse>(
      await cancelRequestApiAgentRequestsRequestIdCancelPost({
        path: { request_id: requestId },
      }),
    ),

  /** 手动继续被暂停的线程队列（failed/cancelled 之后）。 */
  continueThreadQueue: async (threadId: string, agentSlug: string) =>
    unwrap<AgentThreadContinueResponse>(
      await continueThreadRequestsApiAgentThreadThreadIdRequestsContinuePost({
        path: { thread_id: threadId },
        query: { agent_slug: agentSlug },
      }),
    ),

  /** 单条请求的权威状态；用于判定 run 是否可被 steer。 */
  getRequest: async (requestId: string): Promise<AgentRequestResponse> =>
    unwrap<AgentRequestResponse>(
      await getRequestApiAgentRequestsRequestIdGet({
        path: { request_id: requestId },
      }),
    ),

  /**
   * 单条请求的事件流：排队位次变化、被派发成 run、或被取消/失败。
   * 端点不接受续传游标，断线后按请求当前状态重新判定即可。
   *
   * 帧由生成的 SSE 客户端解析，但这条流的载荷里**没有事件名**（事件名在 SSE 帧上），而消费方
   * 按事件名分支，所以这里用生成的 `onSseEvent` 把帧名与载荷一并交出。生成客户端的重试关闭，
   * 断线判定留给调用方。
   */
  streamRequestEvents: async (
    requestId: string,
    options: { signal?: AbortSignal } = {},
  ) => {
    let frameName = 'message';
    const result =
      await streamRequestEventsRouteApiAgentRequestsRequestIdEventsGet({
        path: { request_id: requestId },
        sseMaxRetryAttempts: 0,
        signal: options.signal,
        onSseEvent: (event) => {
          frameName = event.event ?? 'message';
        },
      });

    // `onSseEvent` 在每条载荷 yield 之前触发，因此这里读到的是当前帧的事件名
    return (async function* () {
      for await (const data of result.stream) {
        yield { event: frameName, data };
      }
    })();
  },

  cancelRun: async (runId: string) =>
    unwrap<AgentRunResponse>(
      await cancelAgentRunApiAgentRunsRunIdCancelPost({
        path: { run_id: runId },
      }),
    ),

  /**
   * 打开 run 事件流。
   *
   * 帧由生成的 SSE 客户端解析（事件载荷已进契约），但**重连与续传游标仍归本应用**：
   * `sseMaxRetryAttempts: 0` 只关掉生成客户端的重试，失败时它回调 `onSseError` 后结束流，由
   * 调用方在流结束后用 `getRun` 判定权威状态再决定重连或收尾，并持久化游标以支持跨会话续传。
   * 游标经 `Last-Event-ID` 交回服务端（生成客户端的 `lastEventId` 只在进程内），新到的 `id:`
   * 由 `onCursor` 通知调用方。
   */
  streamRunEvents: (
    runId: string,
    afterSeq = '0-0',
    options: {
      signal?: AbortSignal;
      verbose?: boolean;
      onCursor?: (seq: string) => void;
    } = {},
  ) => {
    const cursor = String(afterSeq || '0-0');
    // 生成客户端的 `id` 是模块级的「粘性」值：没有 `id:` 行的帧会回传上一帧的 id（心跳也会触发
    // 一次回调），所以只在它变化时当游标上报——否则那几帧会被消费方误当作重复帧跳过。
    let forwardedId: string | undefined;

    return streamRunEventsApiAgentRunsRunIdEventsGet({
      path: { run_id: runId },
      // 后端默认 `verbose=true`（完整载荷）；浏览器要的是紧凑载荷。
      query: { verbose: options.verbose ?? false },
      headers: cursor === '0-0' ? {} : { 'Last-Event-ID': cursor },
      sseMaxRetryAttempts: 0,
      signal: options.signal,
      onSseEvent: (event) => {
        if (event.id && event.id !== forwardedId) {
          forwardedId = event.id;
          options.onCursor?.(event.id);
        }
      },
      onSseError: (error) => {
        // 非 2xx 时生成客户端不抛出，而是回调这里并结束流，所以 401 的副作用必须落在这一层：
        // 放到调用方 try/catch 或 `.catch` 都是死代码。
        const status = Number.parseInt(
          String((error as Error)?.message ?? '').split(' ')[2] ?? '',
          10,
        );
        if (status === 401) {
          setAccessToken(null);
          window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        }
      },
    });
  },
};

/**
 * 对话线程接口。
 *
 * 建线程用 `agent_id` 字段名，但后端收的是 agent slug（`create_thread` 把它
 * 直接当作 `agent_slug` 传给 view），这里按真实语义命名参数。
 */
export const chatThreadApi = {
  /** 线程当前的 agent state：`token_usage` 与可恢复的中断载荷都在这里。 */
  getAgentState: async (threadId: string): Promise<ThreadStateResponse> =>
    unwrap<ThreadStateResponse>(
      await getThreadStateApiChatThreadThreadIdStateGet({
        path: { thread_id: threadId },
      }),
    ),

  /** 当前用户的会话列表；后端按 `updated_at` 倒序返回。 */
  listThreads: async (
    payload: {
      agentSlug?: string;
      limit?: number;
      offset?: number;
    } & { signal?: AbortSignal } = {},
  ): Promise<ChatThread[]> =>
    unwrap<ThreadResponse[]>(
      await listThreadsApiChatThreadsGet({
        signal: payload.signal,
        query: {
          ...(payload.agentSlug ? { agent_id: payload.agentSlug } : {}),
          ...(payload.limit ? { limit: payload.limit } : {}),
          ...(payload.offset ? { offset: payload.offset } : {}),
        },
      }),
    ),

  /**
   * 按消息内容搜索历史会话。
   *
   * 不传 `agent_id`：搜索范围是当前用户的全部会话（与列表接口按智能体过滤不同）。
   */
  searchThreads: async (payload: {
    query: string;
    limit?: number;
    offset?: number;
  }): Promise<ThreadSearchResponse> =>
    unwrap<ThreadSearchResponse>(
      await searchThreadsApiChatThreadsSearchGet({
        query: {
          q: payload.query,
          ...(payload.limit ? { limit: payload.limit } : {}),
          ...(payload.offset ? { offset: payload.offset } : {}),
        },
      }),
    ),

  /** 标记已查看该会话最新一次 run，清除侧边栏未读状态。 */
  markViewed: async (threadId: string): Promise<ChatThread> =>
    unwrap<ThreadResponse>(
      await markThreadViewedApiChatThreadThreadIdViewedPost({
        path: { thread_id: threadId },
      }),
    ),

  /** 更新线程展示字段；`toolApprovalMode` 写入线程 metadata，供后续请求显式下发。 */
  updateThread: async (
    threadId: string,
    payload: {
      title?: string;
      isPinned?: boolean;
      toolApprovalMode?: ToolApprovalMode | null;
    },
  ): Promise<ChatThread> =>
    unwrap<ThreadResponse>(
      await updateThreadApiChatThreadThreadIdPut({
        path: { thread_id: threadId },
        body: {
          ...(payload.title === undefined ? {} : { title: payload.title }),
          ...(payload.isPinned === undefined
            ? {}
            : { is_pinned: payload.isPinned }),
          ...(payload.toolApprovalMode === undefined
            ? {}
            : { tool_approval_mode: payload.toolApprovalMode }),
        },
      }),
    ),

  /** 删除会话（后端软删，列表随之不再返回它）。 */
  deleteThread: async (threadId: string): Promise<void> => {
    unwrap<ThreadDeleteResponse>(
      await deleteThreadApiChatThreadThreadIdDelete({
        path: { thread_id: threadId },
      }),
    );
  },

  createThread: async (payload: {
    agentSlug: string;
    title?: string;
    metadata?: Record<string, unknown>;
    /** 幂等重放标识：重试同一次创建时复用，避免产生多条空线程。 */
    requestId?: string;
    /** 项目 id；空串表示不使用项目，交给后端在发送时创建独立目录。 */
    projectId?: string;
  }): Promise<ChatThread> =>
    unwrap<ThreadResponse>(
      await createThreadApiChatThreadPost({
        body: {
          agent_id: payload.agentSlug,
          title: payload.title ?? '新的对话',
          metadata: payload.metadata ?? {},
          ...(payload.requestId ? { request_id: payload.requestId } : {}),
          ...(payload.projectId ? { project_id: payload.projectId } : {}),
        },
      }),
    ),
};

/** 用 fast_model 生成一次会话标题；调用失败由调用方回退截断文案。 */
export async function generateConversationTitle(input: {
  query: string;
  /** `meta.model_spec`。 */
  modelSpec: unknown;
}): Promise<string> {
  const response = unwrap<CallResponse>(
    await callApiChatCallPost({
      body: {
        query: buildConversationTitlePrompt(input.query),
        meta: { model_spec: input.modelSpec },
      },
    }),
  );
  // 契约声明了 CallResponse，但字段仍按不可信数据处理，防止后端破坏契约时把脏值写进标题
  const payload =
    typeof response === 'object' && response !== null && 'response' in response
      ? (response as { response?: unknown }).response
      : response;
  return sanitizeGeneratedTitle(payload);
}
