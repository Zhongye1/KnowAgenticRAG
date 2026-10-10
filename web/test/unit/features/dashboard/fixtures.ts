/**
 * 数据总览组件用例的响应夹具。
 *
 * 形状取自真实响应（`curl` 打到运行中的后端），只改数值以便断言：
 * 概览走真实值，工具与反馈保持本机的空形态，知识库两种形态都有。
 */
import type {
  AgentAnalytics,
  CallTimeseries,
  ConversationDetail,
  ConversationFilterOptions,
  ConversationList,
  DashboardStats,
  FeedbackItem,
  KnowledgeStats,
  ThreadAnalytics,
  ToolCallStats,
  UserActivityStats,
} from '@/features/dashboard/api/dashboard-api';

export const dashboardStats: DashboardStats = {
  total_conversations: 27,
  active_conversations: 22,
  total_messages: 62,
  total_users: 21,
  feedback_stats: { total_feedbacks: 0, satisfaction_rate: 100 },
};

export const userActivity: UserActivityStats = {
  total_users: 21,
  active_users_24h: 0,
  active_users_30d: 1,
  daily_active_users: [
    { date: '2026-06-13', active_users: 0 },
    { date: '2026-06-14', active_users: 2 },
  ],
};

/** 本机真实形态：0 调用，但 `daily_tool_calls` 仍有 7 天全 0 的序列。 */
export const emptyToolStats: ToolCallStats = {
  total_calls: 0,
  successful_calls: 0,
  failed_calls: 0,
  success_rate: 0,
  most_used_tools: [],
  tool_error_distribution: {},
  daily_tool_calls: [
    { date: '2026-10-02', call_count: 0 },
    { date: '2026-10-03', call_count: 0 },
  ],
};

export const toolStats: ToolCallStats = {
  total_calls: 12,
  successful_calls: 8,
  failed_calls: 4,
  success_rate: 66.7,
  most_used_tools: [
    { tool_name: 'web_search', count: 3 },
    { tool_name: 'file_read', count: 9 },
  ],
  tool_error_distribution: { web_search: 4, file_read: 1 },
  daily_tool_calls: [{ date: '2026-10-02', call_count: 12 }],
};

export const agentAnalytics: AgentAnalytics = {
  total_agents: 6,
  agent_conversation_counts: [
    { agent_id: 'default-chatbot', conversation_count: 27 },
    { agent_id: 'web-search', conversation_count: 0 },
  ],
  agent_satisfaction_rates: [
    { agent_id: 'default-chatbot', satisfaction_rate: 100, total_feedbacks: 0 },
    { agent_id: 'web-search', satisfaction_rate: 50, total_feedbacks: 3 },
  ],
  agent_tool_usage: [
    { agent_id: 'default-chatbot', tool_usage_count: 0 },
    { agent_id: 'web-search', tool_usage_count: 42 },
  ],
  agent_names: { 'default-chatbot': '智能助手', 'web-search': '联网搜索' },
  top_performing_agents: [],
};

/** 本机真实形态：知识域已启用但库里没有任何知识库与文件。 */
export const emptyKnowledgeStats: KnowledgeStats = {
  total_databases: 0,
  total_files: 0,
  total_nodes: 0,
  total_storage_size: 0,
  databases_by_type: {},
  file_type_distribution: {},
};

export const knowledgeStats: KnowledgeStats = {
  total_databases: 2,
  total_files: 9,
  total_nodes: 120,
  total_storage_size: 1024 ** 2 * 3,
  databases_by_type: { milvus: 1, lightweight: 1 },
  file_type_distribution: { pdf: 1, docx: 8 },
};

export const emptyCallTimeseries: CallTimeseries = {
  data: [
    { date: '2026-09-27', data: { 'default-chatbot': 0 }, total: 0 },
    { date: '2026-09-28', data: { 'default-chatbot': 0 }, total: 0 },
  ],
  categories: ['default-chatbot'],
  total_count: 0,
  average_count: 0,
  peak_count: 0,
  peak_date: '2026-09-27',
  agent_names: { 'default-chatbot': '智能助手' },
};

export const callTimeseries: CallTimeseries = {
  ...emptyCallTimeseries,
  data: [
    { date: '2026-09-27', data: { 'default-chatbot': 0 }, total: 0 },
    { date: '2026-09-28', data: { 'default-chatbot': 26 }, total: 26 },
  ],
  total_count: 26,
  average_count: 13,
  peak_count: 26,
  peak_date: '2026-09-28',
};

