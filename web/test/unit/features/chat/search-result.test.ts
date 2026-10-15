import { describe, expect, it } from 'vitest';

import type { ChatThread } from '@/features/chat/api/agent-api';
import {
  RECENT_THREAD_LIMIT,
  getRecentGroupLabel,
  groupRecentThreads,
} from '@/features/chat/lib/search-result';

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
