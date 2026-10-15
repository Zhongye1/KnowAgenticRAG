/**
 * 评估查询装配：轮询只在「有生成中 / 有运行中」时打开，任务结束自停。
 *
 * 这条判据此前没有用例（评审用变异证明过它可被无声改坏），这里直接盯 `refetchInterval`
 * 的行为：数请求次数。
 */
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: { listDatasets: vi.fn(), listRuns: vi.fn(), getRunResults: vi.fn() },
}));

vi.mock('@/features/knowledge-base/api/evaluation-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/evaluation-api')
  >('@/features/knowledge-base/api/evaluation-api');
  return {
    ...actual,
    evaluationApi: {
      ...actual.evaluationApi,
      listDatasets: (...args: unknown[]) => api.listDatasets(...args),
      listRuns: (...args: unknown[]) => api.listRuns(...args),
      getRunResults: (...args: unknown[]) => api.getRunResults(...args),
    },
  };
});

const { useEvaluationDatasets, useEvaluationRuns } =
  await import('@/features/knowledge-base/model/evaluation-queries');

const dataset = (status: string) => ({
  dataset_id: 'ds-1',
  name: '基准',
  build_metadata: { status },
});

const run = (status: string) => ({
  run_id: 'run_1',
  name: 'eval',
  dataset_id: 'ds-1',
  status,
  total_items: 1,
  completed_items: 1,
  metrics: {},
});

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  vi.useFakeTimers();
  for (const fn of Object.values(api)) fn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('数据集列表轮询', () => {
  it('没有生成中的行时不轮询', async () => {
    api.listDatasets.mockResolvedValue([
      dataset('completed'),
      dataset('failed'),
    ]);
    renderHook(() => useEvaluationDatasets('kb-1'), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(api.listDatasets).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(api.listDatasets).toHaveBeenCalledTimes(1);
  });

  it('有生成中的行时按 3 秒重取，转为完成后自停', async () => {
    api.listDatasets
      .mockResolvedValueOnce([dataset('running')])
      .mockResolvedValue([dataset('completed')]);
    const { result } = renderHook(() => useEvaluationDatasets('kb-1'), {
      wrapper,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.data?.[0].build_metadata.status).toBe('running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.listDatasets).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(api.listDatasets).toHaveBeenCalledTimes(2);
  });
});

describe('运行历史轮询', () => {
  it('没有运行中的记录时不轮询', async () => {
    api.listRuns.mockResolvedValue([run('completed')]);
    renderHook(() => useEvaluationRuns('kb-1'), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(api.listRuns).toHaveBeenCalledTimes(1);
  });

  it('有运行中的记录时按 3 秒重取', async () => {
    api.listRuns
      .mockResolvedValueOnce([run('running')])
      .mockResolvedValue([run('completed')]);
    renderHook(() => useEvaluationRuns('kb-1'), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.listRuns).toHaveBeenCalledTimes(2);
  });
});