export const threadAnalytics: ThreadAnalytics = {
  summary: {
    total_threads: 27,
    active_threads: 22,
    total_messages: 62,
    total_tokens: 0,
    avg_messages_per_thread: 2.3,
    avg_tokens_per_thread: 0,
    pinned_threads: 0,
  },
  daily_trends: [
    { date: '2026-09-11', new_threads: 0, active_threads: 0, message_count: 0 },
    { date: '2026-09-12', new_threads: 2, active_threads: 1, message_count: 4 },
  ],
  depth_distribution: {
    '0 条': 3,
    '1-2 条': 20,
    '3-5 条': 4,
    '6-10 条': 0,
    '11-20 条': 0,
    '20+ 条': 0,
  },
  agent_distribution: [
    {
      agent_id: 'default-chatbot',
      agent_name: '智能助手',
      thread_count: 27,
      message_count: 62,
      token_count: 0,
      avg_messages: 2.3,
      agent_avatar: null,
    },
  ],
  top_users: [
    {
      uid: 'zwj',
      username: '张文杰',
      avatar: null,
      thread_count: 27,
      message_count: 62,
      last_active_at: '2026-10-07T16:34:38',
    },
  ],
  status_distribution: { active: 22, archived: 5 },
};

export const emptyThreadAnalytics: ThreadAnalytics = {
  summary: {
    total_threads: 0,
    active_threads: 0,
    total_messages: 0,
    total_tokens: 0,
    avg_messages_per_thread: 0,
    avg_tokens_per_thread: 0,
    pinned_threads: 0,
  },
  daily_trends: [
    { date: '2026-09-11', new_threads: 0, active_threads: 0, message_count: 0 },
  ],
  depth_distribution: {
    '0 条': 0,
    '1-2 条': 0,
    '3-5 条': 0,
    '6-10 条': 0,
    '11-20 条': 0,
    '20+ 条': 0,
  },
  agent_distribution: [],
  top_users: [],
  status_distribution: {},
};

export const conversationOptions: ConversationFilterOptions = {
  users: [{ uid: 'zwj', username: '张文杰', avatar: null, is_deleted: false }],
  agents: [
    {
      agent_id: 'default-chatbot',
      agent_name: '智能助手',
      avatar: null,
      is_deleted: false,
    },
    {
      agent_id: 'retired',
      agent_name: '退休助手',
      avatar: null,
      is_deleted: true,
    },
  ],
};

export const conversationList: ConversationList = {
  items: [
    {
      thread_id: '5a695ef6-e56f-4710-a7ef-d469f4d64db7',
      uid: 'zwj',
      username: '张文杰',
      user_avatar: null,
      user_deleted: false,
      agent_id: 'default-chatbot',
      agent_name: '智能助手',
      agent_avatar: null,
      agent_deleted: false,
      title: '取消事件验证',
      status: 'active',
      is_pinned: false,
      message_count: 3,
      total_tokens: 128,
      created_at: '2026-10-01T18:33:09',
      updated_at: '2026-10-07T16:34:38',
    },
  ],
  total: 27,
  limit: 10,
  offset: 0,
};

export const conversationDetail: ConversationDetail = {
  ...conversationList.items[0],
  total_tokens: 128,
  messages: [
    {
      id: 60,
      role: 'user',
      content: '第一',
      message_type: 'text',
      token_count: 0,
      created_at: '2026-10-01T18:33:09',
    },
    {
      id: 62,
      role: 'assistant',
      content: '模型调用失败',
      message_type: 'text',
      token_count: 12,
      created_at: '2026-10-01T18:33:25',
      // 真实后端在消息上挂 tool_calls（`dashboard_service`），夹具必须带上，
      // 否则「抽屉渲染工具执行记录」这条能力在单测里永远不可见
      tool_calls: [
        {
          id: 7,
          tool_name: 'search_knowledge',
          tool_input: { query: '取消事件' },
          tool_output: '未命中',
          status: 'error',
          error_message: '知识库为空',
        },
      ],
    },
  ],
};

export const feedbackItems: FeedbackItem[] = [
  {
    id: 1,
    uid: 'zwj',
    username: '张文杰',
    avatar: null,
    agent_id: 'default-chatbot',
    rating: 'like',
    reason: null,
    created_at: '2026-10-01T10:00:00',
    message_content: '这条回复很准',
    conversation_title: '取消事件验证',
  },
  {
    id: 2,
    uid: 'zwj',
    username: '张文杰',
    avatar: null,
    agent_id: 'default-chatbot',
    rating: 'dislike',
    reason: '答非所问',
    created_at: '2026-10-02T10:00:00',
    message_content: '这条回复不对',
    conversation_title: null,
  },
];
