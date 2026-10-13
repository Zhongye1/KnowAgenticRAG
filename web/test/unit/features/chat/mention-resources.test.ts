import { describe, expect, it } from 'vitest';

import {
  buildMentionFileItems,
  buildMentionResourceItems,
} from '@/features/chat/lib/mention-resources';

describe('buildMentionResourceItems', () => {
  it('知识库用名称当值与展示名，并带上 kb_id', () => {
    expect(
      buildMentionResourceItems({
        knowledgeBases: [{ kb_id: 'kb-1', name: '产品文档', description: '说明' }],
      }).knowledgeBases,
    ).toEqual([
      {
        value: '产品文档',
        label: '产品文档',
        type: 'knowledge',
        tokenLabel: '@knowledge:产品文档',
        description: '说明',
        resourceId: 'kb-1',
      },
    ]);
  });

  it('MCP 与技能按 slug 优先取值，展示名优先用 name', () => {
    const items = buildMentionResourceItems({
      mcps: [{ id: 'm-1', slug: 'github', name: 'GitHub' }],
      skills: [{ id: 's-1', slug: 'retrieve', label: '检索技能' }],
    });

    expect(items.mcps[0]).toMatchObject({
      value: 'github',
      label: 'GitHub',
      type: 'mcp',
      tokenLabel: '@mcp:GitHub',
    });
    expect(items.skills[0]).toMatchObject({
      value: 'retrieve',
      label: '检索技能',
      tokenLabel: '@skill:检索技能',
    });
  });

  it('子智能体按 id 优先取值', () => {
    expect(
      buildMentionResourceItems({ subagents: [{ id: 'a-1', name: '研究员' }] })
        .subagents[0],
    ).toMatchObject({ value: 'a-1', label: '研究员', type: 'subagent' });
  });

  it('值里有空格时令牌加引号', () => {
    expect(
      buildMentionResourceItems({ skills: [{ slug: 'a b', name: '带 空格' }] })
        .skills[0]!.tokenLabel,
    ).toBe('@skill:"带 空格"');
  });

  it('缺标识的条目被丢掉，四类缺省都是空数组', () => {
    expect(buildMentionResourceItems().knowledgeBases).toEqual([]);
    expect(
      buildMentionResourceItems({ skills: [{}, { name: '有名字' }] }).skills,
    ).toHaveLength(1);
  });
});

describe('buildMentionFileItems', () => {
  it('目录不可提及，被丢掉', () => {
    const items = buildMentionFileItems([
      { name: 'src', path: '/src', is_dir: true },
      { name: 'a.md', path: '/a.md', is_dir: false },
    ]);

    expect(items).toEqual([
      {
        value: '/a.md',
        label: 'a.md',
        type: 'file',
        tokenLabel: '@file:/a.md',
        description: '',
      },
    ]);
  });

  it('路径缺失时退到文件名，两者都缺时丢掉', () => {
    expect(buildMentionFileItems([{ name: 'a.md' }])[0]!.value).toBe('a.md');
    expect(buildMentionFileItems([{}])).toEqual([]);
    expect(buildMentionFileItems(undefined)).toEqual([]);
  });
});
