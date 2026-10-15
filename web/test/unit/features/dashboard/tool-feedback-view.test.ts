/**
 * 工具面板空态与反馈列表面板用例。
 *
 * 本机 `tool_calls` / `message_feedbacks` 都是 0 行，空态判定就是界面事实：
 * 0 调用的响应里仍带 7 天全 0 的 `daily_tool_calls`，拿它判空会把「没有调用」
 * 误判成「有数据」而留出一块空白图。
 */
import { describe, expect, it } from 'vitest';

import type {
  FeedbackItem,
  ToolCallStats,
} from '@/features/dashboard/api/dashboard-api';
import {
  FEEDBACK_MESSAGE_MAX_LINES,
  filterFeedbacks,
  feedbackRatingLabel,
  hasToolErrors,
  isToolStatsEmpty,
  shouldShowMessageExpandButton,
} from '@/features/dashboard/lib/tool-feedback-view';

const toolStats = (extra: Partial<ToolCallStats> = {}): ToolCallStats => ({
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
  ...extra,
});

const feedback = (extra: Partial<FeedbackItem> = {}): FeedbackItem => ({
  id: 1,
  uid: 'u1',
  username: '甲',
  avatar: null,
  agent_id: 'a1',
  rating: 'like',
  reason: null,
  created_at: '2026-10-01T10:00:00',
  message_content: '回复内容',
  conversation_title: '会话一',
  ...extra,
});

describe('工具面板空态', () => {
  it('0 调用且无常用工具即为空，即使 daily_tool_calls 里有全 0 的序列', () => {
    // 变异：改用 daily_tool_calls.length 判空会让空面板画出 7 根 0 高柱
    expect(isToolStatsEmpty(toolStats())).toBe(true);
    expect(isToolStatsEmpty(undefined)).toBe(true);
    expect(isToolStatsEmpty(toolStats({ total_calls: 3 }))).toBe(false);
    expect(
      isToolStatsEmpty(
        toolStats({ most_used_tools: [{ tool_name: 'a', count: 1 }] }),
      ),
    ).toBe(false);
  });

  it('错误分布是否有内容单独判定', () => {
    expect(hasToolErrors(toolStats())).toBe(false);
    expect(
      hasToolErrors(toolStats({ tool_error_distribution: { a: 1 } })),
    ).toBe(true);
    expect(hasToolErrors(undefined)).toBe(false);
  });
});

describe('反馈筛选与文案', () => {
  it('全部返回原列表副本，类型筛选按 rating 精确匹配', () => {
    // 变异：`all` 也走 filter 会让未识别的 rating 从列表里消失
    const items = [
      feedback(),
      feedback({ id: 2, rating: 'dislike' }),
      feedback({ id: 3, rating: 'other' }),
    ];
    expect(filterFeedbacks(items, 'all')).toHaveLength(3);
    expect(filterFeedbacks(items, 'like').map((item) => item.id)).toEqual([1]);
    expect(filterFeedbacks(items, 'dislike').map((item) => item.id)).toEqual([
      2,
    ]);
    expect(filterFeedbacks(undefined, 'all')).toEqual([]);
  });

  it('点赞与点踩用中文，其它值原样回显', () => {
    expect(feedbackRatingLabel('like')).toBe('点赞');
    expect(feedbackRatingLabel('dislike')).toBe('点踩');
    expect(feedbackRatingLabel('neutral')).toBe('neutral');
  });
});

describe('正文折叠阈值', () => {
  it('超过 8 行（每行约 30 字）才给展开入口', () => {
    // 变异：阈值判断写反会让短正文也出现「展开全部」
    expect(FEEDBACK_MESSAGE_MAX_LINES).toBe(8);
    expect(shouldShowMessageExpandButton('短回复')).toBe(false);
    expect(shouldShowMessageExpandButton('a'.repeat(240))).toBe(false);
    expect(shouldShowMessageExpandButton('a'.repeat(241))).toBe(true);
    expect(shouldShowMessageExpandButton(null)).toBe(false);
  });
});
