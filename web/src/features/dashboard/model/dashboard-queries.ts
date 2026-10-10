/**
 * 数据总览的查询装配。
 *
 * 每个面板一份查询，键里带上筛选参数（调用统计的类型/时间范围、会话分析的时间范围、
 * 会话列表的整份参数），因此切换筛选是换缓存条目而不是就地改写。
 * 页面按「点过才加载」挂载面板，未激活的 tab 不会发出查询。
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type {
  CallMetricType,
  CallTimeRange,
  ConversationQuery,
  ThreadTimeRange,
} from '../api/dashboard-api';
import { dashboardApi } from '../api/dashboard-api';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: () => [...dashboardKeys.all, 'stats'] as const,
  userActivity: () => [...dashboardKeys.all, 'user-activity'] as const,
  toolStats: () => [...dashboardKeys.all, 'tool-stats'] as const,
  agentAnalytics: () => [...dashboardKeys.all, 'agent-analytics'] as const,
  knowledgeStats: () => [...dashboardKeys.all, 'knowledge-stats'] as const,
  callTimeseries: (type: CallMetricType, timeRange: CallTimeRange) =>
    [...dashboardKeys.all, 'call-timeseries', type, timeRange] as const,
  threadAnalytics: (timeRange: ThreadTimeRange, includeSubagents: boolean) =>
    [
      ...dashboardKeys.all,
      'thread-analytics',
      timeRange,
      includeSubagents,
    ] as const,
  feedbacks: () => [...dashboardKeys.all, 'feedbacks'] as const,
  conversationOptions: () =>
    [...dashboardKeys.all, 'conversation-options'] as const,
  conversations: (query: ConversationQuery) =>
    [...dashboardKeys.all, 'conversations', query] as const,
  conversation: (threadId: string) =>
    [...dashboardKeys.all, 'conversation', threadId] as const,
};

/** 概览指标。 */
export const useDashboardStats = () =>
  useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: () => dashboardApi.getStats(),
  });

/** 用户活跃度。 */
export const useUserActivityStats = () =>
  useQuery({
    queryKey: dashboardKeys.userActivity(),
    queryFn: () => dashboardApi.getUserStats(),
  });

/** 工具调用统计。 */
export const useToolCallStats = () =>
  useQuery({
    queryKey: dashboardKeys.toolStats(),
    queryFn: () => dashboardApi.getToolStats(),
  });

/** 智能体分析。 */
export const useAgentAnalytics = () =>
  useQuery({
    queryKey: dashboardKeys.agentAnalytics(),
    queryFn: () => dashboardApi.getAgentStats(),
  });

/**
 * 知识库统计。
 *
 * 该端点在知识域未启用时不注册，因此调用方必须先经能力投影确认知识域可用再挂载：
 * 不挂载即不请求，是本切片唯一的闸门。
 */
export const useKnowledgeStats = () =>
  useQuery({
    queryKey: dashboardKeys.knowledgeStats(),
    queryFn: () => dashboardApi.getKnowledgeStats(),
  });

/** 调用量时间序列；类型或时间范围变化即换查询键。 */
export const useCallTimeseries = (
  type: CallMetricType,
  timeRange: CallTimeRange,
) =>
  useQuery({
    queryKey: dashboardKeys.callTimeseries(type, timeRange),
    queryFn: () => dashboardApi.getCallTimeseries(type, timeRange),
  });

/** 会话分析；是否包含子智能体会话进查询键。 */
export const useThreadAnalytics = (
  timeRange: ThreadTimeRange,
  includeSubagents: boolean,
) =>
  useQuery({
    queryKey: dashboardKeys.threadAnalytics(timeRange, includeSubagents),
    queryFn: () => dashboardApi.getThreadStats(timeRange, { includeSubagents }),
  });

/** 反馈列表（端点无参数，类型筛选在客户端做）。 */
export const useFeedbackList = () =>
  useQuery({
    queryKey: dashboardKeys.feedbacks(),
    queryFn: () => dashboardApi.listFeedbacks(),
  });

/** 会话筛选的用户与智能体候选。 */
export const useConversationOptions = () =>
  useQuery({
    queryKey: dashboardKeys.conversationOptions(),
    queryFn: () => dashboardApi.getConversationOptions(),
  });

/** 会话列表（服务端分页）；翻页期间保留上一页数据供表格过渡。 */
export const useConversationList = (query: ConversationQuery) =>
  useQuery({
    queryKey: dashboardKeys.conversations(query),
    queryFn: () => dashboardApi.listConversations(query),
    placeholderData: keepPreviousData,
  });

/** 单条会话详情；`threadId` 为空时不发请求。 */
export const useConversationDetail = (threadId: string | null) =>
  useQuery({
    queryKey: dashboardKeys.conversation(threadId ?? ''),
    queryFn: () => dashboardApi.getConversation(threadId as string),
    enabled: Boolean(threadId),
  });
