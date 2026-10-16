/**
 * 数据总览（Dashboard）接口。
 *
 * 契约在 `backend/server/routers/dashboard_router.py` 与 `knowledge_dashboard_router.py`：
 * 响应类型直接复用生成物 `shared/api/generated/types.gen.ts`；生成器表达不了的一处由 api 段手写——
 * `messages[].tool_calls`（后端声明为 `list[dict]`，由 `dashboard_service` 组装）。
 *
 * 端点全部要求超管（`get_superadmin_user`），响应没有 `{message, data}` 信封。
 */
import {
  getAgentAnalyticsApiDashboardStatsAgentsGet,
  getAllConversationsApiDashboardConversationsGet,
  getAllFeedbacksApiDashboardFeedbacksGet,
  getCallTimeseriesStatsApiDashboardStatsCallsTimeseriesGet,
  getConversationDetailApiDashboardConversationsThreadIdGet,
  getConversationFilterOptionsApiDashboardConversationsOptionsGet,
  getDashboardStatsApiDashboardStatsGet,
  getThreadAnalyticsStatsApiDashboardStatsThreadsGet,
  getToolCallStatsApiDashboardStatsToolsGet,
  getUserActivityStatsApiDashboardStatsUsersGet,
  readKnowledgeStatsApiDashboardStatsKnowledgeGet,
} from '@/shared/api/generated/sdk.gen';
import type {
  AgentAnalytics,
  BasicStatsResponse,
  ConversationDetailResponse,
  ConversationFilterOptionsResponse,
  ConversationListItem,
  ConversationListResponse,
  FeedbackListItem,
  KnowledgeStats,
  ThreadAnalyticsResponse,
  TimeSeriesStats,
  ToolCallStats,
  UserActivityStats,
} from '@/shared/api/generated/types.gen';
import { unwrap } from '@/shared/api';

/** 生成物里已有的响应类型直接复用，避免 api 段与契约各说一套。 */
export type {
  AgentAnalytics,
  ConversationFilterOptionsResponse as ConversationFilterOptions,
  ConversationListItem as ConversationSummary,
  ConversationListResponse as ConversationList,
  FeedbackListItem as FeedbackItem,
  KnowledgeStats,
  ThreadAnalyticsResponse as ThreadAnalytics,
  TimeSeriesStats as CallTimeseries,
  ToolCallStats,
  UserActivityStats,
};

/** 调用统计的数据维度，对应后端 `metric_type`。 */
export type CallMetricType = 'models' | 'agents' | 'tokens' | 'tools';

/** 调用统计的时间范围，对应后端 `time_range`。 */
export type CallTimeRange = '14hours' | '14days' | '14weeks';

/** 会话分析的时间范围，对应后端 `time_range`。 */
export type ThreadTimeRange = '7days' | '14days' | '30days' | '90days';

/** 会话状态筛选；`all` 为后端默认。 */
export type ConversationStatus =
  'active' | 'archived' | 'deleted' | 'subagent' | 'all';

/** 概览指标；契约 `BasicStatsResponse`（`/api/dashboard/stats`）。 */
export type DashboardStats = BasicStatsResponse;

/** 单条工具调用记录；后端在消息上挂 `tool_calls` 时给出这些键。 */
export type ToolCallRecord = {
  id: number;
  tool_name: string;
  tool_input?: unknown;
  tool_output?: unknown;
  status?: string | null;
  error_message?: string | null;
};

/** 详情里的消息；`tool_calls` 由 `dashboard_service` 组装，生成物只给 `Record<string, unknown>`。 */
export type ConversationMessage = {
  id: number;
  role: string;
  content: string;
  message_type: string;
  token_count: number;
  created_at: string;
  tool_calls?: ToolCallRecord[];
};

/** 会话详情 = 生成物类型 + 更精确的 `messages`。 */
export type ConversationDetail = Omit<
  ConversationDetailResponse,
  'messages'
> & {
  messages: ConversationMessage[];
};

/** 会话列表查询参数。 */
export type ConversationQuery = {
  uid?: string;
  agent_id?: string;
  status?: ConversationStatus;
  search?: string;
  limit?: number;
  offset?: number;
};

export const dashboardApi = {
  /** 概览指标。 */
  async getStats(): Promise<DashboardStats> {
    return unwrap<DashboardStats>(
      await getDashboardStatsApiDashboardStatsGet(),
    );
  },

  /** 用户活跃度。 */
  async getUserStats(): Promise<UserActivityStats> {
    return unwrap<UserActivityStats>(
      await getUserActivityStatsApiDashboardStatsUsersGet(),
    );
  },

  /** 工具调用统计。 */
  async getToolStats(): Promise<ToolCallStats> {
    return unwrap<ToolCallStats>(
      await getToolCallStatsApiDashboardStatsToolsGet(),
    );
  },

  /** 智能体分析。 */
  async getAgentStats(): Promise<AgentAnalytics> {
    return unwrap<AgentAnalytics>(
      await getAgentAnalyticsApiDashboardStatsAgentsGet(),
    );
  },

  /** 调用量时间序列；`type` 决定分桶维度。 */
  async getCallTimeseries(
    type: CallMetricType,
    timeRange: CallTimeRange,
  ): Promise<TimeSeriesStats> {
    return unwrap<TimeSeriesStats>(
      await getCallTimeseriesStatsApiDashboardStatsCallsTimeseriesGet({
        query: { type, time_range: timeRange },
      }),
    );
  },

  /** 会话分析。 */
  async getThreadStats(
    timeRange: ThreadTimeRange,
    options: { agentId?: string; includeSubagents?: boolean } = {},
  ): Promise<ThreadAnalyticsResponse> {
    return unwrap<ThreadAnalyticsResponse>(
      await getThreadAnalyticsStatsApiDashboardStatsThreadsGet({
        query: {
          time_range: timeRange,
          agent_id: options.agentId || undefined,
          include_subagents: options.includeSubagents ?? false,
        },
      }),
    );
  },

  /** 反馈列表。 */
  async listFeedbacks(): Promise<FeedbackListItem[]> {
    return unwrap<FeedbackListItem[]>(
      await getAllFeedbacksApiDashboardFeedbacksGet(),
    );
  },

  /** 会话筛选的可选项（用户与智能体）。 */
  async getConversationOptions(): Promise<ConversationFilterOptionsResponse> {
    return unwrap<ConversationFilterOptionsResponse>(
      await getConversationFilterOptionsApiDashboardConversationsOptionsGet(),
    );
  },

  /** 会话列表（服务端分页）。 */
  async listConversations(
    query: ConversationQuery = {},
  ): Promise<ConversationListResponse> {
    return unwrap<ConversationListResponse>(
      await getAllConversationsApiDashboardConversationsGet({
        query: {
          uid: query.uid || undefined,
          agent_id: query.agent_id || undefined,
          status: query.status ?? 'all',
          search: query.search || undefined,
          limit: query.limit,
          offset: query.offset,
        },
      }),
    );
  },

  /** 单条会话详情（含消息与工具调用）；未找到时后端返回 404。 */
  async getConversation(threadId: string): Promise<ConversationDetail> {
    return unwrap<ConversationDetail>(
      await getConversationDetailApiDashboardConversationsThreadIdGet({
        path: { thread_id: threadId },
      }),
    );
  },

  /** 知识库统计；知识域未启用时该端点不注册。 */
  async getKnowledgeStats(): Promise<KnowledgeStats> {
    return unwrap<KnowledgeStats>(
      await readKnowledgeStatsApiDashboardStatsKnowledgeGet(),
    );
  },
};
