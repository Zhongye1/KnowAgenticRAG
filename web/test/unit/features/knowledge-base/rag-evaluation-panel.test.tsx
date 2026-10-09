/**
 * RAG 评估分区：无基准引导、启动表单校验与提交体、历史表指标、结果弹层与仅看错误。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 这套用例逐个靠 userEvent 驱动 Radix 弹窗与下拉，全套件并行跑时会超过默认 5 秒预算；
 * 这里给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

const { api, notifications, confirmMock } = vi.hoisted(() => ({
  api: {
    listRuns: vi.fn(),
    listDatasets: vi.fn(),
    runEvaluation: vi.fn(),
    deleteRun: vi.fn(),
    getRunResults: vi.fn(),
    models: vi.fn(),
  },
  notifications: { addNotification: vi.fn() },
  confirmMock: vi.fn(),
}));

vi.mock('@/features/knowledge-base/api/evaluation-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/evaluation-api')
  >('@/features/knowledge-base/api/evaluation-api');
  return {
    ...actual,
    evaluationApi: {
      ...actual.evaluationApi,
      listRuns: (...args: unknown[]) => api.listRuns(...args),
      listDatasets: (...args: unknown[]) => api.listDatasets(...args),
      runEvaluation: (...args: unknown[]) => api.runEvaluation(...args),
      deleteRun: (...args: unknown[]) => api.deleteRun(...args),
      getRunResults: (...args: unknown[]) => api.getRunResults(...args),
    },
  };
});

vi.mock('@/features/knowledge-base/api/knowledge-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/knowledge-api')
  >('@/features/knowledge-base/api/knowledge-api');
  return {
    ...actual,
    knowledgeApi: {
      ...actual.knowledgeApi,
      listModels: (...args: unknown[]) => api.models(...args),
    },
  };
});

vi.mock('@/shared/ui/notifications', async () => {
  const actual = await vi.importActual<
    typeof import('@/shared/ui/notifications')
  >('@/shared/ui/notifications');
  return { ...actual, useNotifications: () => notifications };
});

vi.mock('@/shared/ui/confirm-dialog', () => ({
  confirm: (...args: unknown[]) => confirmMock(...args),
}));

const { RagEvaluationPanel } =
  await import('@/features/knowledge-base/ui/rag-evaluation-panel');

const dataset = (extra: Record<string, unknown> = {}) => ({
  id: 'ds-1',
  dataset_id: 'ds-1',
  name: '基准甲',
  description: '',
  kb_id: 'kb-1',
  item_count: 12,
  has_gold_chunks: true,
  has_gold_answers: true,
  build_metadata: { status: 'completed' },
  created_by: 'u-1',
  created_at: null,
  updated_at: null,
  ...extra,
});

const run = (extra: Record<string, unknown> = {}) => ({
  run_id: 'run_12345678',
  name: 'eval-20261009-abcdef',
  dataset_id: 'ds-1',
  status: 'completed',
  started_at: '2026-10-09T02:00:00Z',
  completed_at: '2026-10-09T02:00:12.300Z',
  total_items: 12,
  completed_items: 12,
  overall_score: 0.87,
  retrieval_config: {},
  metrics: { 'recall@10': 0.9 },
  ...extra,
});

const renderPanel = (
  props: Partial<React.ComponentProps<typeof RagEvaluationPanel>> = {},
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onGoToBenchmarks = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <RagEvaluationPanel
        kbId="kb-1"
        readOnly={false}
        onGoToBenchmarks={onGoToBenchmarks}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onGoToBenchmarks };
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  notifications.addNotification.mockReset();
  confirmMock.mockReset();
  api.listDatasets.mockResolvedValue([dataset()]);
  api.listRuns.mockResolvedValue([run()]);
  api.models.mockResolvedValue({
    openai: {
      provider_id: 'openai',
      provider_display_name: 'OpenAI',
      models: [
        { spec: 'openai/gpt-4o', model_id: 'gpt-4o', display_name: 'GPT-4o' },
      ],
    },
  });
  api.runEvaluation.mockResolvedValue({ run_id: 'run_new' });
  api.deleteRun.mockResolvedValue(undefined);
  api.getRunResults.mockResolvedValue({
    run_id: 'run_12345678',
    name: 'eval-20261009-abcdef',
    status: 'completed',
    started_at: '2026-10-09T02:00:00Z',
    completed_at: '2026-10-09T02:00:12.300Z',
    total_items: 12,
    completed_items: 12,
    overall_score: 0.87,
    items: [
      {
        query: '这个库讲了什么？',
        generated_answer: '讲了三件事',
        metrics: {
          'recall@10': 0.9,
          'f1@10': 0.8,
          score: 1,
          reasoning: '命中',
        },
      },
    ],
    pagination: {
      current_page: 1,
      page_size: 50,
      total: 1,
      total_pages: 1,
      error_only: false,
    },
  });
});

describe('RAG 评估分区', () => {
  it('没有可用基准时引导去基准管理', async () => {
    api.listDatasets.mockResolvedValue([]);
    const { onGoToBenchmarks } = renderPanel();

    expect(await screen.findByText('暂无可用评估基准')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '前往基准管理' }));

    expect(onGoToBenchmarks).toHaveBeenCalledTimes(1);
  });

  it('生成中的基准不能选来跑评估', async () => {
    api.listDatasets.mockResolvedValue([
      dataset({ build_metadata: { status: 'running', progress: 10 } }),
    ]);
    api.listRuns.mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByText('暂无可用评估基准')).toBeTruthy();
  });

  it('没有历史时给空态', async () => {
    api.listRuns.mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByText('暂无评估记录')).toBeTruthy();
  });

  it('最近一次卡片给出评分、状态、数据集名与四个指标', async () => {
    renderPanel();

    expect(await screen.findByLabelText('最近一次评估')).toBeTruthy();
    expect(screen.getByText('87%')).toBeTruthy();
    expect(screen.getAllByText(/基准甲/).length).toBeGreaterThan(0);
    // 耗时与数据量在「最近一次」卡片和历史表里各出现一次
    expect(screen.getAllByText('12.3s').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12/12').length).toBeGreaterThan(0);
  });

  it('两个模型必须同时选：只选一个时拦下', async () => {
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: /新建评估/ }),
    );
    await userEvent.click(
      screen.getByRole('combobox', { name: '答案生成模型' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: /GPT-4o/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: /开始评估/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '生成模型和评估模型必须同时选择或者同时不选择。',
    );
    expect(api.runEvaluation).not.toHaveBeenCalled();
  });

  it('两个模型都选后按 model_config 提交', async () => {
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: /新建评估/ }),
    );
    await userEvent.click(
      screen.getByRole('combobox', { name: '答案生成模型' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: /GPT-4o/ }),
    );
    await userEvent.click(
      screen.getByRole('combobox', { name: '答案评判模型' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: /GPT-4o/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: /开始评估/ }));

    await waitFor(() =>
      expect(api.runEvaluation).toHaveBeenCalledWith(
        'kb-1',
        expect.objectContaining({
          dataset_id: 'ds-1',
          model_config: {
            answer_llm: 'openai/gpt-4o',
            judge_llm: 'openai/gpt-4o',
          },
        }),
      ),
    );
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: '评估任务已开始。' }),
    );
  });

  it('没有标准答案的基准禁用两个模型并说明只跑检索', async () => {
    api.listDatasets.mockResolvedValue([dataset({ has_gold_answers: false })]);
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: /新建评估/ }),
    );

    expect(
      screen.getByText('当前基准只会执行检索评估，无需选择模型。'),
    ).toBeTruthy();
    expect(
      screen.getByRole('combobox', { name: '答案生成模型' }),
    ).toBeDisabled();
  });

  it('历史表按运行展示指标与状态', async () => {
    renderPanel();

    const table = await screen.findByRole('table');
    expect(table).toHaveTextContent('eval-20261009-abcdef');
    expect(table).toHaveTextContent('基准甲');
    expect(table).toHaveTextContent('90.0%');
    expect(table).toHaveTextContent('已完成');
  });

  it('点查看打开结果：逐条指标、答案评判与生成答案', async () => {
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: '查看' }));

    expect(await screen.findByLabelText('评估结果')).toBeTruthy();
    expect(screen.getByText('这个库讲了什么？')).toBeTruthy();
    expect(screen.getByText('生成答案：讲了三件事')).toBeTruthy();
    expect(screen.getByText('R@10:')).toBeTruthy();
    expect(screen.getByText('F1@10:')).toBeTruthy();
    expect(screen.getByText('正确')).toBeTruthy();
  });

  it('仅看错误会带上 error_only 并回到第一页', async () => {
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: '查看' }));
    await screen.findByLabelText('评估结果');
    await userEvent.click(screen.getByRole('button', { name: '仅查看错误' }));

    await waitFor(() =>
      expect(api.getRunResults).toHaveBeenLastCalledWith(
        'kb-1',
        'run_12345678',
        {
          page: 1,
          pageSize: 50,
          errorOnly: true,
        },
      ),
    );
    expect(screen.getByRole('button', { name: '显示全部' })).toBeTruthy();
  });

  it('删除评估记录要确认', async () => {
    confirmMock.mockResolvedValue(true);
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /操作/ }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /删除/ }),
    );

    await waitFor(() =>
      expect(api.deleteRun).toHaveBeenCalledWith('kb-1', 'run_12345678'),
    );
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: '删除成功。' }),
    );
  });

  it('只读知识库不给开始评估与删除入口，但可以查看结果', async () => {
    renderPanel({ readOnly: true });

    await screen.findByLabelText('最近一次评估');
    expect(screen.queryByRole('button', { name: /新建评估/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /操作/ })).toBeNull();
    expect(screen.getByRole('button', { name: '查看' })).toBeTruthy();
  });

  it('等待运行中的记录：显示进度与消息', async () => {
    api.listRuns.mockResolvedValue([
      run({
        status: 'running',
        completed_at: null,
        progress: 40,
        message: '评估 4/12',
      }),
    ]);
    renderPanel();

    const bar = await screen.findByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getAllByText('评估 4/12').length).toBeGreaterThan(0);
  });

  it('基准查询失败时说加载失败，不伪装成「暂无基准」', async () => {
    api.listRuns.mockResolvedValue([]);
    api.listDatasets.mockRejectedValue(new Error('403 Forbidden'));
    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '加载评估基准失败：403 Forbidden',
    );
    expect(screen.queryByText('暂无可用评估基准')).toBeNull();
  });

  it('加载历史失败给出原因与重试', async () => {
    api.listRuns.mockRejectedValue(new Error('boom'));
    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '加载评估历史失败：',
    );
    expect(screen.getByRole('button', { name: /重试/ })).toBeTruthy();
  });
});
