/**
 * 个人空间渲染件的用例。
 *
 * 只测渲染与交互契约（列与文案、空态、多选入口、侧栏高亮规则、预览编辑条），数据与编排在
 * `use-workspace-browser.test.tsx` 里已经覆盖，这里不重复。
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceFileTable } from '@/features/workspace/ui/workspace-file-table';
import { WorkspacePreviewPane } from '@/features/workspace/ui/workspace-preview-pane';
import { WorkspaceSidebar } from '@/features/workspace/ui/workspace-sidebar';
import type { WorkspaceRow } from '@/features/workspace/lib/workspace-view';
import type { WorkspacePreview } from '@/features/workspace/model/use-workspace-browser';
import type { FileEntry } from '@/shared/lib/files/filesystem-entry';

const entry = (path: string, isDir = false, size = 10): FileEntry => ({
  path,
  name: path.split('/').filter(Boolean).pop() ?? path,
  isDir,
  size,
  modifiedAt: '2026-10-11T12:00:00Z',
});

const row = (path: string, isDir = false): WorkspaceRow => ({
  key: path,
  entry: entry(path, isDir),
  name: entry(path, isDir).name,
  sizeLabel: isDir ? '-' : '1 KB',
  modifiedLabel: '3 天前',
  isDir,
  canDownload: !isDir,
  editable: !isDir && path.endsWith('.md'),
});

const tableProps = {
  rows: [row('/agents/', true), row('/agents/AGENTS.md')],
  breadcrumbs: [
    { name: '全部文件', path: '/' },
    { name: 'agents', path: '/agents/' },
  ],
  currentPath: '/agents/',
  isLoading: false,
  selectionMode: false,
  selectedPaths: [],
  deletingPaths: [],
  onOpen: vi.fn(),
  onBreadcrumb: vi.fn(),
  onToggleSelectionMode: vi.fn(),
  onToggleSelection: vi.fn(),
  onDeleteSelected: vi.fn(),
  onDownload: vi.fn(),
  onDelete: vi.fn(),
};

describe('WorkspaceFileTable', () => {
  it('列名、行内容与禁用态的面包屑末段', () => {
    render(<WorkspaceFileTable {...tableProps} />);

    expect(
      screen.getByRole('columnheader', { name: '名称' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: '大小' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: '修改时间' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: '操作' }),
    ).toBeInTheDocument();

    // 行内容只在表格里断言：面包屑里也有一个「agents」
    const table = screen.getByRole('table');
    expect(within(table).getByText('agents')).toBeInTheDocument();
    expect(within(table).getByText('AGENTS.md')).toBeInTheDocument();
    expect(within(table).getByText('1 KB')).toBeInTheDocument();
    expect(within(table).getAllByText('3 天前')).toHaveLength(2);
    expect(screen.getByText('2 项')).toBeInTheDocument();

    // 当前层是最后一段：不可点；上层可点
    const crumbs = screen.getAllByRole('button', { name: /全部文件|agents/ });
    expect(crumbs[0]).toBeEnabled();
    expect(crumbs[1]).toBeDisabled();
  });

  it('空目录给「当前文件夹为空」而不是空白表格', () => {
    render(<WorkspaceFileTable {...tableProps} rows={[]} />);

    expect(screen.getByText('当前文件夹为空')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('多选态才出复选列与「删除选中」，并随选中数启用', async () => {
    const { rerender } = render(<WorkspaceFileTable {...tableProps} />);
    expect(screen.queryByText('删除选中')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    rerender(
      <WorkspaceFileTable {...tableProps} selectionMode selectedPaths={[]} />,
    );
    expect(screen.getByRole('button', { name: '删除选中' })).toBeDisabled();

    rerender(
      <WorkspaceFileTable
        {...tableProps}
        selectionMode
        selectedPaths={['/agents/AGENTS.md']}
      />,
    );
    expect(screen.getByRole('button', { name: '删除选中' })).toBeEnabled();
    expect(
      screen.getByRole('checkbox', { name: '选择 AGENTS.md' }),
    ).toBeChecked();
  });

  it('点行交给上层打开，行内「更多操作」不触发行打开', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<WorkspaceFileTable {...tableProps} onOpen={onOpen} />);

    await user.click(screen.getByText('AGENTS.md'));
    expect(onOpen).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: 'AGENTS.md 更多操作' }),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('下载')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
  });
});

describe('WorkspaceSidebar', () => {
  const sidebarProps = {
    uploading: false,
    onUploadRequest: vi.fn(),
    onCreateDirectory: vi.fn(),
    onOpenSearch: vi.fn(),
    onSelectRoot: vi.fn(),
    onSelectPath: vi.fn(),
  };

  it('根目录时「个人空间」高亮，快速访问都不亮', () => {
    render(<WorkspaceSidebar {...sidebarProps} currentPath="/" />);

    expect(screen.getByRole('button', { name: '个人空间' })).toHaveAttribute(
      'class',
      expect.stringContaining('navItemActive'),
    );
    expect(
      screen.getByRole('button', { name: '智能体文件' }),
    ).not.toHaveAttribute('class', expect.stringContaining('navItemActive'));
  });

  it('快速访问项只在严格同层时高亮（子目录里没有任何一项高亮）', () => {
    const { rerender } = render(
      <WorkspaceSidebar {...sidebarProps} currentPath="/agents/" />,
    );
    expect(screen.getByRole('button', { name: '智能体文件' })).toHaveAttribute(
      'class',
      expect.stringContaining('navItemActive'),
    );
    expect(
      screen.getByRole('button', { name: '个人空间' }),
    ).not.toHaveAttribute('class', expect.stringContaining('navItemActive'));

    rerender(
      <WorkspaceSidebar {...sidebarProps} currentPath="/agents/skills/" />,
    );
    expect(
      screen.getByRole('button', { name: '智能体文件' }),
    ).not.toHaveAttribute('class', expect.stringContaining('navItemActive'));
    expect(
      screen.getByRole('button', { name: '个人空间' }),
    ).not.toHaveAttribute('class', expect.stringContaining('navItemActive'));
  });

  it('上传下拉里的两项各自回调一次', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSidebar {...sidebarProps} currentPath="/" />);

    await user.click(screen.getByRole('button', { name: /上传文件/ }));
    const menu = screen.getByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '上传文件' }));
    expect(sidebarProps.onUploadRequest).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /上传文件/ }));
    await user.click(
      within(screen.getByRole('menu')).getByRole('menuitem', {
        name: '新建文件夹',
      }),
    );
    expect(sidebarProps.onCreateDirectory).toHaveBeenCalledTimes(1);
  });

  it('上传中禁用入口并换成「上传中...」', () => {
    render(<WorkspaceSidebar {...sidebarProps} currentPath="/" uploading />);

    const button = screen.getByRole('button', { name: /上传中/ });
    expect(button).toBeDisabled();
  });
});

describe('WorkspacePreviewPane', () => {
  const preview = (
    overrides: Partial<WorkspacePreview> = {},
  ): WorkspacePreview => ({
    entry: entry('/agents/AGENTS.md'),
    status: 'ready',
    file: {
      path: '/agents/AGENTS.md',
      name: 'AGENTS.md',
      status: 'ready',
      previewType: 'markdown',
      supported: true,
      content: '# 标题',
      previewUrl: '',
      message: '',
      truncated: false,
    },
    draft: '# 标题',
    editing: false,
    dirty: false,
    canEdit: true,
    ...overrides,
  });

  const paneProps = {
    saving: false,
    onClose: vi.fn(),
    onStartEditing: vi.fn(),
    onCancelEditing: vi.fn(),
    onChangeDraft: vi.fn(),
    onSave: vi.fn(),
  };

  it('可编辑文件给出编辑入口与工作区路径', async () => {
    const user = userEvent.setup();
    render(<WorkspacePreviewPane {...paneProps} preview={preview()} />);

    expect(screen.getByText('/agents/AGENTS.md')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /编\s*辑/ }));
    expect(paneProps.onStartEditing).toHaveBeenCalledTimes(1);
  });

  it('不可编辑（截短或非文本）时没有编辑入口', () => {
    render(
      <WorkspacePreviewPane
        {...paneProps}
        preview={preview({ canEdit: false })}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /编\s*辑/ }),
    ).not.toBeInTheDocument();
  });

  it('编辑态：脏内容给「未保存」，保存与取消各自回调', async () => {
    const user = userEvent.setup();
    render(
      <WorkspacePreviewPane
        {...paneProps}
        preview={preview({ editing: true, draft: '# 改过', dirty: true })}
      />,
    );

    expect(screen.getByText('未保存')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '编辑文件内容' })).toHaveValue(
      '# 改过',
    );

    await user.click(screen.getByRole('button', { name: /保\s*存/ }));
    expect(paneProps.onSave).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /取\s*消/ }));
    expect(paneProps.onCancelEditing).toHaveBeenCalledTimes(1);
  });

  it('不支持的类型给下载提示而不是空白', () => {
    render(
      <WorkspacePreviewPane
        {...paneProps}
        preview={preview({
          file: {
            path: '/a/b.zip',
            name: 'b.zip',
            status: 'unsupported',
            previewType: 'unsupported',
            supported: false,
            content: null,
            previewUrl: '',
            message: '当前文件暂不支持预览，请下载后查看',
            truncated: false,
          },
        })}
      />,
    );

    expect(
      screen.getByText('当前文件暂不支持预览，请下载后查看'),
    ).toBeInTheDocument();
  });
});
