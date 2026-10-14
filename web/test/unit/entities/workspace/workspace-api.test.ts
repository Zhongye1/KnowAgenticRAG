import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  getWorkspaceTreeApiWorkspaceTreeGet: vi.fn(),
  searchWorkspaceFilesRouteApiWorkspaceSearchGet: vi.fn(),
  getWorkspaceFileApiWorkspaceFileGet: vi.fn(),
  updateWorkspaceFileApiWorkspaceFilePut: vi.fn(),
  createWorkspaceDirectoryRouteApiWorkspaceDirectoryPost: vi.fn(),
  deleteWorkspaceFileRouteApiWorkspaceFileDelete: vi.fn(),
  uploadWorkspaceFilesRouteApiWorkspaceUploadPost: vi.fn(),
  downloadWorkspaceApiWorkspaceDownloadGet: vi.fn(),
}));

vi.mock('@/shared/api/generated/sdk.gen', () => sdk);

const {
  createWorkspaceDirectory,
  deleteWorkspaceEntry,
  downloadWorkspaceEntry,
  fetchWorkspaceFile,
  listWorkspaceEntries,
  saveWorkspaceFile,
  searchWorkspaceEntries,
  uploadWorkspaceFiles,
} = await import('@/entities/workspace');

beforeEach(() => {
  for (const fn of Object.values(sdk)) fn.mockReset();
});

describe('listWorkspaceEntries', () => {
  it('默认列根目录，并把 include_unbound_project_dirs 透给后端', async () => {
    sdk.getWorkspaceTreeApiWorkspaceTreeGet.mockResolvedValue({
      data: { entries: [] },
    });

    await listWorkspaceEntries({});
    expect(sdk.getWorkspaceTreeApiWorkspaceTreeGet).toHaveBeenCalledWith({
      query: { path: '/', include_unbound_project_dirs: undefined },
    });

    await listWorkspaceEntries({
      path: '/projects/',
      includeUnboundProjectDirs: true,
    });
    expect(sdk.getWorkspaceTreeApiWorkspaceTreeGet).toHaveBeenLastCalledWith({
      query: { path: '/projects/', include_unbound_project_dirs: true },
    });
  });

  it('归一化接口字段；缺 path 的条目丢掉而不是让整份列表失败', async () => {
    sdk.getWorkspaceTreeApiWorkspaceTreeGet.mockResolvedValue({
      data: {
        entries: [
          {
            path: '/agents/',
            name: 'agents',
            is_dir: true,
            size: 0,
            modified_at: '2026-10-11T20:11:34Z',
          },
          { name: 'ghost' },
        ],
      },
    });

    await expect(listWorkspaceEntries({ path: '/' })).resolves.toEqual([
      {
        path: '/agents/',
        name: 'agents',
        isDir: true,
        size: 0,
        modifiedAt: '2026-10-11T20:11:34Z',
      },
    ]);
  });

  it('失败时抛出后端 detail', async () => {
    sdk.getWorkspaceTreeApiWorkspaceTreeGet.mockResolvedValue({
      error: { detail: '当前路径不是目录' },
      response: { status: 400 },
    });

    await expect(listWorkspaceEntries({ path: '/a.txt' })).rejects.toThrow(
      '当前路径不是目录',
    );
  });
});

describe('searchWorkspaceEntries', () => {
  it('按关键词查，只回条目列表', async () => {
    sdk.searchWorkspaceFilesRouteApiWorkspaceSearchGet.mockResolvedValue({
      data: { entries: [{ path: '/a/b.md', name: 'b.md' }] },
    });

    await expect(searchWorkspaceEntries({ query: 'b' })).resolves.toEqual([
      { path: '/a/b.md', name: 'b.md', isDir: false, size: 0, modifiedAt: '' },
    ]);
    expect(
      sdk.searchWorkspaceFilesRouteApiWorkspaceSearchGet,
    ).toHaveBeenCalledWith({ query: { query: 'b' } });
  });
});

