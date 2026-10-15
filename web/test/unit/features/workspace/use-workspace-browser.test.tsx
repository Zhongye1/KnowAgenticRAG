/**
 * 个人空间页面的控制器。
 *
 * 不 mock 控制器内部：`@/entities/workspace` 整块换成桩，控制器与归一/格式化的真实实现一起跑，
 * 用例断言的是用户看得见的结果（预览状态、选中集、通知文案）与端点是否真的被调用。
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileEntry } from '@/shared/lib/files/filesystem-entry';
import type { PreviewFile } from '@/shared/lib/files/file-preview';

const controllerState = {
  entries: [] as FileEntry[],
  error: null as unknown,
  isLoading: false,
  requestedPaths: [] as string[],
};

const ws = vi.hoisted(() => ({
  MAX_UPLOAD_FILE_COUNT: 50,
  listWorkspaceEntries: vi.fn(),
  fetchWorkspaceFile: vi.fn(),
  downloadWorkspaceEntry: vi.fn(),
  createWorkspaceDirectory: vi.fn(),
  deleteWorkspaceEntry: vi.fn(),
  saveWorkspaceFile: vi.fn(),
  uploadWorkspaceFiles: vi.fn(),
  useWorkspaceEntries: vi.fn(),
  useWorkspaceSearch: vi.fn(),
  useCreateWorkspaceDirectory: vi.fn(),
  useDeleteWorkspaceEntry: vi.fn(),
  useSaveWorkspaceFile: vi.fn(),
  useUploadWorkspaceFiles: vi.fn(),
}));

vi.mock('@/entities/workspace', () => ws);

const { useWorkspaceBrowser } =
  await import('@/features/workspace/model/use-workspace-browser');

const file = (path: string, size = 10): FileEntry => ({
  path,
  name: path.split('/').filter(Boolean).pop() ?? path,
  isDir: false,
  size,
  modifiedAt: '2026-10-14T11:00:00Z',
});

const dir = (path: string): FileEntry => ({
  path,
  name: path.split('/').filter(Boolean).pop() ?? path,
  isDir: true,
  size: 0,
  modifiedAt: '2026-10-14T11:00:00Z',
});

const previewFile = (
  path: string,
  overrides: Partial<PreviewFile> = {},
): PreviewFile => ({
  path,
  name: path.split('/').pop() ?? path,
  status: 'ready',
  previewType: 'markdown',
  supported: true,
  content: '# 初稿',
  previewUrl: '',
  message: '',
  truncated: false,
  ...overrides,
});

const renderBrowser = () => {
  const notifySuccess = vi.fn();
  const notifyError = vi.fn();
  const view = renderHook(() =>
    useWorkspaceBrowser({ notifySuccess, notifyError }),
  );

  return { view, notifySuccess, notifyError };
};

beforeEach(() => {
  controllerState.entries = [];
  controllerState.error = null;
  controllerState.isLoading = false;
  controllerState.requestedPaths = [];
  for (const fn of Object.values(ws)) {
    if (typeof fn === 'function' && 'mockReset' in fn) fn.mockReset();
  }

  ws.useWorkspaceEntries.mockImplementation((path: string) => {
    controllerState.requestedPaths.push(path);
    return {
      entries: controllerState.entries,
      isLoading: controllerState.isLoading,
      isFetching: false,
      error: controllerState.error,
      refetch: vi.fn(),
    };
  });
  ws.useCreateWorkspaceDirectory.mockReturnValue({
    mutateAsync: ws.createWorkspaceDirectory,
  });
  ws.useDeleteWorkspaceEntry.mockReturnValue({
    mutateAsync: ws.deleteWorkspaceEntry,
  });
  ws.useUploadWorkspaceFiles.mockReturnValue({
    mutateAsync: ws.uploadWorkspaceFiles,
  });
  ws.useSaveWorkspaceFile.mockReturnValue({
    mutateAsync: ws.saveWorkspaceFile,
  });
});

describe('目录与选中', () => {
  it('打开目录换路径，面包屑与行跟着变', async () => {
    const { view } = renderBrowser();
    expect(view.result.current.currentPath).toBe('/');

    act(() => view.result.current.openDirectory('/agents/'));

    expect(view.result.current.currentPath).toBe('/agents/');
    expect(view.result.current.breadcrumbs.map((crumb) => crumb.name)).toEqual([
      '全部文件',
      'agents',
    ]);
    expect(controllerState.requestedPaths).toContain('/agents/');
  });

  it('点击目录条目等于进入该目录，并清掉选中与多选态', async () => {
    controllerState.entries = [dir('/agents/'), file('/a.md')];
    const { view } = renderBrowser();

    act(() => view.result.current.setSelectionMode(true));
    act(() => view.result.current.toggleSelection('/a.md'));
    expect(view.result.current.selectedPaths).toEqual(['/a.md']);

    act(() => view.result.current.openEntry(dir('/agents/')));

    expect(view.result.current.currentPath).toBe('/agents/');
    expect(view.result.current.selectionMode).toBe(false);
    expect(view.result.current.selectedPaths).toEqual([]);
  });

  it('列表刷新后修剪选中集：只保留仍在当前目录里的路径', async () => {
    controllerState.entries = [file('/a.md'), file('/b.md')];
    const { view } = renderBrowser();

    act(() => view.result.current.toggleSelection('/a.md'));
    act(() => view.result.current.toggleSelection('/b.md'));

    // 同一目录里的条目变了（删除/上传后的重新取数），消失的路径不能留在选中集里
    controllerState.entries = [file('/b.md')];
    act(() => view.rerender());

    await waitFor(() =>
      expect(view.result.current.selectedPaths).toEqual(['/b.md']),
    );
  });

  it('目录加载失败时给文案，且每次失败只报一次', async () => {
    const { view, notifyError } = renderBrowser();

    controllerState.error = new Error('boom');
    act(() => view.result.current.openDirectory('/agents/'));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('加载个人空间目录失败'),
    );
    expect(notifyError).toHaveBeenCalledTimes(1);
  });
});

describe('预览', () => {
  it('点文件读出内容并允许编辑 md/txt', async () => {
    controllerState.entries = [file('/agents/AGENTS.md')];
    ws.fetchWorkspaceFile.mockResolvedValue(previewFile('/agents/AGENTS.md'));
    const { view } = renderBrowser();

    await act(async () => {
      view.result.current.openEntry(file('/agents/AGENTS.md'));
    });

    await waitFor(() =>
      expect(view.result.current.preview.status).toBe('ready'),
    );
    expect(view.result.current.preview.draft).toBe('# 初稿');
    expect(view.result.current.preview.canEdit).toBe(true);
    expect(ws.fetchWorkspaceFile).toHaveBeenCalledWith({
      path: '/agents/AGENTS.md',
      name: 'AGENTS.md',
    });
  });

  it('服务端截短过的内容不给编辑（保存会把截断后的内容写回去）', async () => {
    ws.fetchWorkspaceFile.mockResolvedValue(
      previewFile('/a/big.md', { truncated: true }),
    );
    const { view } = renderBrowser();

    await act(async () => {
      view.result.current.openEntry(file('/a/big.md'));
    });

    await waitFor(() =>
      expect(view.result.current.preview.status).toBe('ready'),
    );
    expect(view.result.current.preview.canEdit).toBe(false);
  });

  it('不可编辑的扩展名不给编辑', async () => {
    ws.fetchWorkspaceFile.mockResolvedValue(
      previewFile('/a/data.png', { previewType: 'image' }),
    );
    const { view } = renderBrowser();

    await act(async () => {
      view.result.current.openEntry(file('/a/data.png'));
    });

    await waitFor(() =>
      expect(view.result.current.preview.status).toBe('ready'),
    );
    expect(view.result.current.preview.canEdit).toBe(false);
  });

  it('陈旧响应不落地：后发的请求赢，先发的响应连对象 URL 一起回收', async () => {
    const revokeObjectURL = vi.fn();
    Object.defineProperty(window, 'URL', {
      value: { ...window.URL, revokeObjectURL },
      configurable: true,
    });

    let resolveFirst: (file: PreviewFile) => void = () => {};
    const first = new Promise<PreviewFile>((resolve) => {
      resolveFirst = resolve;
    });
    ws.fetchWorkspaceFile
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(previewFile('/b.md', { content: 'B' }));

    const { view } = renderBrowser();

    await act(async () => {
      void view.result.current.openEntry(file('/a.md'));
      view.result.current.openEntry(file('/b.md'));
    });

    await waitFor(() =>
      expect(view.result.current.preview.status).toBe('ready'),
    );
    expect(view.result.current.preview.entry?.path).toBe('/b.md');

    // 迟到的 A 响应不能盖掉 B，并且它带来的对象 URL 要就地回收
    await act(async () => {
      resolveFirst(previewFile('/a.md', { previewUrl: 'blob:a' }));
      await first;
    });

    expect(view.result.current.preview.entry?.path).toBe('/b.md');
    expect(view.result.current.preview.draft).toBe('B');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:a');
  });

  it('关闭预览会回收对象 URL', async () => {
    const revokeObjectURL = vi.fn();
    Object.defineProperty(window, 'URL', {
      value: { ...window.URL, revokeObjectURL },
      configurable: true,
    });
    ws.fetchWorkspaceFile.mockResolvedValue(
      previewFile('/a/p.pdf', { previewUrl: 'blob:p' }),
    );
    const { view } = renderBrowser();

    await act(async () => {
      view.result.current.openEntry(file('/a/p.pdf'));
    });
    await waitFor(() =>
      expect(view.result.current.preview.status).toBe('ready'),
    );

    act(() => view.result.current.closePreview());

    expect(view.result.current.preview.status).toBe('idle');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:p');
  });
});

describe('保存', () => {
  it('无改动不发请求；有改动才提交，并把「未保存」清掉', async () => {
    ws.fetchWorkspaceFile.mockResolvedValue(previewFile('/agents/AGENTS.md'));
    ws.saveWorkspaceFile.mockResolvedValue(file('/agents/AGENTS.md', 20));
    const { view, notifySuccess } = renderBrowser();

    await act(async () => {
      view.result.current.openEntry(file('/agents/AGENTS.md'));
    });
    await waitFor(() =>
      expect(view.result.current.preview.status).toBe('ready'),
    );

    await act(async () => {
      await view.result.current.savePreview();
    });
    expect(ws.saveWorkspaceFile).not.toHaveBeenCalled();

    act(() => view.result.current.changeDraft('# 二稿'));
    expect(view.result.current.preview.dirty).toBe(true);

    await act(async () => {
      await view.result.current.savePreview();
    });

    expect(ws.saveWorkspaceFile).toHaveBeenCalledWith({
      path: '/agents/AGENTS.md',
      content: '# 二稿',
    });
    expect(notifySuccess).toHaveBeenCalledWith('文件保存成功');
    expect(view.result.current.preview.dirty).toBe(false);
    expect(view.result.current.preview.file?.content).toBe('# 二稿');
  });

  it('取消编辑回到文件内容，脏值清零', async () => {
    ws.fetchWorkspaceFile.mockResolvedValue(previewFile('/a/x.md'));
    const { view } = renderBrowser();

    await act(async () => {
      view.result.current.openEntry(file('/a/x.md'));
    });
    await waitFor(() =>
      expect(view.result.current.preview.status).toBe('ready'),
    );

    act(() => view.result.current.startEditing());
    act(() => view.result.current.changeDraft('改了'));
    act(() => view.result.current.cancelEditing());

    expect(view.result.current.preview.editing).toBe(false);
    expect(view.result.current.preview.draft).toBe('# 初稿');
    expect(view.result.current.preview.dirty).toBe(false);
  });

  it('保存失败给文案，编辑态与脏值保留', async () => {
    ws.fetchWorkspaceFile.mockResolvedValue(previewFile('/a/x.md'));
    ws.saveWorkspaceFile.mockRejectedValue(new Error('boom'));
    const { view, notifyError } = renderBrowser();

    await act(async () => {
      view.result.current.openEntry(file('/a/x.md'));
    });
    await waitFor(() =>
      expect(view.result.current.preview.status).toBe('ready'),
    );
    act(() => view.result.current.changeDraft('新内容'));

    await act(async () => {
      await view.result.current.savePreview();
    });

    expect(notifyError).toHaveBeenCalledWith('文件保存失败');
    expect(view.result.current.preview.dirty).toBe(true);
    expect(view.result.current.preview.draft).toBe('新内容');
  });
});

describe('上传、新建与删除', () => {
  it('超过 50 个文件时不发请求并给文案', async () => {
    const { view, notifyError } = renderBrowser();
    const files = Array.from(
      { length: 51 },
      (_, index) => new File(['x'], `f${index}.txt`),
    );

    await act(async () => {
      await view.result.current.uploadFiles(files);
    });

    expect(ws.uploadWorkspaceFiles).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledWith('一次最多上传 50 个文件');
  });

  it('上传成功后按文件数报成功，目标目录是当前目录', async () => {
    ws.uploadWorkspaceFiles.mockResolvedValue([]);
    const { view, notifySuccess } = renderBrowser();

    act(() => view.result.current.openDirectory('/agents/'));
    await act(async () => {
      await view.result.current.uploadFiles([new File(['x'], 'a.md')]);
    });

    expect(ws.uploadWorkspaceFiles).toHaveBeenCalledWith({
      parentPath: '/agents/',
      files: [expect.any(File)],
    });
    expect(notifySuccess).toHaveBeenCalledWith('1 个文件上传成功');
  });

  it('空文件夹名不发请求；成功时报成功并返回 true', async () => {
    ws.createWorkspaceDirectory.mockResolvedValue('/reports/');
    const { view, notifyError, notifySuccess } = renderBrowser();

    await act(async () => {
      await expect(view.result.current.createDirectory('   ')).resolves.toBe(
        false,
      );
    });
    expect(notifyError).toHaveBeenCalledWith('请输入文件夹名');
    expect(ws.createWorkspaceDirectory).not.toHaveBeenCalled();

    await act(async () => {
      await expect(
        view.result.current.createDirectory('reports'),
      ).resolves.toBe(true);
    });
    expect(ws.createWorkspaceDirectory).toHaveBeenCalledWith({
      parentPath: '/',
      name: 'reports',
    });
    expect(notifySuccess).toHaveBeenCalledWith('文件夹创建成功');
  });

  it('删掉正在预览的文件（或它的祖先）时预览自动关闭', async () => {
    ws.fetchWorkspaceFile.mockResolvedValue(previewFile('/a/b/c.md'));
    ws.deleteWorkspaceEntry.mockResolvedValue(undefined);
    const { view } = renderBrowser();

    await act(async () => {
      view.result.current.openEntry(file('/a/b/c.md'));
    });
    await waitFor(() =>
      expect(view.result.current.preview.status).toBe('ready'),
    );

    await act(async () => {
      await view.result.current.deleteEntries([dir('/a/b/')]);
    });

    expect(view.result.current.preview.status).toBe('idle');
    expect(ws.deleteWorkspaceEntry).toHaveBeenCalledWith({ path: '/a/b/' });
  });

  it('删别的文件不影响当前预览，且批量文案与单条不同', async () => {
    ws.fetchWorkspaceFile.mockResolvedValue(previewFile('/keep.md'));
    ws.deleteWorkspaceEntry.mockResolvedValue(undefined);
    const { view, notifySuccess } = renderBrowser();

    await act(async () => {
      view.result.current.openEntry(file('/keep.md'));
    });
    await waitFor(() =>
      expect(view.result.current.preview.status).toBe('ready'),
    );

    await act(async () => {
      await view.result.current.deleteEntries([file('/other.md')]);
    });

    expect(view.result.current.preview.status).toBe('ready');
    expect(notifySuccess).toHaveBeenCalledWith('删除成功');

    await act(async () => {
      await view.result.current.deleteEntries([file('/x.md'), file('/y.md')]);
    });
    expect(notifySuccess).toHaveBeenCalledWith('选中项删除成功');
  });

  it('删除期间用户切到别的文件时，按最新的预览判定（不关错文件）', async () => {
    let resolveDelete: () => void = () => {};
    ws.deleteWorkspaceEntry.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = () => resolve(undefined);
        }),
    );
    ws.fetchWorkspaceFile.mockImplementation(({ path }) =>
      Promise.resolve(previewFile(path)),
    );
    const { view } = renderBrowser();

    await act(async () => {
      view.result.current.openEntry(file('/a.md'));
    });
    await waitFor(() =>
      expect(view.result.current.preview.status).toBe('ready'),
    );

    let deleting: Promise<void> = Promise.resolve();
    act(() => {
      deleting = view.result.current.deleteEntries([file('/a.md')]);
    });

    // 删除还在飞的时候用户点了另一个文件
    await act(async () => {
      view.result.current.openEntry(file('/b.md'));
    });
    await waitFor(() =>
      expect(view.result.current.preview.entry?.path).toBe('/b.md'),
    );

    await act(async () => {
      resolveDelete();
      await deleting;
    });

    // 关掉的必须只有被删的那一个；b.md 的预览不能跟着消失
    expect(view.result.current.preview.status).toBe('ready');
    expect(view.result.current.preview.entry?.path).toBe('/b.md');
  });

  it('两次删除同时在飞时，各自的「删除中」标记互不影响', async () => {
    const pending = new Map<string, () => void>();
    ws.deleteWorkspaceEntry.mockImplementation(
      ({ path }: { path: string }) =>
        new Promise<void>((resolve) => {
          pending.set(path, () => resolve(undefined));
        }),
    );
    const { view } = renderBrowser();

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = view.result.current.deleteEntries([file('/a.md')]);
    });
    act(() => {
      void view.result.current.deleteEntries([file('/b.md')]);
    });

    expect([...view.result.current.deletingPaths].sort()).toEqual([
      '/a.md',
      '/b.md',
    ]);

    await act(async () => {
      pending.get('/a.md')?.();
      await first;
    });

    // a.md 结束后只剩 b.md；整体清空会让 b.md 的行提前恢复可点
    expect(view.result.current.deletingPaths).toEqual(['/b.md']);
  });

  it('删除失败给文案，删除中标记被清掉', async () => {
    ws.deleteWorkspaceEntry.mockRejectedValue(new Error('boom'));
    const { view, notifyError } = renderBrowser();

    await act(async () => {
      await view.result.current.deleteEntries([file('/a.md')]);
    });

    expect(notifyError).toHaveBeenCalledWith('删除失败');
    expect(view.result.current.deletingPaths).toEqual([]);
  });

  it('下载目录不发请求；下载失败给文案', async () => {
    ws.downloadWorkspaceEntry.mockResolvedValue({
      ok: false,
      filename: 'a.md',
    });
    const { view, notifyError } = renderBrowser();

    await act(async () => {
      await view.result.current.download(dir('/agents/'));
    });
    expect(ws.downloadWorkspaceEntry).not.toHaveBeenCalled();

    await act(async () => {
      await view.result.current.download(file('/a.md'));
    });
    expect(notifyError).toHaveBeenCalledWith('下载文件失败');
  });
});
