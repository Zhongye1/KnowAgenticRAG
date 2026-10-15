/**
 * 个人空间写入层的失效规则。
 *
 * 四个写入都必须让目录查询失效（列表、计数、搜索都挂在同一前缀下），否则界面会停在旧列表上。
 * 用例包一层真实 `QueryClientProvider` 并监听 `invalidateQueries`：去掉任何一处 `onSuccess`
 * 失效，对应用例立即变红。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listWorkspaceEntries: vi.fn(),
  searchWorkspaceEntries: vi.fn(),
  fetchWorkspaceFile: vi.fn(),
  saveWorkspaceFile: vi.fn(),
  deleteWorkspaceEntry: vi.fn(),
  createWorkspaceDirectory: vi.fn(),
  uploadWorkspaceFiles: vi.fn(),
  downloadWorkspaceEntry: vi.fn(),
}));

vi.mock('@/entities/workspace/api/workspace-api', () => api);

const {
  WORKSPACE_QUERY_ROOT,
  useCreateWorkspaceDirectory,
  useDeleteWorkspaceEntry,
  useSaveWorkspaceFile,
  useUploadWorkspaceFiles,
} = await import('@/entities/workspace');

const setup = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children?: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return { invalidate, wrapper };
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

describe('个人空间写入后的失效', () => {
  it('删除成功后失效目录查询', async () => {
    api.deleteWorkspaceEntry.mockResolvedValue(undefined);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useDeleteWorkspaceEntry(), { wrapper });

    result.current.mutate({ path: '/a.md' });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: WORKSPACE_QUERY_ROOT,
      }),
    );
  });

  it('上传成功后失效目录查询', async () => {
    api.uploadWorkspaceFiles.mockResolvedValue([]);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUploadWorkspaceFiles(), { wrapper });

    result.current.mutate({
      parentPath: '/',
      files: [new File(['x'], 'a.md')],
    });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: WORKSPACE_QUERY_ROOT,
      }),
    );
  });

  it('新建目录成功后失效目录查询', async () => {
    api.createWorkspaceDirectory.mockResolvedValue('/reports/');
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateWorkspaceDirectory(), {
      wrapper,
    });

    result.current.mutate({ parentPath: '/', name: 'reports' });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: WORKSPACE_QUERY_ROOT,
      }),
    );
  });

  it('保存内容成功后失效目录查询', async () => {
    api.saveWorkspaceFile.mockResolvedValue(null);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSaveWorkspaceFile(), { wrapper });

    result.current.mutate({ path: '/a.md', content: 'x' });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: WORKSPACE_QUERY_ROOT,
      }),
    );
  });

  it('写入失败不失效（失败的写入没有改变列表）', async () => {
    api.deleteWorkspaceEntry.mockRejectedValue(new Error('boom'));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useDeleteWorkspaceEntry(), { wrapper });

    result.current.mutate({ path: '/a.md' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
