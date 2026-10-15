/**
 * 知识库使用情况：两份分布的空/有数据形态与文件类型轮播的起点。
 *
 * 空分布必须显式呈现（本机就是 0 库 0 文件）；有数据时轮播从文件数最多的类型开始，
 * 且轮播本身不该让第一次渲染就显示错的类型。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { emptyKnowledgeStats, knowledgeStats } from './fixtures';

const { api } = vi.hoisted(() => ({ api: { knowledge: vi.fn() } }));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  readKnowledgeStatsApiDashboardStatsKnowledgeGet: (...args: unknown[]) =>
    api.knowledge(...args),
}));

vi.mock('@/features/dashboard/ui/echart', async () => {
  const { EChart } = await import('./chart-probe');
  return { EChart };
});

const { KnowledgeStatsPanel } =
  await import('@/features/dashboard/ui/knowledge-stats-panel');

const renderPanel = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <KnowledgeStatsPanel />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('知识库统计', () => {
  it('空库空文件时两张图都不画，改用引导文案', async () => {
    api.knowledge.mockResolvedValue({ data: emptyKnowledgeStats });
    renderPanel();

    expect(
      await screen.findByText('暂无知识库，创建后会按类型统计。'),
    ).toBeTruthy();
    expect(screen.getByText('暂无文件，上传后会按扩展名统计。')).toBeTruthy();
    expect(screen.queryByTestId('knowledge-database-chart')).toBeNull();
    expect(screen.queryByTestId('knowledge-file-chart')).toBeNull();
    // 容量值与单位分开：0 字节就是 0 B
    const storageCard = screen.getByText('存储容量 (B)').closest('article');
    expect(storageCard?.textContent).toContain('0');
  });

  it('有数据时两张饼图按数量降序，轮播从最多的类型开始', async () => {
    api.knowledge.mockResolvedValue({ data: knowledgeStats });
    renderPanel();

    const databases = await screen.findByTestId('knowledge-database-chart');
    expect(
      within(databases).getByTestId('knowledge-database-chart-series-0')
        .textContent,
    ).toBe('[{"name":"milvus","value":1},{"name":"lightweight","value":1}]');

    const files = screen.getByTestId('knowledge-file-chart');
    expect(
      within(files).getByTestId('knowledge-file-chart-series-0').textContent,
    ).toBe('[{"name":"docx","value":8},{"name":"pdf","value":1}]');

    const carousel = screen.getByTestId('file-type-carousel');
    // 变异：轮播起点不归零会让首次渲染停在列表最后一项
    expect(within(carousel).getByText('docx')).toBeTruthy();
    expect(within(carousel).getByText('88.9%')).toBeTruthy();
    expect(screen.getByText('2 种类型')).toBeTruthy();
    expect(screen.getByText('存储容量 (MB)')).toBeTruthy();
  });

  it('只有一种文件类型时不启动轮播定时器，多于一种时只启动一个', async () => {
    // 变异：去掉 `entries.length <= 1` 判定会为单一类型挂一个永远不换内容的定时器
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const carouselTimers = () =>
      setIntervalSpy.mock.calls.filter(([, delay]) => delay === 3000);

    api.knowledge.mockResolvedValue({
      data: { ...knowledgeStats, file_type_distribution: { pdf: 3 } },
    });
    const single = renderPanel();
    expect(await screen.findByText('pdf')).toBeTruthy();
    expect(carouselTimers()).toHaveLength(0);
    single.unmount();

    api.knowledge.mockResolvedValue({ data: knowledgeStats });
    renderPanel();
    expect(await screen.findByText('docx')).toBeTruthy();
    expect(carouselTimers()).toHaveLength(1);
    setIntervalSpy.mockRestore();
  });

  it('失败时给文案与重试入口', async () => {
    api.knowledge.mockResolvedValueOnce({
      error: { detail: 'boom' },
      response: { status: 500 },
    });
    renderPanel();

    const failed = await screen.findByTestId('knowledge-stats-error');
    expect(within(failed).getByText('知识库统计加载失败。')).toBeTruthy();
  });
});
