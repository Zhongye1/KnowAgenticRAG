import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  listToolsApiSystemToolsGet: vi.fn(),
}));

vi.mock('@/shared/api/generated/sdk.gen', () => sdk);

const { listTools } = await import('@/entities/tool');

beforeEach(() => {
  for (const fn of Object.values(sdk)) fn.mockReset();
});

describe('listTools', () => {
  it('把后端的 snake_case 折成界面形状，参数表逐条归一', async () => {
    sdk.listToolsApiSystemToolsGet.mockResolvedValue({
      data: {
        data: [
          {
            slug: 'web_search',
            name: '联网搜索',
            description: '搜索互联网',
            category: 'buildin',
            tags: ['检索'],
            config_guide: '需要配置搜索密钥',
            args: [
              { name: 'query', type: 'string', description: '检索词' },
              { name: 'top_k', type: 'integer' },
            ],
          },
        ],
      },
    });

    await expect(listTools()).resolves.toEqual([
      {
        slug: 'web_search',
        name: '联网搜索',
        description: '搜索互联网',
        category: 'buildin',
        tags: ['检索'],
        configGuide: '需要配置搜索密钥',
        args: [
          { name: 'query', type: 'string', description: '检索词' },
          { name: 'top_k', type: 'integer', description: '' },
        ],
      },
    ]);
  });

  it('缺 slug 的条目丢掉，缺分类按 buildin，缺 args 按空表', async () => {
    sdk.listToolsApiSystemToolsGet.mockResolvedValue({
      data: {
        data: [
          { name: '没有 slug' },
          { slug: 'mysql_query', name: 'MySQL 查询' },
          { slug: 'bad_args', args: 'not-an-array' },
        ],
      },
    });

    const tools = await listTools();

    expect(tools.map((tool) => tool.slug)).toEqual(['mysql_query', 'bad_args']);
    expect(tools[0].category).toBe('buildin');
    expect(tools[0].tags).toEqual([]);
    expect(tools[0].args).toEqual([]);
    expect(tools[1].args).toEqual([]);
  });

  it('响应不是 `{data: []}` 时给空列表', async () => {
    sdk.listToolsApiSystemToolsGet.mockResolvedValue({ data: { data: null } });

    await expect(listTools()).resolves.toEqual([]);
  });
});
