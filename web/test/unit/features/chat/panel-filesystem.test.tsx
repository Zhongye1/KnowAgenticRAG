import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: {
    listDirectory: vi.fn(),
    deleteEntry: vi.fn(),
    searchEntries: vi.fn(),
  },
}));

vi.mock('@/features/chat/api/filesystem-api', () => api);

const { usePanelFilesystem, usePanelFileSearch } =
  await import('@/features/chat/model/panel-filesystem');

const renderWithClient = <TProps, TResult>(
  callback: (props: TProps) => TResult,
  options: { initialProps?: TProps } = {},
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return renderHook(callback, {
    initialProps: options.initialProps,
    wrapper: ({ children }: { children?: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
};

const entry = (path: string, isDir = false) => ({
  path,
  name: path.split('/').filter(Boolean).pop() ?? '/',
  isDir,
  size: 0,
  modifiedAt: '2026-10-12T00:00:00Z',
});

const rootEntries = () => [
  entry('/outputs/', true),
  entry('/uploads/', true),
  entry('/other/', true),
  entry('/report.md'),
];

describe('usePanelFilesystem', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    // outputs 为空（会被隐藏），uploads 与其它目录各有一个文件
    api.listDirectory.mockImplementation(async ({ path }: { path: string }) => {
      if (path === '/') return rootEntries();
      if (path === '/outputs/') return [];

      return [entry(`${path}result.json`)];
    });
  });
  afterEach(() => vi.useRealTimers());

  const renderAt = (threadId = 't-1', pollingEnabled = false) =>
    renderWithClient(() => usePanelFilesystem({ threadId, pollingEnabled }));

  it('根刷新预取关键目录，空的 outputs 被隐藏', async () => {
    const { result } = renderAt();
    await act(async () => {
      await result.current.refreshThreadTree();
    });

    // /outputs/ 是空的且属于隐藏名单；/uploads/ 有内容就保留；非关键目录照常展示
    const keys = result.current.thread.nodes.map((node) => node.key);
    expect(keys).toEqual(['/other/', '/uploads/', '/report.md']);
    expect(result.current.thread.loading).toBe(false);
  });

  it('懒加载把子项写进对应目录，不整棵重拉', async () => {
    const { result } = renderAt();
    await act(async () => {
      await result.current.refreshThreadTree();
    });

    await act(async () => {
      await result.current.loadThreadChildren(result.current.thread.nodes[0]!);
    });

    expect(
      result.current.thread.nodes[0]?.children?.map((node) => node.key),
    ).toEqual(['/other/result.json']);
    // 除预取 outputs / uploads 之外，只额外拉了 /other/ 这一个子目录
    const otherCalls = api.listDirectory.mock.calls.filter(
      ([input]) => (input as { path?: string }).path === '/other/',
    );
    expect(otherCalls).toHaveLength(1);
  });

  it('删除成功后就地移除，并清掉指向它的选中与展开', async () => {
    api.listDirectory.mockImplementation(async ({ path }: { path: string }) =>
      path === '/' ? [entry('/a/', true), entry('/d.txt')] : [],
    );
    const onDeleted = vi.fn();
    const { result } = renderWithClient(() =>
      usePanelFilesystem({ threadId: 't-1', pollingEnabled: false, onDeleted }),
    );
    await act(async () => {
      await result.current.refreshThreadTree();
    });
    act(() => {
      result.current.setScopeState('thread', (current) => ({
        ...current,
        selectedKeys: ['/a/'],
        expandedKeys: ['/a/'],
      }));
    });
    api.deleteEntry.mockResolvedValue(undefined);

    const ok = await act(async () =>
      result.current.deleteThreadNode(result.current.thread.nodes[0]!),
    );

    expect(ok).toBe(true);
    expect(api.deleteEntry).toHaveBeenCalledWith({
      scope: 'thread',
      threadId: 't-1',
      path: '/a/',
    });
    expect(result.current.thread.nodes.map((node) => node.key)).toEqual([
      '/d.txt',
    ]);
    expect(result.current.thread.selectedKeys).toEqual([]);
    expect(onDeleted).toHaveBeenCalledWith('/a/');
    expect(result.current.thread.deletingPaths).toEqual([]);
  });

  it('删除失败时错误落到线程树上，节点不移除', async () => {
    api.listDirectory.mockImplementation(async ({ path }: { path: string }) =>
      path === '/' ? [entry('/a/', true)] : [],
    );
    api.listDirectory.mockImplementation(async ({ path }: { path: string }) =>
      path === '/' ? [entry('/a/', true)] : [],
    );
    const { result } = renderWithClient(() =>
      usePanelFilesystem({ threadId: 't-1', pollingEnabled: false }),
    );
    await act(async () => {
      await result.current.refreshThreadTree();
    });
    api.deleteEntry.mockRejectedValue(new Error('目录非空'));

    const ok = await act(async () =>
      result.current.deleteThreadNode(result.current.thread.nodes[0]!),
    );

    expect(ok).toBe(false);
    expect(result.current.thread.nodes).toHaveLength(1);
    expect(result.current.thread.error).toBe('目录非空');
  });

  it('同一线程同时只有一次刷新在飞', async () => {
    let resolveRoot!: (value: unknown) => void;
    api.listDirectory.mockImplementation(
      ({ path }: { path: string }) =>
        new Promise((resolve) => {
          if (path === '/')
            resolveRoot = () => resolve({ entries: rootEntries() });
          else resolve({ entries: [] });
        }),
    );
    const { result } = renderAt();
    const first = act(async () => {
      await result.current.refreshThreadTree();
    });
    const second = act(async () => {
      await result.current.refreshThreadTree({ silent: true });
    });

    resolveRoot(undefined);
    await Promise.all([first, second]);

    // 第二次被刷新门挡下，根目录只请求一次
    expect(
      api.listDirectory.mock.calls.filter(
        ([input]) => (input as { path?: string }).path === '/',
      ),
    ).toHaveLength(1);
  });

  it('轮询开启时按间隔静默刷新，关闭时不挂', async () => {
    vi.useFakeTimers();
    api.listDirectory.mockImplementation(async ({ path }: { path: string }) =>
      path === '/' ? rootEntries() : [],
    );
    const { result } = renderWithClient(() =>
      usePanelFilesystem({ threadId: 't-1', pollingEnabled: true }),
    );
    await act(async () => {
      await result.current.refreshThreadTree();
    });
    const callsBefore = api.listDirectory.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(api.listDirectory.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('切线程后两套树都重置', async () => {
    api.listDirectory.mockResolvedValue(rootEntries());
    const { result, rerender } = renderWithClient(
      ({ threadId }) => usePanelFilesystem({ threadId, pollingEnabled: false }),
      { initialProps: { threadId: 't-1' as string | undefined } },
    );
    await act(async () => {
      await result.current.refreshThreadTree();
    });
    expect(result.current.thread.nodes).toHaveLength(4);

    rerender({ threadId: 't-2' });

    expect(result.current.thread.nodes).toEqual([]);
  });

  it('个人空间加载过就不再拉，显式 force 才重拉', async () => {
    api.listDirectory.mockResolvedValue([entry('/agents/', true)]);
    const { result } = renderAt();
    await act(async () => {
      await result.current.refreshWorkspaceTree();
    });
    const callsAfterFirst = api.listDirectory.mock.calls.length;

    await act(async () => {
      await result.current.refreshWorkspaceTree();
    });
    expect(api.listDirectory.mock.calls.length).toBe(callsAfterFirst);

    await act(async () => {
      await result.current.refreshWorkspaceTree({ force: true });
    });
    expect(api.listDirectory.mock.calls.length).toBeGreaterThan(
      callsAfterFirst,
    );
  });

  it('个人空间的节点不是 workdir 文件', async () => {
    api.listDirectory.mockResolvedValue([entry('/agents/', true)]);
    const { result } = renderAt();
    await act(async () => {
      await result.current.refreshWorkspaceTree();
    });

    expect(result.current.workspace.nodes[0]?.fileData).toMatchObject({
      workdir: false,
      workspace: true,
    });
  });
});

describe('usePanelFileSearch', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
  });

  it('查询词为空时不发请求', async () => {
    const { result } = renderWithClient(() =>
      usePanelFileSearch({
        scope: 'thread',
        threadId: 't-1',
        query: '  ',
        enabled: true,
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(false));
    expect(api.searchEntries).not.toHaveBeenCalled();
  });

  it('按作用域发请求并返回条目', async () => {
    api.searchEntries.mockResolvedValue([entry('/a/report.md')]);
    const { result } = renderWithClient(() =>
      usePanelFileSearch({
        scope: 'workspace',
        threadId: undefined,
        query: 'report',
        enabled: true,
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.searchEntries).toHaveBeenCalledWith({
      scope: 'workspace',
      threadId: undefined,
      query: 'report',
    });
    expect(result.current.data?.map((item) => item.path)).toEqual([
      '/a/report.md',
    ]);
  });
});
