import { describe, expect, it } from 'vitest';

import type { McpServer } from '@/entities/mcp';
import {
  filterMcpServers,
  formatMcpHeaders,
  isMcpRemoveAction,
  mcpActionLabel,
  mcpFormFromServer,
  parseMcpHeaders,
  sortMcpServers,
  splitMcpServers,
  validateMcpForm,
  type McpFormValues,
} from '@/features/mcp/lib/mcp-view';

const server = (overrides: Partial<McpServer> = {}): McpServer => ({
  slug: 'github',
  name: 'GitHub',
  description: '仓库操作',
  transport: 'streamable_http',
  url: 'https://example.com/mcp',
  headers: {},
  timeout: null,
  sseReadTimeout: null,
  tags: [],
  icon: '',
  enabled: true,
  isBuiltin: false,
  requiresMigration: false,
  disabledTools: [],
  createdBy: 'system',
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

describe('mcpActionLabel', () => {
  it('需迁移的只能删；未启用的可添加；内置的从配置里移除；其余删除', () => {
    expect(mcpActionLabel(server({ requiresMigration: true }))).toBe('删除');
    expect(mcpActionLabel(server({ enabled: false }))).toBe('添加');
    expect(mcpActionLabel(server({ isBuiltin: true }))).toBe('移除');
    expect(mcpActionLabel(server())).toBe('删除');
  });

  it('未启用的卡片动作是「添加」，不算危险操作', () => {
    expect(isMcpRemoveAction(server({ enabled: false }))).toBe(false);
    expect(isMcpRemoveAction(server())).toBe(true);
    expect(isMcpRemoveAction(server({ requiresMigration: true }))).toBe(true);
  });
});

describe('sortMcpServers / filterMcpServers / splitMcpServers', () => {
  it('按名称排序（数字按数值、忽略大小写）', () => {
    const sorted = sortMcpServers([
      server({ slug: 'c', name: 'github' }),
      server({ slug: 'a', name: 'Alpha' }),
      server({ slug: 'b', name: 'GitHub 10' }),
      server({ slug: 'd', name: 'GitHub 2' }),
    ]);

    expect(sorted.map((item) => item.name)).toEqual([
      'Alpha',
      'github',
      'GitHub 2',
      'GitHub 10',
    ]);
  });

  it('搜索匹配名称与描述，大小写不敏感', () => {
    const servers = [
      server({ slug: 'a', name: 'GitHub' }),
      server({ slug: 'b', name: 'Slack', description: '团队沟通' }),
    ];

    expect(filterMcpServers(servers, 'git').map((s) => s.slug)).toEqual(['a']);
    expect(filterMcpServers(servers, '团队').map((s) => s.slug)).toEqual(['b']);
    expect(filterMcpServers(servers, '  ')).toHaveLength(2);
  });

  it('按启用状态分两组', () => {
    const { enabled, disabled } = splitMcpServers([
      server({ slug: 'a', enabled: true }),
      server({ slug: 'b', enabled: false }),
      server({ slug: 'c', enabled: true }),
    ]);

    expect(enabled.map((s) => s.slug)).toEqual(['a', 'c']);
    expect(disabled.map((s) => s.slug)).toEqual(['b']);
  });
});

describe('parseMcpHeaders / formatMcpHeaders', () => {
  it('空串给 null（不发额外请求头）', () => {
    expect(parseMcpHeaders('   ')).toEqual({ headers: null, error: null });
  });

  it('合法 JSON 对象解析成对象', () => {
    expect(parseMcpHeaders('{"Authorization": "Bearer x"}')).toEqual({
      headers: { Authorization: 'Bearer x' },
      error: null,
    });
  });

  it('格式错误与「不是对象」分别给出可行动文案', () => {
    expect(parseMcpHeaders('{oops').error).toBe('请求头 JSON 格式错误');
    expect(parseMcpHeaders('[1,2]').error).toBe('请求头必须是 JSON 对象');
    expect(parseMcpHeaders('"text"').error).toBe('请求头必须是 JSON 对象');
  });

  it('对象 → 文本再解析回来是同一份', () => {
    const headers = { Authorization: 'Bearer x', 'X-Trace': '1' };

    expect(parseMcpHeaders(formatMcpHeaders(headers)).headers).toEqual(headers);
    expect(formatMcpHeaders({})).toBe('');
  });
});

describe('mcpFormFromServer', () => {
  it('带出已保存值，请求头转成 JSON 文本', () => {
    const form = mcpFormFromServer(
      server({
        headers: { Authorization: 'Bearer x' },
        timeout: 30,
        sseReadTimeout: 60,
        tags: ['vcs'],
        icon: '🐙',
      }),
    );

    expect(form).toEqual({
      slug: 'github',
      name: 'GitHub',
      description: '仓库操作',
      transport: 'streamable_http',
      url: 'https://example.com/mcp',
      headersText: '{\n  "Authorization": "Bearer x"\n}',
      timeout: 30,
      sseReadTimeout: 60,
      tags: ['vcs'],
      icon: '🐙',
    });
  });

  it('缺传输类型时退到 streamable_http（后端只接受两种 HTTP 传输）', () => {
    expect(mcpFormFromServer(server({ transport: '' })).transport).toBe(
      'streamable_http',
    );
  });
});

const baseForm: McpFormValues = {
  slug: 'my-mcp',
  name: 'My MCP',
  description: '',
  transport: 'streamable_http',
  url: 'https://example.com/mcp',
  headersText: '',
  timeout: null,
  sseReadTimeout: null,
  tags: [],
  icon: '',
};

describe('validateMcpForm', () => {
  it('新建校验标识；编辑跳过（标识由后端持有、界面只读）', () => {
    expect(
      validateMcpForm({ ...baseForm, slug: '  ' }, { editing: false }),
    ).toBe('MCP 标识不能为空');
    expect(
      validateMcpForm({ ...baseForm, slug: '' }, { editing: true }),
    ).toBeNull();
  });

  it('名称必填', () => {
    expect(
      validateMcpForm({ ...baseForm, name: ' ' }, { editing: false }),
    ).toBe('MCP 名称不能为空');
  });

  it('HTTP 传输必须填 URL', () => {
    expect(validateMcpForm({ ...baseForm, url: '' }, { editing: false })).toBe(
      'HTTP 类型必须填写 MCP URL',
    );
  });

  it('请求头格式错误在提交前拦下', () => {
    expect(
      validateMcpForm(
        { ...baseForm, headersText: '{oops' },
        { editing: false },
      ),
    ).toBe('请求头 JSON 格式错误');
  });

  it('合法表单通过', () => {
    expect(validateMcpForm(baseForm, { editing: false })).toBeNull();
  });
});
