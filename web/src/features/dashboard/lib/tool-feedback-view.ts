/**
 * 工具调用与反馈面板的纯逻辑：空态判定、文本折叠阈值、反馈筛选。
 *
 * 「什么算空」由 lib 段明确判定，界面不许静默留白。
 */
import type { FeedbackItem, ToolCallStats } from '../api/dashboard-api';

/**
 * 工具面板是否无数据。
 *
 * 只看调用总数与常用工具：`daily_tool_calls` 在 0 调用时后端仍会下发 7 天全 0 的序列，
 * 拿它判空会把「没有调用」误判成「有数据」。
 */
export const isToolStatsEmpty = (stats: ToolCallStats | undefined): boolean =>
  !stats ||
  (Number(stats.total_calls ?? 0) <= 0 &&
    (stats.most_used_tools ?? []).length === 0);

/** 错误分布是否有内容。 */
export const hasToolErrors = (stats: ToolCallStats | undefined): boolean =>
  Object.keys(stats?.tool_error_distribution ?? {}).length > 0;

export type FeedbackRatingFilter = 'all' | 'like' | 'dislike';

export const FEEDBACK_FILTER_OPTIONS: {
  value: FeedbackRatingFilter;
  label: string;
}[] = [
  { value: 'all', label: '全部' },
  { value: 'like', label: '点赞' },
  { value: 'dislike', label: '点踩' },
];

/** 反馈类型文案；后端目前只给 `like` / `dislike`，其它值原样回显。 */
export const feedbackRatingLabel = (rating: string): string =>
  rating === 'like' ? '点赞' : rating === 'dislike' ? '点踩' : rating;

/**
 * 反馈列表的客户端筛选。
 *
 * 反馈端点不接受 `rating` 查询参数（api 段只有无参 `listFeedbacks`），因此筛选在客户端做。
 */
export const filterFeedbacks = (
  items: readonly FeedbackItem[] = [],
  rating: FeedbackRatingFilter = 'all',
): FeedbackItem[] =>
  rating === 'all'
    ? [...items]
    : items.filter((item) => item.rating === rating);

/** 正文折叠阈值：每行约 30 个字符、最多 8 行。 */
export const FEEDBACK_MESSAGE_MAX_LINES = 8;
const AVERAGE_CHARS_PER_LINE = 30;

const estimateLines = (text: string): number =>
  Math.ceil(text.length / AVERAGE_CHARS_PER_LINE);

/** 消息正文是否需要「展开全部」。 */
export const shouldShowMessageExpandButton = (
  content: string | null | undefined,
): boolean => estimateLines(String(content ?? '')) > FEEDBACK_MESSAGE_MAX_LINES;
