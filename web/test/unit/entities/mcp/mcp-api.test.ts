import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  getMcpServersApiSystemMcpServersGet: vi.fn(),
  getMcpServerRouteApiSystemMcpServersSlugGet: vi.fn(),
  createMcpServerRouteApiSystemMcpServersPost: vi.fn(),
  updateMcpServerRouteApiSystemMcpServersSlugPut: vi.fn(),
  deleteMcpServerRouteApiSystemMcpServersSlugDelete: vi.fn(),
  updateMcpServerStatusRouteApiSystemMcpServersSlugStatusPut: vi.fn(),
  testMcpServerApiSystemMcpServersSlugTestPost: vi.fn(),
  getMcpServerToolsApiSystemMcpServersSlugToolsGet: vi.fn(),
  refreshMcpServerToolsApiSystemMcpServersSlugToolsRefreshPost: vi.fn(),
  toggleMcpServerToolRouteApiSystemMcpServersSlugToolsToolNameTogglePut:
    vi.fn(),
}));

vi.mock('@/shared/api/generated/sdk.gen', () => sdk);

const {
  createMcpServer,
  deleteMcpServer,
  getMcpServer,
  listMcpServers,
  listMcpServerTools,
  refreshMcpServerTools,
  setMcpServerEnabled,
  testMcpServer,
  toggleMcpServerTool,
  updateMcpServer,
} = await import('@/entities/mcp');

beforeEach(() => {
  for (const fn of Object.values(sdk)) fn.mockReset();
});

describe('listMcpServers', () => {
  it('折成界面形状；缺 slug 的条目丢掉', async () => {
    sdk.getMcpServersApiSystemMcpServersGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            slug: 'github',
            name: 'GitHub',
            description: '仓库操作',
            transport: 'streamable_http',
            url: 'https://example.com/mcp',
            headers: { Authorization: 'Bearer x' },
            timeout: 30,
            sse_read_timeout: 60,
            tags: ['vcs'],
            icon: '🐙',
            enabled: true,
            disabled_tools: ['create_issue'],
            created_by: 'system',
            created_at: '2026-10-01T00:00:00Z',
            updated_at: '2026-10-02T00:00:00Z',
            is_builtin: true,
            requires_migration: false,
          },
          { name: '没有 slug' },
        ],
      },
    });

    const servers = await listMcpServers();

    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      slug: 'github',
      name: 'GitHub',
      transport: 'streamable_http',
      headers: { Authorization: 'Bearer x' },
      timeout: 30,
      sseReadTimeout: 60,
      tags: ['vcs'],
      icon: '🐙',
      enabled: true,
      isBuiltin: true,
      requiresMigration: false,
      disabledTools: ['create_issue'],
      createdBy: 'system',
    });
  });

  it('缺可选字段时给中性默认：未启用、非内置、无标签、无超时', async () => {
    sdk.getMcpServersApiSystemMcpServersGet.mockResolvedValue({
      data: { data: [{ slug: 'bare' }] },
    });

    const [server] = await listMcpServers();

    expect(server).toEqual({
      slug: 'bare',
      name: 'bare',
      description: '',
      transport: '',
      url: '',
      headers: {},
      timeout: null,
      sseReadTimeout: null,
      tags: [],
      icon: '',
      enabled: false,
      isBuiltin: false,
      requiresMigration: false,
      disabledTools: [],
      createdBy: '',
      createdAt: null,
      updatedAt: null,
    });
  });
});

describe('getMcpServer', () => {
  it('走 slug 路径并解包 data', async () => {
    sdk.getMcpServerRouteApiSystemMcpServersSlugGet.mockResolvedValue({
      data: { success: true, data: { slug: 'github', enabled: true } },
    });

    await expect(getMcpServer('github')).resolves.toMatchObject({
      slug: 'github',
      enabled: true,
    });
    expect(
      sdk.getMcpServerRouteApiSystemMcpServersSlugGet,
    ).toHaveBeenCalledWith({ path: { slug: 'github' } });
  });
});

describe('createMcpServer', () => {
  it('只发后端接受的键；空描述/空标签/空图标发 null', async () => {
    sdk.createMcpServerRouteApiSystemMcpServersPost.mockResolvedValue({
      data: { data: { slug: 'my-mcp', enabled: false } },
    });

    await createMcpServer({
      slug: 'my-mcp',
      name: 'My MCP',
      transport: 'sse',
      description: '',
      url: 'https://example.com/sse',
      headers: null,
      timeout: null,
      sseReadTimeout: null,
      tags: [],
      icon: '',
    });

    expect(
      sdk.createMcpServerRouteApiSystemMcpServersPost,
    ).toHaveBeenCalledWith({
      body: {
        slug: 'my-mcp',
        name: 'My MCP',
        transport: 'sse',
        description: null,
        url: 'https://example.com/sse',
        headers: null,
        timeout: null,
        sse_read_timeout: null,
        tags: null,
        icon: null,
      },
    });
  });
});