describe('fetchWorkspaceFile', () => {
  it('文本与 markdown 走 JSON 分支', async () => {
    sdk.getWorkspaceFileApiWorkspaceFileGet.mockResolvedValue({
      data: {
        content: '# 标题',
        preview_type: 'markdown',
        supported: true,
        message: null,
        truncated: true,
      },
      response: new Response('{}', {
        headers: { 'content-type': 'application/json' },
      }),
    });

    await expect(
      fetchWorkspaceFile({ path: '/agents/AGENTS.md', name: 'AGENTS.md' }),
    ).resolves.toMatchObject({
      path: '/agents/AGENTS.md',
      status: 'ready',
      previewType: 'markdown',
      content: '# 标题',
      truncated: true,
    });
  });

  it('后端声明不支持时进 unsupported 状态并带文案', async () => {
    sdk.getWorkspaceFileApiWorkspaceFileGet.mockResolvedValue({
      data: {
        content: null,
        preview_type: 'unsupported',
        supported: false,
        message: '文件过大，当前仅支持 30 MB 以内的文件预览',
      },
      response: new Response('{}', {
        headers: { 'content-type': 'application/json' },
      }),
    });

    await expect(
      fetchWorkspaceFile({ path: '/a/big.zip', name: 'big.zip' }),
    ).resolves.toMatchObject({
      status: 'unsupported',
      supported: false,
      message: '文件过大，当前仅支持 30 MB 以内的文件预览',
    });
  });

  it('图片走二进制分支：类型取自 X-Ars-Preview-Type，并建对象 URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:img');
    Object.defineProperty(window, 'URL', {
      value: { ...window.URL, createObjectURL },
      configurable: true,
    });
    sdk.getWorkspaceFileApiWorkspaceFileGet.mockResolvedValue({
      data: undefined,
      response: new Response('x', {
        headers: {
          'content-type': 'image/png',
          'x-ars-preview-type': 'image',
        },
      }),
    });

    await expect(
      fetchWorkspaceFile({ path: '/a/p.png', name: 'p.png' }),
    ).resolves.toMatchObject({
      status: 'ready',
      previewType: 'image',
      content: null,
      previewUrl: 'blob:img',
    });
  });

  it('拿不到原生响应时按失败处理，不返回空预览', async () => {
    sdk.getWorkspaceFileApiWorkspaceFileGet.mockResolvedValue({
      error: new Error('network'),
    });

    await expect(
      fetchWorkspaceFile({ path: '/a/p.png', name: 'p.png' }),
    ).rejects.toThrow('文件读取失败');
  });
});

describe('saveWorkspaceFile', () => {
  it('提交 path 与 content，返回服务端归一后的条目', async () => {
    sdk.updateWorkspaceFileApiWorkspaceFilePut.mockResolvedValue({
      data: {
        success: true,
        path: '/agents/AGENTS.md',
        entry: {
          path: '/agents/AGENTS.md',
          name: 'AGENTS.md',
          is_dir: false,
          size: 12,
          modified_at: '2026-10-14T10:00:00Z',
        },
      },
    });

    await expect(
      saveWorkspaceFile({ path: '/agents/AGENTS.md', content: 'hello' }),
    ).resolves.toEqual({
      path: '/agents/AGENTS.md',
      name: 'AGENTS.md',
      isDir: false,
      size: 12,
      modifiedAt: '2026-10-14T10:00:00Z',
    });
    expect(sdk.updateWorkspaceFileApiWorkspaceFilePut).toHaveBeenCalledWith({
      body: { path: '/agents/AGENTS.md', content: 'hello' },
    });
  });

  it('响应里没有条目时返回 null', async () => {
    sdk.updateWorkspaceFileApiWorkspaceFilePut.mockResolvedValue({
      data: { success: true, path: '/a.md' },
    });

    await expect(
      saveWorkspaceFile({ path: '/a.md', content: 'x' }),
    ).resolves.toBeNull();
  });
});

