import { describe, expect, it } from 'vitest';

import {
  closeSection,
  MESSAGE_DEBUG_SECTION,
  normalizeSections,
  upsertSection,
  type PanelSection,
} from '@/features/chat/lib/panel-sections';

const section = (key: string): PanelSection => ({
  key,
  type: 'file',
  title: key,
  path: `/${key}`,
});

describe('normalizeSections', () => {
  it('丢掉没有 key 或 type 的条目', () => {
    const sections = [
      section('a'),
      { key: '', type: 'file', title: 'x' } as unknown as PanelSection,
      { key: 'b', type: '', title: 'y' } as unknown as PanelSection,
    ];

    expect(normalizeSections(sections).map((item) => item.key)).toEqual(['a']);
  });

  it('空输入得到空数组', () => {
    expect(normalizeSections(undefined)).toEqual([]);
    expect(normalizeSections(null)).toEqual([]);
  });
});

describe('upsertSection', () => {
  it('新增时追加到末尾', () => {
    expect(upsertSection([section('a')], MESSAGE_DEBUG_SECTION).map((s) => s.key))
      .toEqual(['a', 'message-debug']);
  });

  it('已存在时就地更新并保留位置', () => {
    const next = upsertSection(
      [section('a'), { ...section('b'), title: '旧标题' }],
      { ...section('b'), title: '新标题' },
    );

    expect(next.map((s) => s.key)).toEqual(['a', 'b']);
    expect(next[1]!.title).toBe('新标题');
  });
});

describe('closeSection', () => {
  it('关掉不存在的分区时原样返回', () => {
    const sections = [section('a')];
    const result = closeSection(sections, 'a', 'zzz');

    expect(result.sections).toBe(sections);
    expect(result.activeKey).toBe('a');
  });

  it('关掉的不是当前分区时选中项不动', () => {
    const result = closeSection([section('a'), section('b')], 'a', 'b');

    expect(result.sections.map((s) => s.key)).toEqual(['a']);
    expect(result.activeKey).toBe('a');
  });

  it('关掉当前分区时选中接替它位置的那一个', () => {
    const result = closeSection(
      [section('a'), section('b'), section('c')],
      'b',
      'b',
    );

    expect(result.sections.map((s) => s.key)).toEqual(['a', 'c']);
    expect(result.activeKey).toBe('c');
  });

  it('关掉最后一个时选中落到新的最后一个', () => {
    const result = closeSection([section('a'), section('b')], 'b', 'b');

    expect(result.activeKey).toBe('a');
  });

  it('全关光时选中置空', () => {
    const result = closeSection([section('a')], 'a', 'a');

    expect(result.sections).toEqual([]);
    expect(result.activeKey).toBe('');
  });
});
