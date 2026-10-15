/**
 * 图谱查询装配：轮询条件、参数进键、写操作失效范围。
 *
 * 这里断言的是「什么时候会再发一次请求」与「失效了哪些缓存」，
 * 后端行为由 graph-api 的用例负责。
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: {
    subgraph: vi.fn(),
    status: vi.fn(),
    failedChunks: vi.fn(),
    configure: vi.fn(),
    index: vi.fn(),
    reset: vi.fn(),
    reconcile: vi.fn(),
  },
}));

vi.mock('@/features/knowledge-base/api/graph-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/graph-api')
  >('@/features/knowledge-base/api/graph-api');
  return {
    ...actual,
    graphApi: {
      ...actual.graphApi,
      getSubgraph: (...args: unknown[]) => api.subgraph(...args),
      getGraphBuildStatus: (...args: unknown[]) => api.status(...args),
      getGraphBuildFailedChunks: (...args: unknown[]) =>
        api.failedChunks(...args),
      configureGraphBuild: (...args: unknown[]) => api.configure(...args),
      indexGraphBuild: (...args: unknown[]) => api.index(...args),
      resetGraphBuild: (...args: unknown[]) => api.reset(...args),
      reconcileGraphBuild: (...args: unknown[]) => api.reconcile(...args),
    },
  };
});

const {
  DEFAULT_SUBGRAPH_PARAMS,
  graphKeys,
  isGraphBuildActive,
  useGraphBuildStatus,
  useGraphFailedChunks,
  useGraphSubgraph,
  useResetGraphBuild,
} = await import('@/features/knowledge-base/model/graph-queries');

const statusFixture = (extra: Record<string, unknown> = {}) => ({
  kb_id: 'kb-1',
  kb_type: 'milvus',
  configured: true,
  locked: true,
  config: null,
  total_chunks: 10,
  pending_chunks: 0,
  indexed_chunks: 10,
  structured_chunks: 10,
  extraction_counts: { pending: 0, succeeded: 10, failed: 0 },
  vector_counts: { pending: 0, processing: 0, indexed: 10, failed: 0 },
  entity_count: 3,
  relationship_count: 2,
  build_task_status: null,
  build_task_progress: 0,
  ...extra,
});

let queryClient: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('构建中判定', () => {
  it('只有 pending/running 算构建中', () => {
    expect(
      isGraphBuildActive(statusFixture({ build_task_status: 'running' })),
    ).toBe(true);
    expect(
      isGraphBuildActive(statusFixture({ build_task_status: 'pending' })),
    ).toBe(true);
    expect(
      isGraphBuildActive(statusFixture({ build_task_status: 'completed' })),
    ).toBe(false);
    expect(isGraphBuildActive(undefined)).toBe(false);
  });
});

describe('状态轮询', () => {
  it('任务在跑时按间隔重取，任务收尾后停止', async () => {
    vi.useFakeTimers();
    api.status
      .mockResolvedValueOnce(statusFixture({ build_task_status: 'running' }))
      .mockResolvedValue(statusFixture({ build_task_status: 'completed' }));

    const { result } = renderHook(() => useGraphBuildStatus('kb-1'), {
      wrapper,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.data?.build_task_status).toBe('running');
    expect(api.status).toHaveBeenCalledTimes(1);

    // 第一次轮询拿回 completed，此后不再排新的轮询
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(api.status).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(api.status).toHaveBeenCalledTimes(2);
  });

  it('没有任务在跑时一次都不轮询', async () => {
    vi.useFakeTimers();
    api.status.mockResolvedValue(statusFixture());

    renderHook(() => useGraphBuildStatus('kb-1'), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.status).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(api.status).toHaveBeenCalledTimes(1);
  });
});

describe('子图查询', () => {
  it('参数进 queryKey：换深度就是换一份缓存', async () => {
    api.subgraph.mockResolvedValue({ nodes: [], edges: [] });

    const { rerender } = renderHook(
      ({ maxDepth }: { maxDepth: number }) =>
        useGraphSubgraph('kb-1', { ...DEFAULT_SUBGRAPH_PARAMS, maxDepth }),
      { wrapper, initialProps: { maxDepth: 2 } },
    );
    await waitFor(() => expect(api.subgraph).toHaveBeenCalledTimes(1));

    rerender({ maxDepth: 3 });
    await waitFor(() => expect(api.subgraph).toHaveBeenCalledTimes(2));
    expect(api.subgraph).toHaveBeenLastCalledWith('kb-1', {
      nodeLabel: '*',
      maxDepth: 3,
      maxNodes: 100,
      excludeChunk: true,
    });
  });

  it('enabled=false 时不发请求', async () => {
    api.subgraph.mockResolvedValue({ nodes: [], edges: [] });

    renderHook(
      () =>
        useGraphSubgraph('kb-1', DEFAULT_SUBGRAPH_PARAMS, { enabled: false }),
      {
        wrapper,
      },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(api.subgraph).not.toHaveBeenCalled();
  });
});

describe('失败样例查询', () => {
  it('弹窗没打开时不拉', async () => {
    api.failedChunks.mockResolvedValue([]);

    renderHook(() => useGraphFailedChunks('kb-1', false), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.failedChunks).not.toHaveBeenCalled();
  });

  it('打开后取 10 条样例', async () => {
    api.failedChunks.mockResolvedValue([
      {
        chunk_id: 'c-1',
        file_id: 'f-1',
        chunk_index: 0,
        content: 'x',
        details: null,
      },
    ]);

    const { result } = renderHook(() => useGraphFailedChunks('kb-1', true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(api.failedChunks).toHaveBeenCalledWith('kb-1', 10);
  });
});

describe('写操作失效范围', () => {
  it('重置同时作废状态与子图缓存', async () => {
    api.reset.mockResolvedValue({ message: 'ok', reset_chunks: 2 });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(
      graphKeys.subgraph('kb-1', DEFAULT_SUBGRAPH_PARAMS),
      {
        nodes: [],
        edges: [],
      },
    );

    const { result } = renderHook(() => useResetGraphBuild('kb-1'), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({
        clearExtractionResult: true,
        clearConfig: true,
      });
    });

    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(graphKeys.status('kb-1'));
    expect(keys).toContainEqual([...graphKeys.all, 'subgraph', 'kb-1']);
    expect(
      queryClient.getQueryState(
        graphKeys.subgraph('kb-1', DEFAULT_SUBGRAPH_PARAMS),
      )?.isInvalidated,
    ).toBe(true);
  });
});