describe('updateMcpServer', () => {
  it('不带 slug（后端 UpdateMcpServerRequest 是 extra=forbid）', async () => {
    sdk.updateMcpServerRouteApiSystemMcpServersSlugPut.mockResolvedValue({
      data: { data: { slug: 'github', enabled: true } },
    });

    await updateMcpServer('github', {
      name: 'GitHub 2',
      transport: 'streamable_http',
      tags: ['vcs'],
    });

    expect(
      sdk.updateMcpServerRouteApiSystemMcpServersSlugPut,
    ).toHaveBeenCalledWith({
      path: { slug: 'github' },
      body: {
        name: 'GitHub 2',
        transport: 'streamable_http',
        tags: ['vcs'],
      },
    });
  });
});

describe('setMcpServerEnabled / testMcpServer / deleteMcpServer', () => {
  it('启停带 enabled 与后端文案', async () => {
    sdk.updateMcpServerStatusRouteApiSystemMcpServersSlugStatusPut.mockResolvedValue(
      {
        data: { success: true, enabled: true, message: "MCP 'github' 已添加" },
      },
    );

    await expect(setMcpServerEnabled('github', true)).resolves.toEqual({
      enabled: true,
      message: "MCP 'github' 已添加",
    });
    expect(
      sdk.updateMcpServerStatusRouteApiSystemMcpServersSlugStatusPut,
    ).toHaveBeenCalledWith({
      path: { slug: 'github' },
      body: { enabled: true },
    });
  });

  it('测试连接返回发现的工具数', async () => {
    sdk.testMcpServerApiSystemMcpServersSlugTestPost.mockResolvedValue({
      data: {
        success: true,
        tool_count: 7,
        message: '连接成功，共发现 7 个工具',
      },
    });

    await expect(testMcpServer('github')).resolves.toEqual({
      toolCount: 7,
      message: '连接成功，共发现 7 个工具',
    });
  });

  it('删除失败时抛后端的 detail', async () => {
    sdk.deleteMcpServerRouteApiSystemMcpServersSlugDelete.mockResolvedValue({
      error: { detail: '系统内置的 MCP 服务器无法删除' },
      response: { status: 403 },
    });

    await expect(deleteMcpServer('github')).rejects.toThrow(
      '系统内置的 MCP 服务器无法删除',
    );
  });
});

describe('listMcpServerTools', () => {
  it('归一参数表与必填表，缺 enabled 视为启用', async () => {
    sdk.getMcpServerToolsApiSystemMcpServersSlugToolsGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            name: 'search',
            id: 'github.search',
            description: '搜索',
            enabled: false,
            parameters: {
              query: { type: 'string', description: '检索词' },
              top_k: { type: 'integer' },
            },
            required: ['query'],
          },
          { name: 'plain' },
          { description: '没有 name' },
        ],
      },
    });

    await expect(listMcpServerTools('github')).resolves.toEqual([
      {
        name: 'search',
        id: 'github.search',
        description: '搜索',
        enabled: false,
        parameters: {
          query: { type: 'string', description: '检索词' },
          top_k: { type: 'integer', description: '' },
        },
        required: ['query'],
      },
      {
        name: 'plain',
        id: 'plain',
        description: '',
        enabled: true,
        parameters: {},
        required: [],
      },
    ]);
  });
});

describe('refreshMcpServerTools / toggleMcpServerTool', () => {
  it('刷新返回后端统计文案', async () => {
    sdk.refreshMcpServerToolsApiSystemMcpServersSlugToolsRefreshPost.mockResolvedValue(
      { data: { success: true, message: '工具列表已刷新，共发现 3 个工具' } },
    );

    await expect(refreshMcpServerTools('github')).resolves.toEqual({
      message: '工具列表已刷新，共发现 3 个工具',
    });
  });

  it('启停单个工具走 name 路径', async () => {
    sdk.toggleMcpServerToolRouteApiSystemMcpServersSlugToolsToolNameTogglePut.mockResolvedValue(
      {
        data: {
          success: true,
          tool_name: 'search',
          enabled: false,
          message: "工具 'search' 已禁用",
        },
      },
    );

    await expect(toggleMcpServerTool('github', 'search')).resolves.toEqual({
      enabled: false,
      message: "工具 'search' 已禁用",
    });
    expect(
      sdk.toggleMcpServerToolRouteApiSystemMcpServersSlugToolsToolNameTogglePut,
    ).toHaveBeenCalledWith({
      path: { slug: 'github', tool_name: 'search' },
    });
  });
});
