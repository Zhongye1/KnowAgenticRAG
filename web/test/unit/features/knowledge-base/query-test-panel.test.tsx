import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: {
    queryParams: vi.fn(),
    sampleQuestions: vi.fn(),
    queryTest: vi.fn(),
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
      getQueryParams: (...args: unknown[]) => api.queryParams(...args),
      listSampleQuestions: (...args: unknown[]) => api.sampleQuestions(...args),
      queryTest: (...args: unknown[]) => api.queryTest(...args),
    },
  };
});

const { QueryTestPanel } =
  await import('@/features/knowledge-base/ui/query-test-panel');

const renderPanel = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <QueryTestPanel kbId="kb-1" />
    </QueryClientProvider>,
  );
};

const submit = async (text: string) => {
  await userEvent.type(screen.getByLabelText('检索测试查询'), text);
  await userEvent.click(screen.getByRole('button', { name: /检索/ }));
};

describe('检索测试面板', () => {
  beforeEach(() => {
    api.queryParams.mockReset().mockResolvedValue({
      type: 'milvus',
      options: [{ key: 'final_top_k', type: 'number', default: 10 }],
    });
    api.sampleQuestions.mockReset().mockResolvedValue([]);
    api.queryTest.mockReset();
  });

  it('提交时用后端下发的默认参数，并展示命中内容与分数', async () => {
    api.queryTest.mockResolvedValue([
      {
        content: '命中片段',
        score: 0.9123,
        rerank_score: 0.5,
        distance: 0.1234,
        metadata: { source: 'brief/a.md', file_id: 'f-1', chunk_index: 3 },
      },
    ]);
    renderPanel();

    await submit('这个库讲了什么');

    await waitFor(() =>
      expect(api.queryTest).toHaveBeenCalledWith('kb-1', '这个库讲了什么', {
        final_top_k: 10,
        include_distances: true,
      }),
    );
    const results = await screen.findByTestId('query-test-results');
    expect(results).toHaveTextContent('命中片段');
    expect(results).toHaveTextContent('相似度: 91.23%');
    expect(results).toHaveTextContent('重排序分数: 50.00%');
    expect(results).toHaveTextContent('距离: 0.1234');
    expect(results).toHaveTextContent('来源: brief/a.md');
    expect(results).toHaveTextContent('文件ID: f-1');
    expect(results).toHaveTextContent('块索引: 3');
  });

  it('没有命中时给出空态', async () => {
    api.queryTest.mockResolvedValue([]);
    renderPanel();

    await submit('无关问题');

    expect(await screen.findByText('没有命中任何分块。')).toBeTruthy();
  });

  it('检索失败给出后端原因，不画成空结果', async () => {
    api.queryTest.mockRejectedValue(new Error('测试查询失败: 未配置检索服务'));
    renderPanel();

    await submit('问题');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '测试查询失败: 未配置检索服务',
    );
    expect(screen.queryByText('没有命中任何分块。')).toBeNull();
  });

  it('上一次的命中不留在这次的失败提示旁边', async () => {
    api.queryTest.mockResolvedValueOnce([
      { content: '上一次的命中片段', score: 0.9, metadata: {} },
    ]);
    renderPanel();

    await submit('第一次');
    expect(await screen.findByText(/上一次的命中片段/)).toBeTruthy();

    api.queryTest.mockRejectedValueOnce(new Error('测试查询失败: 服务不可用'));
    await userEvent.clear(screen.getByLabelText('检索测试查询'));
    await submit('第二次');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '测试查询失败: 服务不可用',
    );
    expect(screen.queryByText(/上一次的命中片段/)).toBeNull();
  });

  it('空查询不请求，提示先输入', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /检索/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '请输入查询内容。',
    );
    expect(api.queryTest).not.toHaveBeenCalled();
  });

  it('回车提交，示例问题一键填入', async () => {
    api.sampleQuestions.mockResolvedValue(['库里有几个文件？']);
    api.queryTest.mockResolvedValue([]);
    renderPanel();

    const example = await screen.findByRole('button', {
      name: '库里有几个文件？',
    });
    await userEvent.click(example);
    expect(screen.getByLabelText('检索测试查询')).toHaveValue(
      '库里有几个文件？',
    );

    await userEvent.type(screen.getByLabelText('检索测试查询'), '{Enter}');
    await waitFor(() => expect(api.queryTest).toHaveBeenCalled());
  });
});