describe('createWorkspaceDirectory', () => {
  it('提交父路径与名字，返回新目录路径', async () => {
    sdk.createWorkspaceDirectoryRouteApiWorkspaceDirectoryPost.mockResolvedValue(
      {
        data: { entry: { path: '/reports/', name: 'reports', is_dir: true } },
      },
    );

    await expect(
      createWorkspaceDirectory({ parentPath: '/', name: 'reports' }),
    ).resolves.toBe('/reports/');
    expect(
      sdk.createWorkspaceDirectoryRouteApiWorkspaceDirectoryPost,
    ).toHaveBeenCalledWith({ body: { parent_path: '/', name: 'reports' } });
  });

  it('响应里没有条目时返回空串', async () => {
    sdk.createWorkspaceDirectoryRouteApiWorkspaceDirectoryPost.mockResolvedValue(
      { data: { success: true } },
    );

    await expect(
      createWorkspaceDirectory({ parentPath: '/', name: 'x' }),
    ).resolves.toBe('');
  });
});

describe('deleteWorkspaceEntry', () => {
  it('按路径删', async () => {
    sdk.deleteWorkspaceFileRouteApiWorkspaceFileDelete.mockResolvedValue({
      data: { success: true, path: '/a.md' },
    });

    await deleteWorkspaceEntry({ path: '/a.md' });

    expect(
      sdk.deleteWorkspaceFileRouteApiWorkspaceFileDelete,
    ).toHaveBeenCalledWith({ query: { path: '/a.md' } });
  });
});

describe('uploadWorkspaceFiles', () => {
  it('提交父路径与文件数组（multipart 由生成物序列化），返回写入的条目', async () => {
    sdk.uploadWorkspaceFilesRouteApiWorkspaceUploadPost.mockResolvedValue({
      data: { entries: [{ path: '/report.md', name: 'report.md', size: 3 }] },
    });
    const files = [new File(['abc'], 'report.md')];

    await expect(
      uploadWorkspaceFiles({ parentPath: '/', files }),
    ).resolves.toEqual([
      {
        path: '/report.md',
        name: 'report.md',
        isDir: false,
        size: 3,
        modifiedAt: '',
      },
    ]);
    expect(
      sdk.uploadWorkspaceFilesRouteApiWorkspaceUploadPost,
    ).toHaveBeenCalledWith({ body: { parent_path: '/', files } });
  });
});

describe('downloadWorkspaceEntry', () => {
  it('文件名取 Content-Disposition 的 RFC 5987 段并触发下载', async () => {
    const createObjectURL = vi.fn(() => 'blob:dl');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(window, 'URL', {
      value: { ...window.URL, createObjectURL, revokeObjectURL },
      configurable: true,
    });
    const click = vi.fn();
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      remove: vi.fn(),
      href: '',
      download: '',
    } as unknown as HTMLElement);
    const appendChild = vi
      .spyOn(document.body, 'appendChild')
      .mockImplementation((node) => node);
    sdk.downloadWorkspaceApiWorkspaceDownloadGet.mockResolvedValue({
      response: new Response('x', {
        headers: {
          'content-disposition':
            "attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.md",
        },
      }),
    });

    await expect(
      downloadWorkspaceEntry({ path: '/报告.md', fallbackName: '报告.md' }),
    ).resolves.toEqual({ ok: true, filename: '报告.md' });
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:dl');

    createElement.mockRestore();
    appendChild.mockRestore();
  });

  it('拿不到响应时按失败返回，文件名退回条目名', async () => {
    sdk.downloadWorkspaceApiWorkspaceDownloadGet.mockResolvedValue({
      error: new Error('network'),
    });

    await expect(
      downloadWorkspaceEntry({ path: '/a.md', fallbackName: 'a.md' }),
    ).resolves.toEqual({ ok: false, filename: 'a.md' });
  });
});
