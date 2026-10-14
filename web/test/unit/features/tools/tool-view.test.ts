import { describe, expect, it } from 'vitest';

import type { Tool } from '@/entities/tool';
import {
  filterTools,
  toolCardTags,
  toolCategoryLabel,
  toolCategoryOptions,
} from '@/features/tools/lib/tool-view';

const tool = (overrides: Partial<Tool> = {}): Tool => ({
  slug: 'web_search',
  name: '联网搜索',
  description: '搜索互联网',
  category: 'buildin',
  tags: ['检索'],
  configGuide: '',
  args: [],
  ...overrides,
});

describe('toolCategoryLabel', () => {
  it('已知分类给中文名，未登记的按原始键显示', () => {
    expect(toolCategoryLabel('buildin')).toBe('内置工具');
    expect(toolCategoryLabel('knowledge')).toBe('知识库');
    expect(toolCategoryLabel('custom')).toBe('custom');
  });
});

describe('toolCardTags', () => {
  it('分类在最前，其余标签最多两个', () => {
    expect(toolCardTags(tool({ tags: ['a', 'b', 'c'] }))).toEqual([
      '内置工具',
      'a',
      'b',
    ]);
  });

  it('没有分类时只留标签', () => {
    expect(toolCardTags(tool({ category: '', tags: ['a'] }))).toEqual(['a']);
  });

  it('分类名与标签同名时只画一次（参照会渲染两个同名标签）', () => {
    expect(
      toolCardTags(tool({ category: 'knowledge', tags: ['知识库', '检索'] })),
    ).toEqual(['知识库', '检索']);
  });
});

describe('toolCategoryOptions', () => {
  it('从数据里实际出现的分类推导，按中文名排序', () => {
    const options = toolCategoryOptions([
      tool({ category: 'mysql' }),
      tool({ category: 'buildin' }),
      tool({ category: 'mysql' }),
      tool({ category: 'debug' }),
    ]);

    expect(options).toEqual([
      { value: 'debug', label: '调试' },
      { value: 'buildin', label: '内置工具' },
      { value: 'mysql', label: 'MySQL' },
    ]);
  });

  it('没有工具时给空表（不出现写死的分类）', () => {
    expect(toolCategoryOptions([])).toEqual([]);
  });
});

describe('filterTools', () => {
  const tools = [
    tool({ slug: 'web_search', name: '联网搜索', category: 'buildin' }),
    tool({
      slug: 'mysql_query',
      name: 'MySQL 查询',
      description: '执行只读 SQL',
      category: 'mysql',
    }),
    tool({
      slug: 'graph_lookup',
      name: '图谱检索',
      category: 'knowledge',
      configGuide: '需要 Neo4j',
    }),
  ];

  it('分类筛选优先于关键词', () => {
    expect(filterTools(tools, { keyword: '检索', category: 'mysql' })).toEqual(
      [],
    );
    expect(
      filterTools(tools, { keyword: '', category: 'knowledge' }).map(
        (item) => item.slug,
      ),
    ).toEqual(['graph_lookup']);
  });

  it('关键词匹配名称、slug、描述与配置说明', () => {
    expect(
      filterTools(tools, { keyword: 'mysql_query', category: '' }).map(
        (item) => item.slug,
      ),
    ).toEqual(['mysql_query']);
    expect(
      filterTools(tools, { keyword: '只读', category: '' }).map(
        (item) => item.slug,
      ),
    ).toEqual(['mysql_query']);
    expect(
      filterTools(tools, { keyword: 'neo4j', category: '' }).map(
        (item) => item.slug,
      ),
    ).toEqual(['graph_lookup']);
  });

  it('空筛选返回全部', () => {
    expect(filterTools(tools, { keyword: '  ', category: '' })).toHaveLength(3);
  });
});
