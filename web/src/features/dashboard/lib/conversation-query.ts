/**
 * 会话审计表的筛选与分页参数组装。
 *
 * 收成一份「筛选值 → 请求参数」的纯折算：关键词去空白后为空不下发、
 * 空筛选不发空串（后端会当成搜索空值），`offset` 永远由页码与页长推出。
 * 改筛选必须回到第 1 页，这条规则由 `FILTER_CHANGE_PAGE` 表达。
 */
import type {
  ConversationQuery,
  ConversationStatus,
} from '../api/dashboard-api';

export type ConversationFilters = {
  status: ConversationStatus;
  /** 原始输入，未去空白；组装参数时才裁剪。 */
  search: string;
  agentId?: string;
  uid?: string;
};

export const CONVERSATION_FILTER_DEFAULTS: ConversationFilters = {
  status: 'all',
  search: '',
};

export const CONVERSATION_STATUS_OPTIONS: {
  value: ConversationStatus;
  label: string;
}[] = [
  { value: 'all', label: '全部（不含已删除）' },
  { value: 'active', label: '进行中' },
  { value: 'archived', label: '已归档' },
  { value: 'deleted', label: '已删除' },
  { value: 'subagent', label: '子智能体会话' },
];

export const CONVERSATION_PAGE_SIZES = [10, 20, 50] as const;
export const DEFAULT_CONVERSATION_PAGE_SIZE = 10;

const STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  archived: '已归档',
  deleted: '已删除',
  subagent: '子智能体',
  unknown: '未知',
};

/** 会话状态文案；后端可能给出前端未枚举的状态，原样回显而不是吞掉。 */
export const conversationStatusLabel = (status: string): string =>
  STATUS_LABELS[status] ?? status ?? '未知';

/** 筛选值 + 页码 → 请求参数。 */
export const buildConversationQuery = (
  filters: ConversationFilters,
  page: number,
  pageSize: number,
): ConversationQuery => ({
  status: filters.status,
  search: filters.search.trim() || undefined,
  agent_id: filters.agentId || undefined,
  uid: filters.uid || undefined,
  limit: pageSize,
  offset: (Math.max(page, 1) - 1) * pageSize,
});

/** 总条数 → 页数；0 条也算 1 页，避免分页控件落到 0。 */
export const conversationPageCount = (
  total: number,
  pageSize: number,
): number => Math.max(1, Math.ceil(Math.max(total, 0) / Math.max(pageSize, 1)));

/**
 * 筛选变化后应停留的页码：任何一次筛选都回第 1 页。
 * 只有明确的分页动作才带页码。
 */
export const FILTER_CHANGE_PAGE = 1;

/** 筛选是否有别于默认值（决定「重置」是否可用）。 */
export const hasActiveConversationFilters = (
  filters: ConversationFilters,
): boolean =>
  filters.status !== CONVERSATION_FILTER_DEFAULTS.status ||
  filters.search.trim() !== '' ||
  Boolean(filters.agentId) ||
  Boolean(filters.uid);
