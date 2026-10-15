import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    generate: vi.fn(),
  },
}));

vi.mock('@/features/knowledge-base/api/knowledge-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/knowledge-api')
  >('@/features/knowledge-base/api/knowledge-api');
  return {
    ...actual,
    knowledgeApi: {
      ...actual.knowledgeApi,
      get: (...args: unknown[]) => api.get(...args),
      generateSampleQuestions: (...args: unknown[]) => api.generate(...args),
    },
  };
});

const { knowledgeKeys } = await import('@/features/knowledge-base');
const { useAutoSampleQuestions } =
  await import('@/features/knowledge-base/model/use-auto-sample-questions');

/** 详情查询的最小形状：钩子只读 `stats.file_count` 与 `additional_params`。 */
const detailOf = (fileCount: number, autoGenerate = true) => ({
  kb_id: 'kb-1',
  name: '知识库',
  kb_type: 'milvus',
  can_manage: true,
  stats: { file_count: fileCount },
  additional_params: { auto_generate_questions: autoGenerate },
});

const Harness = ({ canManage }: { canManage: boolean }) => {
  useAutoSampleQuestions('kb-1', { canManage });
  return null;
};

const renderHarness = (canManage = true) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <Harness canManage={canManage} />
    </QueryClientProvider>,
  );
  return queryClient;
};

/** 等首次取数与随之而来的 effect 落地。 */
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

/** 换一个文件数并重新取数；钩子应当把它当成一次变化。 */
const setFileCount = async (
  queryClient: QueryClient,
  count: number,
  autoGenerate = true,
) => {
  api.get.mockResolvedValue(detailOf(count, autoGenerate));
  await act(async () => {
    await queryClient.refetchQueries({
      queryKey: knowledgeKeys.detail('kb-1'),
    });
    await vi.advanceTimersByTimeAsync(0);
  });
};

const setQuestions = (queryClient: QueryClient, questions: string[]) =>
  queryClient.setQueryData(knowledgeKeys.sampleQuestions('kb-1'), questions);

const cachedQuestions = (queryClient: QueryClient) =>
  queryClient.getQueryData(knowledgeKeys.sampleQuestions('kb-1'));

describe('文件数变化时的示例问题生命周期', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.get.mockReset();
    api.generate.mockReset().mockResolvedValue(['新问题']);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('首次观察到的文件数只是加载，不算新增，不生成', async () => {
    api.get.mockResolvedValue(detailOf(3));
    renderHarness();
    await settle();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(api.generate).not.toHaveBeenCalled();
  });

  it('文件数从 0 变到 2 时等 3 秒再静默生成一次', async () => {
    api.get.mockResolvedValue(detailOf(0));
    const queryClient = renderHarness();
    await settle();

    await setFileCount(queryClient, 2);

    // 还没到 3 秒：不生成（等的是后台把文件记录建出来）
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2900);
    });
    expect(api.generate).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(api.generate).toHaveBeenCalledTimes(1);
    expect(api.generate.mock.calls[0][0]).toBe('kb-1');
  });

  it('知识库没打开自动生成时不生成', async () => {
    api.get.mockResolvedValue(detailOf(0, false));
    const queryClient = renderHarness();
    await settle();

    await setFileCount(queryClient, 3, false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(api.generate).not.toHaveBeenCalled();
  });

  it('不可管理时不生成，改为清掉列表面', async () => {
    api.get.mockResolvedValue(detailOf(0));
    const queryClient = renderHarness(false);
    await settle();
    setQuestions(queryClient, ['旧的示例问题']);

    await setFileCount(queryClient, 2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(api.generate).not.toHaveBeenCalled();
    expect(cachedQuestions(queryClient)).toEqual([]);
  });

  it('文件数归零时清掉列表面', async () => {
    api.get.mockResolvedValue(detailOf(4));
    const queryClient = renderHarness();
    await settle();
    setQuestions(queryClient, ['旧的示例问题']);

    await setFileCount(queryClient, 0);

    // 1 秒前还在
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(cachedQuestions(queryClient)).toEqual(['旧的示例问题']);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(cachedQuestions(queryClient)).toEqual([]);
  });
});
