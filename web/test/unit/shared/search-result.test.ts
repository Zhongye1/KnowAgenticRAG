import { describe, expect, it } from 'vitest';

import { formatResultDate, splitSnippet } from '@/shared/lib';

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
