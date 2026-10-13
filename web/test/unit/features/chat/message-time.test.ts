import { describe, expect, it } from 'vitest';

import {
  formatChatTime,
  formatDurationLabel,
  messageDurationMs,
} from '@/features/chat/lib/message-time';

/** 用上海本地时间构造 ISO 串，避免用例受运行机器时区影响。 */
const shanghai = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): string => {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+08:00`;
};

const NOW = shanghai(2026, 10, 12, 15, 30);

describe('formatChatTime', () => {
  it('今天只给时间', () => {
    expect(formatChatTime(shanghai(2026, 10, 12, 9, 5), NOW)).toBe('09:05');
  });

  it('昨天带前缀', () => {
    expect(formatChatTime(shanghai(2026, 10, 11, 9, 5), NOW)).toBe('昨天 09:05');
  });

  it('一周内带星期', () => {
    // 2026-10-07 是周三
    expect(formatChatTime(shanghai(2026, 10, 7, 8, 0), NOW)).toBe('周三 08:00');
  });

  it('同年给月日', () => {
    expect(formatChatTime(shanghai(2026, 3, 1, 8, 0), NOW)).toBe('03-01 08:00');
  });

  it('跨年只给日期', () => {
    expect(formatChatTime(shanghai(2025, 3, 1, 8, 0), NOW)).toBe('2025-03-01');
  });

  it('解析不了的值返回空串', () => {
    expect(formatChatTime(null, NOW)).toBe('');
    expect(formatChatTime('not a date', NOW)).toBe('');
    expect(formatChatTime(undefined, NOW)).toBe('');
  });

  it('按上海日历判断「今天」，不受运行机器时区影响', () => {
    // 上海时间 2026-10-12 00:30 与 UTC 的 10-11 16:30 是同一条
    expect(formatChatTime('2026-10-11T16:30:00Z', NOW)).toBe('00:30');
  });
});

describe('formatDurationLabel', () => {
  it('不足一分钟给秒', () => {
    expect(formatDurationLabel(8_400)).toBe('耗时 8s');
  });

  it('超过一分钟给分与秒', () => {
    expect(formatDurationLabel(125_000)).toBe('耗时 2分5s');
  });

  it('非正数与非法值返回空串', () => {
    expect(formatDurationLabel(0)).toBe('');
    expect(formatDurationLabel(-1)).toBe('');
    expect(formatDurationLabel(Number.NaN)).toBe('');
  });
});

describe('messageDurationMs', () => {
  it('起止都有效时给出毫秒差', () => {
    expect(
      messageDurationMs(shanghai(2026, 10, 12, 9, 0), shanghai(2026, 10, 12, 9, 1)),
    ).toBe(60_000);
  });

  it('缺任一或倒序时返回 0', () => {
    expect(messageDurationMs(null, shanghai(2026, 10, 12, 9, 1))).toBe(0);
    expect(messageDurationMs(shanghai(2026, 10, 12, 9, 1), null)).toBe(0);
    expect(
      messageDurationMs(shanghai(2026, 10, 12, 9, 1), shanghai(2026, 10, 12, 9, 0)),
    ).toBe(0);
  });
});
