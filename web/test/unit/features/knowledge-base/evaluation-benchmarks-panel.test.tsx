/**
 * 评估基准分区：空态入口、列表标签与进度、操作菜单的可用性、删除确认、预览分页。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

// antd 词汇由应用装配承载，测试同构挂上
import { AntdProvider } from '@/app/theme/antd-provider';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 这套用例逐个靠 userEvent 驱动 Radix 弹窗与菜单，全套件并行跑时会超过默认 5 秒预算；
 * 这里给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

const { api, notifications, confirmMock, downloadMock } = vi.hoisted(() => ({
  api: {
    listDatasets: vi.fn(),
    getDataset: vi.fn(),
    resume: vi.fn(),
    deleteDataset: vi.fn(),
    download: vi.fn(),
  },
  notifications: { addNotification: vi.fn() },
  confirmMock: vi.fn(),
  downloadMock: vi.fn(),
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
      getDataset: (...args: unknown[]) => api.getDataset(...args),
      resumeDatasetGeneration: (...args: unknown[]) => api.resume(...args),
      deleteDataset: (...args: unknown[]) => api.deleteDataset(...args),
      downloadDataset: (...args: unknown[]) => api.download(...args),
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
  useConfirm: () => ({ confirm: (...args: unknown[]) => confirmMock(...args) }),
}));

vi.mock('@/features/knowledge-base/lib/file-download', () => ({
  triggerBlobDownload: (...args: unknown[]) => downloadMock(...args),
}));

const { EvaluationBenchmarksPanel } =
  await import('@/features/knowledge-base/ui/benchmarks/evaluation-benchmarks-panel');

const dataset = (extra: Record<string, unknown> = {}) => ({
  id: 'ds-1',
  dataset_id: 'ds-1',
  name: '我的基准',
  description: '说明',
  kb_id: 'kb-1',
  item_count: 12,
  has_gold_chunks: true,
  has_gold_answers: false,
  build_metadata: { status: 'completed' },
  created_by: 'u-1',
  created_at: '2026-10-08T02:00:00Z',
  updated_at: null,
  ...extra,
});

const renderPanel = (readOnly = false) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <AntdProvider>
      <QueryClientProvider client={queryClient}>
        <EvaluationBenchmarksPanel kbId="kb-1" readOnly={readOnly} />
      </QueryClientProvider>
    </AntdProvider>,
  );
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  notifications.addNotification.mockReset();
  confirmMock.mockReset();
  downloadMock.mockReset();
  api.listDatasets.mockResolvedValue([dataset()]);
  api.getDataset.mockResolvedValue({
    ...dataset(),
    items: [
      {
        item_id: 'it-1',
        item_index: 0,
        query: '这个库讲了什么？',
        gold_chunk_ids: ['c-1'],
        gold_answer: '讲了三件事',
      },
    ],
    pagination: {
      current_page: 1,
      page_size: 50,
      total_items: 1,
      total_pages: 1,
      has_next: false,
      has_prev: false,
    },
  });
  api.resume.mockResolvedValue({ message: '恢复生成中' });
  api.deleteDataset.mockResolvedValue(undefined);
  api.download.mockResolvedValue({
    blob: new Blob(['{}']),
    filename: '基准.jsonl',
  });
});

describe('评估基准分区', () => {
  it('没有基准时给两个入口', async () => {
    api.listDatasets.mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByText('暂无评估基准')).toBeTruthy();
    // 工具栏与空态各给一份入口（空态里的是引导，工具栏的是常驻）
    expect(screen.getAllByRole('button', { name: /上传基准/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /自动生成/ })).toHaveLength(2);
  });

  it('只读知识库：空态不给入口，列表行也不给操作菜单', async () => {
    api.listDatasets.mockResolvedValue([]);
    renderPanel(true);

    await screen.findByText('暂无评估基准');
    expect(screen.queryByRole('button', { name: /上传基准/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /自动生成/ })).toBeNull();
  });

  it('只读知识库：有数据时仍不给操作菜单', async () => {
    // 这一条必须带数据，否则「菜单没渲染」只是因为列表是空的
    renderPanel(true);

    expect(await screen.findByText('我的基准')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /操作/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /上传基准/ })).toBeNull();
  });

  it('列表展示类型/来源标签、题目数与时间', async () => {
    renderPanel();

    expect(await screen.findByText('我的基准')).toBeTruthy();
    expect(screen.getByText('检索评估')).toBeTruthy();
    expect(screen.getByText('上传')).toBeTruthy();
    expect(screen.getByText(/12 个问题/)).toBeTruthy();
    // 完成态不再重复标一次状态
    expect(screen.queryByText('已完成')).toBeNull();
  });

  it('生成中的行显示进度并带上后端消息', async () => {
    api.listDatasets.mockResolvedValue([
      dataset({
        build_metadata: {
          status: 'running',
          progress: 42.6,
          message: '生成中 3/10',
        },
      }),
    ]);
    renderPanel();

    const bar = await screen.findByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '43');
    expect(screen.getByText('生成中 3/10')).toBeTruthy();
    expect(screen.getByText('生成中')).toBeTruthy();
  });

  it('失败态：下载被禁用（后端只允许导出已完成的数据集）', async () => {
    api.listDatasets.mockResolvedValue([
      dataset({
        build_metadata: { status: 'failed', error_message: '模型超时' },
      }),
    ]);
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /操作/ }));

    expect(
      await screen.findByRole('menuitem', { name: /下载/ }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('完成态才给下载，且预览弹窗里也有下载入口', async () => {
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /操作/ }));
    expect(
      await screen.findByRole('menuitem', { name: /下载/ }),
    ).not.toHaveAttribute('data-disabled');
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByText('我的基准'));

    expect(
      await screen.findByRole('button', { name: /下载 JSONL/ }),
    ).toBeTruthy();
  });

  it('失败态的预览弹窗不给下载入口', async () => {
    const failed = dataset({
      build_metadata: { status: 'failed', error_message: '模型超时' },
    });
    api.listDatasets.mockResolvedValue([failed]);
    // 详情也要回失败态，否则预览拿到的是默认的 completed
    api.getDataset.mockResolvedValue({
      ...failed,
      items: [
        {
          item_id: 'it-1',
          item_index: 0,
          query: '这个库讲了什么？',
          gold_chunk_ids: [],
          gold_answer: null,
        },
      ],
      pagination: {
        current_page: 1,
        page_size: 50,
        total_items: 1,
        total_pages: 1,
        has_next: false,
        has_prev: false,
      },
    });
    renderPanel();

    await userEvent.click(await screen.findByText('我的基准'));

    // 预览确实打开了（能看到条目），但没有下载按钮
    expect(await screen.findByText(/这个库讲了什么？/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /下载 JSONL/ })).toBeNull();
  });

  it('失败态展示失败原因，并只给「继续生成」可用', async () => {
    api.listDatasets.mockResolvedValue([
      dataset({
        build_metadata: { status: 'failed', error_message: '模型超时' },
      }),
    ]);
    renderPanel();

    expect(await screen.findByText('模型超时')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /操作/ }));

    // Radix 只在禁用时挂 data-disabled
    expect(
      await screen.findByRole('menuitem', { name: /继续生成/ }),
    ).not.toHaveAttribute('data-disabled');
    await userEvent.click(screen.getByRole('menuitem', { name: /继续生成/ }));
    await waitFor(() =>
      expect(api.resume).toHaveBeenCalledWith('kb-1', 'ds-1'),
    );
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: '恢复生成中' }),
    );
  });

  it('生成中的数据集：删除项置灰、不给「继续生成」，点了也不会弹确认', async () => {
    api.listDatasets.mockResolvedValue([
      dataset({ build_metadata: { status: 'running', progress: 10 } }),
    ]);
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /操作/ }));

    // 生成中不能删：置灰，而不是点了再报错
    expect(screen.getByRole('menuitem', { name: /删除/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // 「继续生成」只在生成失败时出现，生成中根本没有这一项
    expect(screen.queryByRole('menuitem', { name: /继续生成/ })).toBeNull();

    await userEvent.click(screen.getByRole('menuitem', { name: /删除/ }));
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('删除要确认，确认后调接口并提示', async () => {
    confirmMock.mockResolvedValue(true);
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /操作/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: /删除/ }));

    await waitFor(() => expect(api.deleteDataset).toHaveBeenCalledWith('ds-1'));
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: '删除成功。' }),
    );
  });

  it('取消确认则不删', async () => {
    confirmMock.mockResolvedValue(false);
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /操作/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: /删除/ }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(api.deleteDataset).not.toHaveBeenCalled();
  });

  it('下载把 blob 与文件名交给浏览器', async () => {
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /操作/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: /下载/ }));

    await waitFor(() => expect(downloadMock).toHaveBeenCalled());
    expect(downloadMock.mock.calls[0][1]).toBe('基准.jsonl');
  });

  it('点名称打开预览，条目带标准答案与标准 Chunk', async () => {
    renderPanel();

    await userEvent.click(await screen.findByText('我的基准'));

    expect(await screen.findByText(/这个库讲了什么？/)).toBeTruthy();
    expect(screen.getByText('标准答案：讲了三件事')).toBeTruthy();
    expect(screen.getByText('标准 Chunk：c-1')).toBeTruthy();
    expect(api.getDataset).toHaveBeenCalledWith('kb-1', 'ds-1', {
      page: 1,
      pageSize: 50,
    });
  });

  it('未完成的数据集不能打开预览', async () => {
    api.listDatasets.mockResolvedValue([
      dataset({ build_metadata: { status: 'running', progress: 5 } }),
    ]);
    renderPanel();

    expect(
      await screen.findByRole('button', { name: '我的基准' }),
    ).toBeDisabled();
  });

  it('加载失败给出原因与重试', async () => {
    api.listDatasets.mockRejectedValue(new Error('boom'));
    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '加载评估基准失败：',
    );
    expect(screen.getByRole('button', { name: /重试/ })).toBeTruthy();
  });
});
