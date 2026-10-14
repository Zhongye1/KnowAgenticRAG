import { describe, expect, it } from 'vitest';

import { toFileEntries, toFileEntry } from '@/shared/lib/filesystem-entry';

describe('toFileEntry', () => {
  it('读接口下发的 snake_case 字段', () => {
    expect(
      toFileEntry({
        path: '/agents/',
        name: 'agents',
        is_dir: true,
        size: 0,
        modified_at: '2026-10-11T20:11:34Z',
      }),
    ).toEqual({
      path: '/agents/',
      name: 'agents',
      isDir: true,
      size: 0,
      modifiedAt: '2026-10-11T20:11:34Z',
    });
  });

  it('缺 path 的条目丢掉：它既不能当节点键也不能预览', () => {
    expect(toFileEntry({ name: 'ghost' })).toBeNull();
    expect(toFileEntry({ path: '   ' })).toBeNull();
    expect(toFileEntry(null)).toBeNull();
    expect(toFileEntry('agents/')).toBeNull();
  });

  it('is_dir 只有严格 true 才算目录：字符串 "true" 不当目录', () => {
    expect(toFileEntry({ path: '/a', is_dir: 'true' })?.isDir).toBe(false);
    expect(toFileEntry({ path: '/a', is_dir: 1 })?.isDir).toBe(false);
  });

  it('size 不是有限数时落 0，时间不是文本时落空串', () => {
    expect(toFileEntry({ path: '/a', size: Number.NaN })?.size).toBe(0);
    expect(toFileEntry({ path: '/a', size: '12' })?.size).toBe(0);
    expect(
      toFileEntry({ path: '/a', modified_at: 1699999999 })?.modifiedAt,
    ).toBe('');
  });
});

describe('toFileEntries', () => {
  it('只取 entries 数组；坏条目被跳过而不是让整份列表失败', () => {
    expect(
      toFileEntries({
        entries: [
          { path: '/a', name: 'a' },
          null,
          { name: 'no-path' },
          { path: '/b/', name: 'b', is_dir: true },
        ],
      }),
    ).toEqual([
      { path: '/a', name: 'a', isDir: false, size: 0, modifiedAt: '' },
      { path: '/b/', name: 'b', isDir: true, size: 0, modifiedAt: '' },
    ]);
  });

  it('响应形状不对时给空数组', () => {
    expect(toFileEntries(null)).toEqual([]);
    expect(toFileEntries({ entries: 'nope' })).toEqual([]);
    expect(toFileEntries({ entries: [] })).toEqual([]);
  });
});
