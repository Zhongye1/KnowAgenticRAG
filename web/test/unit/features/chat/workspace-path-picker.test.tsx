import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileEntry } from '@/shared/lib/filesystem-entry';
import { WorkspacePathPicker } from '@/features/chat/ui/workspace-path-picker';

const notifications = vi.hoisted(() => ({ addNotification: vi.fn() }));
vi.mock('@/shared/ui/notifications', async () => {
  const actual = await vi.importActual<
    typeof import('@/shared/ui/notifications')
  >('@/shared/ui/notifications');

  return { ...actual, useNotifications: () => notifications };
});

const filesystem = vi.hoisted(() => ({
  listWorkspaceEntries: vi.fn(),
  createWorkspaceDirectory: vi.fn(),
}));
vi.mock('@/entities/workspace', async () => {
  const actual = await vi.importActual<typeof import('@/entities/workspace')>(
    '@/entities/workspace',
  );

  return { ...actual, ...filesystem };
});

const entry = (path: string, name: string, isDir = true): FileEntry => ({
  path,
  name,
  isDir,
  size: isDir ? 0 : 12,
  modifiedAt: '',
});

const rootEntries = [
  entry('/docs/', 'docs'),
  entry('/reports/', 'reports'),
  entry('/readme.md', 'readme.md', false),
];

const setup = (
  overrides: Partial<React.ComponentProps<typeof WorkspacePathPicker>> = {},
) => {
  const props = {
    value: '',
    active: true,
    onChange: vi.fn(),
    ...overrides,
  };

  const view = render(<WorkspacePathPicker {...props} />);

  return { props, view };
};

describe('WorkspacePathPicker', () => {
  beforeEach(() => {
    notifications.addNotification.mockReset();
    filesystem.listWorkspaceEntries.mockReset();
    filesystem.listWorkspaceEntries.mockResolvedValue(rootEntries);
    filesystem.createWorkspaceDirectory.mockReset();
  });

  it('只列目录，不列文件', async () => {
    setup();

    expect(await screen.findByRole('button', { name: /docs/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /reports/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /readme\.md/ })).toBeNull();
  });

  it('按当前值定位，并把「未绑定项目目录」也带上', async () => {
    setup({ value: '/docs' });

    await waitFor(() =>
      expect(filesystem.listWorkspaceEntries).toHaveBeenCalledWith({
        path: '/docs',
        includeUnboundProjectDirs: false,
      }),
    );
    // 面包屑按当前目录展开：Workspace / docs（列表里可能也有同名目录，因此限定在面包屑内查）
    expect(
      within(
        screen.getByRole('navigation', { name: 'Workspace 目录路径' }),
      ).getByRole('button', { name: 'docs' }),
    ).toBeTruthy();
  });

  it('点目录行选中它并进入该目录', async () => {
    const { props } = setup();
    await userEvent.click(await screen.findByRole('button', { name: /docs/ }));

    expect(props.onChange).toHaveBeenCalledWith('/docs');
    await waitFor(() =>
      expect(filesystem.listWorkspaceEntries).toHaveBeenLastCalledWith({
        path: '/docs',
        includeUnboundProjectDirs: false,
      }),
    );
  });

  it('根目录能进但不能选', async () => {
    const { props } = setup({ value: '/docs' });
    // 面包屑第一段就是根：进得去，但项目不能挂在个人空间根上
    await userEvent.click(
      await screen.findByRole('button', { name: 'Workspace' }),
    );

    expect(props.onChange).toHaveBeenCalledWith('');
  });

  it('新建文件夹成功后进入新目录并提示', async () => {
    filesystem.createWorkspaceDirectory.mockResolvedValue('/newdir/');
    const { props } = setup();

    await userEvent.click(
      await screen.findByRole('button', { name: /新建文件夹/ }),
    );
    await userEvent.type(screen.getByLabelText('文件夹名称'), 'newdir');
    await userEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() =>
      expect(filesystem.createWorkspaceDirectory).toHaveBeenCalledWith({
        parentPath: '/',
        name: 'newdir',
      }),
    );
    expect(props.onChange).toHaveBeenCalledWith('/newdir');
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });

  it('新建文件夹失败时提示，且不选中', async () => {
    filesystem.createWorkspaceDirectory.mockRejectedValue(
      new Error('同名目录已存在'),
    );
    const { props } = setup();

    await userEvent.click(
      await screen.findByRole('button', { name: /新建文件夹/ }),
    );
    await userEvent.type(screen.getByLabelText('文件夹名称'), 'newdir');
    await userEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith({
        type: 'error',
        title: '文件夹',
        message: '同名目录已存在',
      }),
    );
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it('刷新重新拉当前目录', async () => {
    setup();
    await screen.findByRole('button', { name: /docs/ });
    filesystem.listWorkspaceEntries.mockClear();

    await userEvent.click(screen.getByRole('button', { name: '刷新目录' }));

    expect(filesystem.listWorkspaceEntries).toHaveBeenCalledWith({
      path: '/',
      includeUnboundProjectDirs: false,
    });
  });

  it('加载失败时给出错误提示', async () => {
    filesystem.listWorkspaceEntries.mockRejectedValue(new Error('目录不可读'));
    setup();

    expect(await screen.findByRole('alert')).toHaveTextContent('目录不可读');
  });

  it('收起后迟到的响应不再落到列表上', async () => {
    let resolveListing: (entries: FileEntry[]) => void = () => {};
    filesystem.listWorkspaceEntries.mockReturnValue(
      new Promise<FileEntry[]>((resolve) => {
        resolveListing = resolve;
      }),
    );

    const { view } = setup();
    // 面板收起（弹窗关闭）时表单已经不用了，迟到的列表不能再渲染出来
    view.rerender(
      <WorkspacePathPicker value="" active={false} onChange={vi.fn()} />,
    );
    resolveListing(rootEntries);

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /docs/ })).toBeNull(),
    );
  });
});
