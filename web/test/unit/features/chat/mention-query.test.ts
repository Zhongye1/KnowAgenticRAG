import { describe, expect, it } from 'vitest';

import type { MentionResourceItem } from '@/features/chat/lib/mention-resources';
import {
  buildMentionGroups,
  flattenMentionGroups,
  MENTION_GROUP_TITLES,
  filterMentionItems,
  groupMentionItems,
  isEmptyMentionGroups,
  MENTION_SEARCH_DEBOUNCE_MS,
  moveMentionSelection,
} from '@/features/chat/lib/mention-query';

const item = (
  type: MentionResourceItem['type'],
  label: string,
  extra: Partial<MentionResourceItem> = {},
): MentionResourceItem => ({
  value: label,
  label,
  type,
  tokenLabel: `@${type}:${label}`,
  description: '',
  ...extra,
});

describe('filterMentionItems', () => {
  it('空查询返回原列表', () => {
    const items = [item('skill', 'A'), item('skill', 'B')];

    expect(filterMentionItems(items, '')).toHaveLength(2);
    expect(filterMentionItems(items, '   ')).toHaveLength(2);
  });

  it('大小写不敏感，按标签或值匹配', () => {
    const items = [item('skill', 'Retrieve'), item('skill', 'Summary')];

    expect(filterMentionItems(items, 'retr')).toHaveLength(1);
    expect(filterMentionItems(items, 'RETR')).toHaveLength(1);
  });

  it('描述、资源 id、令牌文本与类型都能命中', () => {
    const items = [
      item('knowledge', '产品文档', {
        description: '退款流程',
        resourceId: 'kb-9',
      }),
    ];

    expect(filterMentionItems(items, '退款')).toHaveLength(1);
    expect(filterMentionItems(items, 'kb-9')).toHaveLength(1);
    expect(filterMentionItems(items, '@knowledge')).toHaveLength(1);
    expect(filterMentionItems(items, 'knowledge')).toHaveLength(1);
  });

  it('都不匹配时返回空数组', () => {
    expect(filterMentionItems([item('skill', 'A')], 'zzz')).toEqual([]);
  });
});

describe('groupMentionItems', () => {
  it('按类型分组，未登记类型被丢掉', () => {
    const groups = groupMentionItems([
      item('file', 'a.md'),
      item('knowledge', 'kb'),
      item('mcp', 'm'),
      item('skill', 's'),
      item('subagent', 'sub'),
      { ...item('skill', 'x'), type: 'weird' as MentionResourceItem['type'] },
    ]);

    expect(groups.files).toHaveLength(1);
    expect(groups.knowledgeBases).toHaveLength(1);
    expect(groups.mcps).toHaveLength(1);
    expect(groups.skills).toHaveLength(1);
    expect(groups.subagents).toHaveLength(1);
  });
});

describe('buildMentionGroups', () => {
  const config = [item('knowledge', '产品文档'), item('skill', '检索')];
  const files = [item('file', 'a.md'), item('file', 'b.txt')];

  it('本地文件只在有查询词时参与', () => {
    expect(buildMentionGroups('', config, files).files).toEqual([]);
    expect(buildMentionGroups('', config, files).knowledgeBases).toHaveLength(
      1,
    );
    expect(buildMentionGroups('', config, files).skills).toHaveLength(1);
  });

  it('有查询词时两边都过滤', () => {
    const groups = buildMentionGroups('检索', config, files);

    expect(groups.skills).toHaveLength(1);
    expect(groups.knowledgeBases).toEqual([]);
    expect(groups.files).toEqual([]);
  });
});

describe('isEmptyMentionGroups', () => {
  it('全空才算空', () => {
    expect(isEmptyMentionGroups(buildMentionGroups('', [], []))).toBe(true);
    expect(
      isEmptyMentionGroups(buildMentionGroups('', [item('skill', 'A')], [])),
    ).toBe(false);
  });
});

describe('moveMentionSelection', () => {
  it('越界时停在边界，不回绕', () => {
    expect(moveMentionSelection(0, 1, 3)).toBe(1);
    expect(moveMentionSelection(2, 1, 3)).toBe(2);
    expect(moveMentionSelection(0, -1, 3)).toBe(0);
  });

  it('没有候选时回到 0', () => {
    expect(moveMentionSelection(5, 1, 0)).toBe(0);
  });
});

describe('MENTION_SEARCH_DEBOUNCE_MS', () => {
  it('与参照同值', () => {
    expect(MENTION_SEARCH_DEBOUNCE_MS).toBe(250);
  });
});

describe('flattenMentionGroups', () => {
  it('按分组标题的顺序压平，下标连续', () => {
    const flat = flattenMentionGroups(
      groupMentionItems([
        item('skill', 's'),
        item('file', 'f'),
        item('knowledge', 'k'),
      ]),
    );

    expect(flat.map((entry) => entry.item.type)).toEqual([
      'file',
      'knowledge',
      'skill',
    ]);
    expect(flat.map((entry) => entry.index)).toEqual([0, 1, 2]);
  });

  it('空分组不占下标', () => {
    expect(flattenMentionGroups(groupMentionItems([]))).toEqual([]);
  });
});

describe('MENTION_GROUP_TITLES', () => {
  it('标题与参照一致', () => {
    expect(MENTION_GROUP_TITLES.map((group) => group.title)).toEqual([
      '文件',
      '知识库',
      'MCP',
      'Skills',
      'Subagents',
    ]);
  });
});
