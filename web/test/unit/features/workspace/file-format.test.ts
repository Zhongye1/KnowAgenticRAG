import { describe, expect, it } from 'vitest';

import {
  formatFileSize,
  formatRelativeTime,
  isEditableWorkspaceFile,
} from '@/features/workspace';

describe('formatFileSize', () => {
  it('目录与无效值显示 `-`', () => {
    expect(formatFileSize(0, true)).toBe('-');
    expect(formatFileSize(1234, true)).toBe('-');
    expect(formatFileSize(Number.NaN, false)).toBe('-');
    expect(formatFileSize(-1, false)).toBe('-');
  });

  it('0 显示 `0 B`，整数不带多余的小数位（与参照一致）', () => {
    expect(formatFileSize(0, false)).toBe('0 B');
    expect(formatFileSize(512, false)).toBe('512 B');
    expect(formatFileSize(1024, false)).toBe('1 KB');
    expect(formatFileSize(1536, false)).toBe('1.5 KB');
    expect(formatFileSize(1024 * 1024, false)).toBe('1 MB');
    expect(formatFileSize(1024 * 1024 * 1.5, false)).toBe('1.5 MB');
  });

  it('超过 1024 进位到下一个单位，最多两位小数', () => {
    expect(formatFileSize(1234567, false)).toBe('1.18 MB');
    expect(formatFileSize(1024 ** 4, false)).toBe('1 TB');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const ago = (seconds: number) =>
    formatRelativeTime(new Date(now - seconds * 1000).toISOString(), now);

  /**
   * 期望值取自真实 dayjs（zh-cn + relativeTime）在同一基准时刻的输出：
   * 参照的这一列就是 `dayjs(modified_at).fromNow()`，档位与串必须逐字一致。
   */
  it('档位边界与参照（dayjs fromNow，zh-cn）逐字一致', () => {
    expect(ago(0)).toBe('几秒前');
    expect(ago(44)).toBe('几秒前');
    expect(ago(45)).toBe('1 分钟前');
    expect(ago(89)).toBe('1 分钟前');
    expect(ago(90)).toBe('2 分钟前');

    // 44.5 分钟是「N 分钟前」与「1 小时前」的分界（按分钟取差后四舍五入）
    expect(ago(2640)).toBe('44 分钟前');
    expect(ago(2669)).toBe('44 分钟前');
    expect(ago(2670)).toBe('1 小时前');
    expect(ago(5340)).toBe('1 小时前');
    expect(ago(5400)).toBe('2 小时前');

    expect(ago(75600)).toBe('21 小时前');
    expect(ago(77399)).toBe('21 小时前');
    expect(ago(77400)).toBe('1 天前');
    expect(ago(126000)).toBe('1 天前');
    expect(ago(129600)).toBe('2 天前');

    expect(ago(2160000)).toBe('25 天前');
    expect(ago(2196000)).toBe('25 天前');
    expect(ago(2246400)).toBe('1 个月前');
    expect(ago(3888000)).toBe('1 个月前');
    expect(ago(3936600)).toBe('1 个月前');
    expect(ago(3974400)).toBe('2 个月前');
    expect(ago(26784000)).toBe('10 个月前');

    expect(ago(44582400)).toBe('1 年前');
    // 540 天仍是「1 年前」：年档按日历月取整，不是拿 365 天去除
    expect(ago(46656000)).toBe('1 年前');
    expect(ago(63072000)).toBe('2 年前');
  });

  it('解析不出时间时显示 `-`；未来时间按过去处理（时钟偏差）', () => {
    expect(formatRelativeTime('', now)).toBe('-');
    expect(formatRelativeTime('not-a-date', now)).toBe('-');
    expect(formatRelativeTime(new Date(now + 60_000).toISOString(), now)).toBe(
      '几秒前',
    );
  });
});

describe('isEditableWorkspaceFile', () => {
  it('与后端 EDITABLE_WORKSPACE_SUFFIXES 同集', () => {
    expect(isEditableWorkspaceFile('/a/AGENTS.md')).toBe(true);
    expect(isEditableWorkspaceFile('/a/NOTE.txt')).toBe(true);
    expect(isEditableWorkspaceFile('/a/readme.markdown')).toBe(true);
    expect(isEditableWorkspaceFile('/a/page.mdx')).toBe(true);
    expect(isEditableWorkspaceFile('/a/p.png')).toBe(false);
    expect(isEditableWorkspaceFile('/a/noext')).toBe(false);
  });
});
