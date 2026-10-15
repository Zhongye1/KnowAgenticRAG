/**
 * 个人空间页面的用例。
 *
 * 只 mock 数据层（`@/entities/workspace`）与两个全局出口（通知、确认框）：控制器、格式化与
 * 渲染都真实跑一遍。覆盖页面自己拥有的行为——页头与「使用说明」的出现条件、面包屑与行、
 * 删除确认的三段文案、内联预览与窄屏模态的切换。
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileEntry } from '@/shared/lib/files/filesystem-entry';

const rows: FileEntry[] = [
  {
    path: '/agents/',
    name: 'agents',
    isDir: true,
    size: 0,
    modifiedAt: '2026-10-11T20:11:34Z',
  },
  {
    path: '/agents/AGENTS.md',
    name: 'AGENTS.md',
    isDir: false,
    size: 54,
    modifiedAt: '2026-10-01T16:40:21Z',
  },
];

const workspace = vi.hoisted(() => ({
  listWorkspaceEntries: vi.fn(),
  fetchWorkspaceFile: vi.fn(),
  saveWorkspaceFile: vi.fn(),
  deleteWorkspaceEntry: vi.fn(),
  createWorkspaceDirectory: vi.fn(),
  uploadWorkspaceFiles: vi.fn(),
  downloadWorkspaceEntry: vi.fn(),
  searchWorkspaceEntries: vi.fn(),
}));

vi.mock('@/entities/workspace', () => ({
  ...workspace,
  useWorkspaceEntries: () => ({
    entries: workspaceState.entries,
    isLoading: workspaceState.loading,
    isFetching: false,
    error: null,
    refetch: () => undefined,
  }),
  useWorkspaceSearch: () => ({ entries: [], isLoading: false, error: null }),
  useCreateWorkspaceDirectory: () => ({
    mutateAsync: workspace.createWorkspaceDirectory,
  }),
  useDeleteWorkspaceEntry: () => ({
    mutateAsync: workspace.deleteWorkspaceEntry,
  }),
  useSaveWorkspaceFile: () => ({ mutateAsync: workspace.saveWorkspaceFile }),
  useUploadWorkspaceFiles: () => ({
    mutateAsync: workspace.uploadWorkspaceFiles,
  }),
}));

const workspaceState: { entries: FileEntry[]; loading: boolean } = {
  entries: [],
  loading: false,
};

const ui = vi.hoisted(() => ({
  confirm: vi.fn(),
  addNotification: vi.fn(),
}));

vi.mock('@/shared/ui/notifications', () => ({
  useNotifications: () => ({ addNotification: ui.addNotification }),
}));
vi.mock('@/shared/ui/confirm-dialog', () => ({
  useConfirm: () => ({ confirm: ui.confirm }),
}));

const { WorkspacePage } = await import('@/pages/workspace');

/** jsdom 的 clientWidth 恒为 0：内联预览要用真实宽度，只能在这里给一个值。 */
const withMainWidth = (width: number) => {
  const spy = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockReturnValue(width);
  return () => spy.mockRestore();
};

beforeEach(() => {
  workspaceState.entries = [];
  workspaceState.loading = false;
  for (const fn of Object.values(workspace)) fn.mockReset();
  ui.confirm.mockReset();
  ui.addNotification.mockReset();
  ui.confirm.mockResolvedValue(false);
});

