import { describe, expect, it } from 'vitest';

import type { ChatThread } from '@/features/chat/api/agent-api';
import {
  RECENT_THREAD_LIMIT,
  formatResultDate,
  getRecentGroupLabel,
  groupRecentThreads,
  splitSnippet,
} from '@/features/chat/lib/search-result';

describe('片段高亮切片', () => {
  it('把命中的子串切出来，其余保持原样', () => {
    expect(splitSnippet('我们聊了队列的事', '队列')).toEqual([
      { text: '我们聊了', match: false },
      { text: '队列', match: true },
      { text: '的事', match: false },
    ]);
  });

  it('大小写不敏感，且保留原文的大小写', () => {
    expect(splitSnippet('Agent 与 agent', 'AGENT')).toEqual([
      { text: 'Agent', match: true },
      { text: ' 与 ', match: false },
      { text: 'agent', match: true },
    ]);
  });

  it('多处命中全部高亮', () => {
    const segments = splitSnippet('aa', 'a');

    expect(segments).toEqual([
      { text: 'a', match: true },
      { text: 'a', match: true },
    ]);
  });

  it('空查询或空内容时返回整段非高亮', () => {
    expect(splitSnippet('内容', '   ')).toEqual([
      { text: '内容', match: false },
    ]);
    expect(splitSnippet('', '查询')).toEqual([{ text: '', match: false }]);
  });

  it('没有命中时只有一段非高亮', () => {
    expect(splitSnippet('完全无关', '队列')).toEqual([
      { text: '完全无关', match: false },
    ]);
  });
});

describe('结果日期', () => {
  const now = new Date('2026-10-08T04:00:00Z'); // 上海 2026-10-08 12:00

  it('当年显示月日', () => {
    expect(formatResultDate('2026-03-01T16:30:00Z', now)).toBe('3月2日');
  });

  it('跨年显示完整日期', () => {
    expect(formatResultDate('2025-06-01T00:00:00Z', now)).toBe('2025-06-01');
  });

  it('按上海时钟判断年份：UTC 的除夕夜已经是上海的元旦', () => {
    expect(formatResultDate('2025-12-31T16:30:00Z', now)).toBe('1月1日');
  });

  it('空值与非法值返回空串', () => {
    expect(formatResultDate(null, now)).toBe('');
    expect(formatResultDate('不是时间', now)).toBe('');
  });
});

describe('最近会话分组', () => {
  const now = new Date('2026-10-08T04:00:00Z');

  it('按上海时钟的天数差分组', () => {
    expect(getRecentGroupLabel('2026-10-08T00:00:00Z', now)).toBe('前 7 天');
    expect(getRecentGroupLabel('2026-10-01T00:00:00Z', now)).toBe('前 7 天');
    expect(getRecentGroupLabel('2026-09-20T00:00:00Z', now)).toBe('前 30 天');
    expect(getRecentGroupLabel('2026-01-01T00:00:00Z', now)).toBe('更早');
  });

  it('恰好 8 天进入前 30 天，30 天仍在其中，31 天归到更早', () => {
    expect(getRecentGroupLabel('2026-09-30T00:00:00Z', now)).toBe('前 30 天');
    expect(getRecentGroupLabel('2026-09-08T00:00:00Z', now)).toBe('前 30 天');
    expect(getRecentGroupLabel('2026-09-07T00:00:00Z', now)).toBe('更早');
  });

  it('缺时间时归到更早，而不是丢弃该会话', () => {
    expect(getRecentGroupLabel(null, now)).toBe('更早');
  });

  it('按更新时间倒序并插入分组标题', () => {
    const threads: ChatThread[] = [
      { id: '旧', agent_id: 'a', updated_at: '2026-01-01T00:00:00Z' },
      { id: '新', agent_id: 'a', updated_at: '2026-10-08T00:00:00Z' },
      // 没有 updated_at 时退回 created_at
      { id: '中', agent_id: 'a', created_at: '2026-09-25T00:00:00Z' },
    ];

    const rows = groupRecentThreads(threads, now);

    expect(rows.map((row) => row.key)).toEqual([
      'label-前 7 天',
      '新',
      'label-前 30 天',
      '中',
      'label-更早',
      '旧',
    ]);
  });

  it('最多保留上游同额度的最近会话', () => {
    const threads: ChatThread[] = Array.from(
      { length: RECENT_THREAD_LIMIT + 5 },
      (_, index) => ({
        id: `t-${index}`,
        agent_id: 'a',
        updated_at: `2026-10-08T00:${String(index).padStart(2, '0')}:00Z`,
      }),
    );

    const rows = groupRecentThreads(threads, now);
    const threadRows = rows.filter((row) => row.type === 'thread');

    expect(threadRows).toHaveLength(RECENT_THREAD_LIMIT);
    // 倒序：第一条是时间最大的那条
    expect(threadRows[0]?.key).toBe(`t-${RECENT_THREAD_LIMIT + 4}`);
  });

  it('没有会话时不产生任何行', () => {
    expect(groupRecentThreads([], now)).toEqual([]);
  });
});
