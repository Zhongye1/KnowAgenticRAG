import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AntdProvider } from '@/app/theme/antd-provider';
import type { McpServer } from '@/entities/mcp';

/**
 * MCP 面板：渲染真实组件，只把实体层、确认框与路由跳转换成桩。
 *
 * 覆盖两组分区、卡片动作的三态分流（内置只能停用、其余真删除、未启用的添加）、未启用卡片
 * 先看简介、以及搜索过滤。
 */
const mocks = vi.hoisted(() => ({
  servers: [] as McpServer[],
  isLoading: false,
  refetch: vi.fn(),
  setEnabled: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/entities/mcp', () => ({
  useMcpServers: () => ({
    servers: mocks.servers,
    isLoading: mocks.isLoading,
    isFetching: false,
    error: null,
    refetch: mocks.refetch,
  }),
  useSetMcpServerEnabled: () => ({
    mutateAsync: mocks.setEnabled,
    isPending: false,
  }),
  useDeleteMcpServer: () => ({ mutateAsync: mocks.remove, isPending: false }),
  useCreateMcpServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMcpServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/shared/ui/confirm-dialog', () => ({
  useConfirm: () => ({ confirm: mocks.confirm }),
}));

const { McpCardList } = await import('@/features/mcp');

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
  icon: '🐙',
  enabled: true,
  isBuiltin: false,
  requiresMigration: false,
  disabledTools: [],
  createdBy: 'system',
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

const renderPanel = () =>
  render(
    <AntdProvider>
      <McpCardList notifySuccess={vi.fn()} notifyError={vi.fn()} />
    </AntdProvider>,
  );

beforeEach(() => {
  mocks.servers = [
    server({ slug: 'github', name: 'GitHub', enabled: true }),
    server({ slug: 'slack', name: 'Slack', enabled: false }),
  ];
  mocks.isLoading = false;
  mocks.refetch.mockReset();
  mocks.setEnabled
    .mockReset()
    .mockResolvedValue({ enabled: true, message: '' });
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.navigate.mockReset();
});

describe('分组与渲染', () => {
  it('按启用状态分成「已添加」与「可添加」', () => {
    renderPanel();

    expect(screen.getByText('已添加')).toBeTruthy();
    expect(screen.getByText('可添加')).toBeTruthy();
    // 标题格式化：GitHub → Github
    expect(screen.getByText('Github')).toBeTruthy();
    expect(screen.getByText('Slack')).toBeTruthy();
  });

  it('两组都为空时给空态', () => {
    mocks.servers = [];
    renderPanel();

    expect(screen.getByText('暂无 MCP，点击上方按钮添加。')).toBeTruthy();
  });

  it('搜索无命中时给匹配空态', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('搜索 MCP'), 'zzz');

    expect(screen.getByText('无匹配 MCP。换个关键词试试。')).toBeTruthy();
  });
});

describe('卡片动作', () => {
  it('已启用的普通 MCP：确认后真删除', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByLabelText('删除 GitHub'));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('github'));
    expect(mocks.setEnabled).not.toHaveBeenCalled();
  });

  it('已启用的内置 MCP：只停用，不进删除接口', async () => {
    const user = userEvent.setup();
    mocks.servers = [
      server({ slug: 'builtin', name: '内置 MCP', isBuiltin: true }),
    ];
    renderPanel();

    await user.click(screen.getByLabelText('移除 内置 MCP'));

    await waitFor(() =>
      expect(mocks.setEnabled).toHaveBeenCalledWith({
        slug: 'builtin',
        enabled: false,
      }),
    );
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('未启用的 MCP：直接添加', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByLabelText('添加 Slack'));

    await waitFor(() =>
      expect(mocks.setEnabled).toHaveBeenCalledWith({
        slug: 'slack',
        enabled: true,
      }),
    );
  });

  it('需迁移的历史 stdio MCP：只能删，绝不发启停', async () => {
    const user = userEvent.setup();
    // 后端对需迁移的记录一律带 enabled:false，因此「未启用 → 添加」的分支必须排除它
    mocks.servers = [
      server({
        slug: 'legacy',
        name: 'Legacy',
        enabled: false,
        requiresMigration: true,
      }),
    ];
    renderPanel();

    await user.click(screen.getByLabelText('删除 Legacy'));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('legacy'));
    expect(mocks.setEnabled).not.toHaveBeenCalled();
  });

  it('取消确认框就不发删除请求', async () => {
    const user = userEvent.setup();
    mocks.confirm.mockResolvedValue(false);
    renderPanel();

    await user.click(screen.getByLabelText('删除 GitHub'));

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe('卡片点击', () => {
  it('已启用的进详情页', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText('Github'));

    expect(mocks.navigate).toHaveBeenCalledWith('/extensions/mcp/github');
  });

  it('未启用的先看简介，简介里可以添加', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText('Slack'));

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(await screen.findByText('创建人')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '添加' }));
    await waitFor(() =>
      expect(mocks.setEnabled).toHaveBeenCalledWith({
        slug: 'slack',
        enabled: true,
      }),
    );
  });

  it('需迁移的历史 stdio MCP 直接进详情页，不进简介', async () => {
    const user = userEvent.setup();
    mocks.servers = [
      server({
        slug: 'legacy',
        name: 'Legacy',
        enabled: false,
        requiresMigration: true,
      }),
    ];
    renderPanel();

    await user.click(screen.getByText('Legacy'));

    expect(mocks.navigate).toHaveBeenCalledWith('/extensions/mcp/legacy');
  });
});
