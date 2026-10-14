import { fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TreeNode } from '@/features/chat/lib/panel-tree';
import { FileTree } from '@/features/chat/ui/file-tree';

const file = (name: string): TreeNode => ({
  key: `/a/${name}`,
  title: name,
  nameStart: name,
  nameEnd: '',
  isLeaf: true,
  fileData: { path: `/a/${name}`, name, type: 'file', workdir: true },
  className: 'file-node',
});

const folder = (children: TreeNode[] = []): TreeNode => ({
  key: '/a/b/',
  title: 'b',
  nameStart: 'b',
  nameEnd: '',
  isLeaf: false,
  children,
  fileData: { path: '/a/b/', name: 'b', type: 'directory', workdir: false },
  className: 'folder-node',
});

const setup = (
  overrides: Partial<React.ComponentProps<typeof FileTree>> = {},
) => {
  const props = {
    nodes: [folder([file('report.md')]), file('d.txt')],
    selectedKeys: [] as string[],
    expandedKeys: ['/a/b/'] as string[],
    emptyText: '暂无文件',
    loadingText: '正在加载...',
    onNodeClick: vi.fn(),
    onLoadChildren: vi.fn(),
    onExpandedKeysChange: vi.fn(),
    ...overrides,
  };

  render(<FileTree {...props} />);

  return props;
};

/**
 * 点某一行的内容区。
 *
 * 行的点击目标是 antd 的内容包装元素；`role="treeitem"` 挂在更外层的节点 div 上，
 * 它还包含左侧缩进，点那里不会触发选中。
 */
const clickRow = async (name: RegExp) => {
  const item = screen.getByRole('treeitem', { name });
  await userEvent.click(
    item.querySelector('.ant-tree-node-content-wrapper') as HTMLElement,
  );
};

describe('FileTree', () => {
  it('加载中显示加载文案', () => {
    setup({ nodes: [], loading: true });

    expect(screen.getByText('正在加载...')).toBeTruthy();
  });

  it('错误时显示原因与重试入口', async () => {
    const props = setup({
      nodes: [],
      error: '加载文件系统失败',
      onRetry: vi.fn(),
    });

    expect(screen.getByText('加载文件系统失败')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it('空树显示空文案', () => {
    setup({ nodes: [] });

    expect(screen.getByText('暂无文件')).toBeTruthy();
  });

  it('展开的目录渲染子节点，文件可选中', () => {
    setup({ selectedKeys: ['/a/report.md'] });

    const selected = screen.getByRole('treeitem', { name: /report\.md/ });
    expect(selected.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('treeitem', { name: /d\.txt/ })).toBeTruthy();
  });

  it('点文件只交回节点本身', async () => {
    const props = setup();

    await clickRow(/d\.txt/);

    expect(props.onNodeClick).toHaveBeenCalledTimes(1);
    expect(props.onLoadChildren).not.toHaveBeenCalled();
  });

  it('点目录会请求加载子项', async () => {
    const props = setup({ expandedKeys: [] });

    await clickRow(/^b/);

    expect(props.onLoadChildren).toHaveBeenCalledTimes(1);
    expect(props.onNodeClick).toHaveBeenCalledTimes(1);
  });

  it('键盘 → 展开目录时把新的展开键交回调用方', async () => {
    const props = setup({ expandedKeys: [] });

    // 展开走 rc-tree 的 switcher（本仓把它 display:none 了，所以用 fireEvent 直接点它）：
    // 受控模式下这条路径与键盘 ←/→ 同源，都会经过 onExpand
    fireEvent.click(
      screen
        .getByRole('treeitem', { name: /^b/ })
        .querySelector('.ant-tree-switcher') as HTMLElement,
    );

    // 展开态是受控的：不交回新键的话 ←/→ 在受控模式下是空操作
    expect(props.onExpandedKeysChange).toHaveBeenCalledWith(['/a/b/']);
  });

  it('带动作时文件节点有下载与删除，删除中的节点禁用', async () => {
    const props = setup({
      showActions: true,
      deletingPaths: ['/a/d.txt'],
      onDelete: vi.fn(),
      onDownload: vi.fn(),
    });

    await userEvent.click(
      screen.getByRole('button', { name: '下载 report.md' }),
    );
    expect(props.onDownload).toHaveBeenCalledTimes(1);

    const deleting = screen.getByRole('button', {
      name: '删除文件 d.txt',
    }) as HTMLButtonElement;
    expect(deleting.disabled).toBe(true);
    await userEvent.click(deleting);
    expect(props.onDelete).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: '删除文件 report.md' }),
    );
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it('不带动作时没有下载与删除按钮', () => {
    setup();

    expect(screen.queryByRole('button', { name: /下载/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /删除/ })).toBeNull();
  });

  it('目录节点没有下载按钮，只有删除', () => {
    setup({ showActions: true, onDelete: vi.fn() });

    expect(screen.queryByRole('button', { name: /下载/ })).toBeNull();
    expect(screen.getByRole('button', { name: '删除文件夹 b' })).toBeTruthy();
  });
});
