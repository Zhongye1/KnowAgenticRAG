import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// antd 词汇由应用装配承载（面板的通知走 App.useApp），测试同构挂上
import { AntdProvider } from '@/app/theme/antd-provider';

const { api } = vi.hoisted(() => ({
  api: {
    queryParams: vi.fn(),
    sampleQuestions: vi.fn(),
    generateQuestions: vi.fn(),
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
      generateSampleQuestions: (...args: unknown[]) =>
        api.generateQuestions(...args),
      queryTest: (...args: unknown[]) => api.queryTest(...args),
    },
  };
});

const { QueryTestPanel } =
  await import('@/features/knowledge-base/ui/query/query-test-panel');

const renderPanel = (readOnly = false) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <AntdProvider>
      <QueryClientProvider client={queryClient}>
        <QueryTestPanel kbId="kb-1" readOnly={readOnly} />
      </QueryClientProvider>
    </AntdProvider>,
  );
};

const queryBox = () => screen.getByLabelText('检索测试查询');

const submit = async (text: string) => {
  await userEvent.type(queryBox(), text);
  await userEvent.click(screen.getByRole('button', { name: '检索' }));
};

describe('检索测试面板', () => {
  beforeEach(() => {
    api.queryParams.mockReset().mockResolvedValue({
      type: 'milvus',
      options: [{ key: 'final_top_k', type: 'number', default: 10 }],
    });
    api.sampleQuestions.mockReset().mockResolvedValue([]);
    api.generateQuestions.mockReset();
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

    expect(await screen.findByText('未找到相关结果')).toBeTruthy();
  });

  it('检索失败给出后端原因，不画成空结果', async () => {
    api.queryTest.mockRejectedValue(new Error('测试查询失败: 未配置检索服务'));
    renderPanel();

    await submit('问题');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '测试查询失败: 未配置检索服务',
    );
    expect(screen.queryByText('未找到相关结果')).toBeNull();
  });

  it('上一次的命中不留在这次的失败提示旁边', async () => {
    api.queryTest.mockResolvedValueOnce([
      { content: '上一次的命中片段', score: 0.9, metadata: {} },
    ]);
    renderPanel();

    await submit('第一次');
    expect(await screen.findByText(/上一次的命中片段/)).toBeTruthy();

    api.queryTest.mockRejectedValueOnce(new Error('测试查询失败: 服务不可用'));
    await userEvent.clear(queryBox());
    await submit('第二次');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '测试查询失败: 服务不可用',
    );
    expect(screen.queryByText(/上一次的命中片段/)).toBeNull();
  });

  it('空查询时提交钮禁用，回车也不请求，并提示先输入', async () => {
    renderPanel();

    expect(screen.getByRole('button', { name: '检索' })).toBeDisabled();

    await userEvent.type(queryBox(), '{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '请输入查询内容。',
    );
    expect(api.queryTest).not.toHaveBeenCalled();
  });

  it('回车提交', async () => {
    api.queryTest.mockResolvedValue([]);
    renderPanel();

    await userEvent.type(queryBox(), '回车的问题{Enter}');

    await waitFor(() =>
      expect(api.queryTest).toHaveBeenCalledWith(
        'kb-1',
        '回车的问题',
        expect.any(Object),
      ),
    );
  });

  it('点示例问题直接发起检索，而不是只填入输入框', async () => {
    api.sampleQuestions.mockResolvedValue(['库里有几个文件？']);
    api.queryTest.mockResolvedValue([]);
    renderPanel();

    const example = await screen.findByTestId('sample-question');
    await userEvent.click(example);

    expect(queryBox()).toHaveValue('库里有几个文件？');
    await waitFor(() =>
      expect(api.queryTest).toHaveBeenCalledWith(
        'kb-1',
        '库里有几个文件？',
        expect.any(Object),
      ),
    );
  });

  it('示例问题最多展示 10 条', async () => {
    api.sampleQuestions.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => `问题 ${index}`),
    );
    renderPanel();

    await waitFor(() =>
      expect(screen.getAllByTestId('sample-question')).toHaveLength(10),
    );
  });

  it('原始数据切换显示整个响应体，切回来仍是格式化结果', async () => {
    api.queryTest.mockResolvedValue([
      { content: '命中片段', score: 0.5, metadata: {} },
    ]);
    renderPanel();

    await submit('问题');
    await screen.findByTestId('query-test-results');

    await userEvent.click(screen.getByRole('button', { name: '切换原始数据' }));

    expect(screen.queryByTestId('query-test-results')).toBeNull();
    expect(screen.getByText(/"content": "命中片段"/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '切换原始数据' }));

    expect(await screen.findByTestId('query-test-results')).toBeTruthy();
  });

  it('清空结果后回到示例问题', async () => {
    api.sampleQuestions.mockResolvedValue(['回到示例']);
    api.queryTest.mockResolvedValue([
      { content: '命中片段', score: 0.5, metadata: {} },
    ]);
    renderPanel();

    await submit('问题');
    await screen.findByTestId('query-test-results');
    // 有结果时示例问题让位
    expect(screen.queryByTestId('sample-question')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '清空' }));

    expect(screen.queryByTestId('query-test-results')).toBeNull();
    expect(await screen.findByTestId('sample-question')).toBeTruthy();
  });

  it('可管理时给出生成入口，点击调生成接口', async () => {
    api.generateQuestions.mockResolvedValue(['新问题 1', '新问题 2']);
    api.sampleQuestions.mockResolvedValue(['旧问题']);
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: '重新生成' }),
    );

    await waitFor(() =>
      expect(api.generateQuestions).toHaveBeenCalledWith('kb-1', 10),
    );
  });

  it('没有示例问题时可管理给生成入口，只读只说暂无', async () => {
    renderPanel();

    expect(
      await screen.findByRole('button', { name: '生成示例问题' }),
    ).toBeTruthy();
  });

  it('只读知识库不给任何生成示例问题的入口', async () => {
    renderPanel(true);

    expect(await screen.findByText('暂无示例问题')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '生成示例问题' })).toBeNull();
    expect(screen.queryByRole('button', { name: '重新生成' })).toBeNull();
  });
});