describe('页面装配', () => {
  it('渲染页头、侧栏与文件表；根目录时不出现「使用说明」', () => {
    render(<WorkspacePage />);

    expect(
      screen.getByRole('heading', { name: '个人空间' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /搜索/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '个人空间' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '智能体文件' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /使用说明/ }),
    ).not.toBeInTheDocument();
  });

  it('数据层就绪后列出条目，行显示大小与相对时间', () => {
    workspaceState.entries = rows;
    render(<WorkspacePage />);

    const table = screen.getByRole('table');
    expect(within(table).getByText('agents')).toBeInTheDocument();
    expect(within(table).getByText('AGENTS.md')).toBeInTheDocument();
    expect(within(table).getByText('54 B')).toBeInTheDocument();
    expect(screen.getByText('2 项')).toBeInTheDocument();
  });

  it('空目录给「当前文件夹为空」', () => {
    render(<WorkspacePage />);

    expect(screen.getByText('当前文件夹为空')).toBeInTheDocument();
  });

  it('进入 /agents 才出现「使用说明」', async () => {
    workspaceState.entries = rows;
    const user = userEvent.setup();
    render(<WorkspacePage />);

    await user.click(screen.getByRole('button', { name: '智能体文件' }));

    expect(
      screen.getByRole('button', { name: /使用说明/ }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('table')).getByText('agents'),
    ).toBeInTheDocument();
  });
});

describe('删除确认', () => {
  it('文件夹用「确认删除文件夹」与不可恢复的说明', async () => {
    workspaceState.entries = rows;
    const user = userEvent.setup();
    render(<WorkspacePage />);

    await user.click(screen.getByRole('button', { name: 'agents 更多操作' }));
    await user.click(await screen.findByText('删除'));

    expect(ui.confirm).toHaveBeenCalledWith({
      title: '确认删除文件夹「agents」？',
      description: '将删除文件夹及其所有内容，删除后不可恢复。',
      confirmText: '删除',
      destructive: true,
    });
    // 确认框返回 false（用例默认）：不发删除请求
    expect(workspace.deleteWorkspaceEntry).not.toHaveBeenCalled();
  });

  it('文件用「确认删除文件」与短说明；确认后按路径删', async () => {
    workspaceState.entries = rows;
    ui.confirm.mockResolvedValue(true);
    workspace.deleteWorkspaceEntry.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<WorkspacePage />);

    await user.click(
      screen.getByRole('button', { name: 'AGENTS.md 更多操作' }),
    );
    await user.click(await screen.findByText('删除'));

    expect(ui.confirm).toHaveBeenCalledWith({
      title: '确认删除文件「AGENTS.md」？',
      description: '删除后不可恢复。',
      confirmText: '删除',
      destructive: true,
    });
    await waitFor(() =>
      expect(workspace.deleteWorkspaceEntry).toHaveBeenCalledWith({
        path: '/agents/AGENTS.md',
      }),
    );
  });
});

describe('预览形态', () => {
  it('内容区宽于 960px 时内联预览（有分隔条，不走模态）', async () => {
    const restore = withMainWidth(1200);
    workspaceState.entries = rows;
    workspace.fetchWorkspaceFile.mockResolvedValue({
      path: '/agents/AGENTS.md',
      name: 'AGENTS.md',
      status: 'ready',
      previewType: 'markdown',
      supported: true,
      content: '# AGENTS',
      previewUrl: '',
      message: '',
      truncated: false,
    });
    const user = userEvent.setup();
    try {
      render(<WorkspacePage />);
      await user.click(screen.getByText('AGENTS.md'));

      expect(
        await screen.findByRole('separator', { name: '调整预览宽度' }),
      ).toBeInTheDocument();
      expect(document.querySelector('.ant-modal')).toBeNull();
    } finally {
      restore();
    }
  });

  it('内容区不足 960px 时预览进模态', async () => {
    const restore = withMainWidth(600);
    workspaceState.entries = rows;
    workspace.fetchWorkspaceFile.mockResolvedValue({
      path: '/agents/AGENTS.md',
      name: 'AGENTS.md',
      status: 'ready',
      previewType: 'markdown',
      supported: true,
      content: '# AGENTS',
      previewUrl: '',
      message: '',
      truncated: false,
    });
    const user = userEvent.setup();
    try {
      render(<WorkspacePage />);
      await user.click(screen.getByText('AGENTS.md'));

      expect(await screen.findByText('/agents/AGENTS.md')).toBeInTheDocument();
      expect(document.querySelector('.ant-modal')).not.toBeNull();
      expect(
        screen.queryByRole('separator', { name: '调整预览宽度' }),
      ).toBeNull();
    } finally {
      restore();
    }
  });
});
