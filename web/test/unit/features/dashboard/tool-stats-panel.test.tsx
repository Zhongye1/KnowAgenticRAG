/**
 * 工具调用监控：本机空数据是主要形态，有数据时验证 Top 10 顺序与错误分布。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { emptyToolStats, toolStats } from './fixtures';

const { api } = vi.hoisted(() => ({ api: { tools: vi.fn() } }));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  getToolCallStatsApiDashboardStatsToolsGet: (...args: unknown[]) =>
    api.tools(...args),
}));

vi.mock('@/features/dashboard/ui/echart', async () => {
  const { EChart } = await import('./chart-probe');
  return { EChart };
});

const { ToolStatsPanel } =
  await import('@/features/dashboard/ui/tool-stats-panel');

const renderPanel = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToolStatsPanel />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('工具调用监控', () => {
  it('0 调用时指标卡照常显示 0，排行与错误分布给显式空态', async () => {
    // 变异：用 daily_tool_calls 判空会渲染出 7 根 0 高柱而没有空态文案
    api.tools.mockResolvedValue({ data: emptyToolStats });
    renderPanel();

    expect(await screen.findByText(/暂无工具调用记录/)).toBeTruthy();
    expect(screen.getByText('总调用次数')).toBeTruthy();
    expect(screen.queryByTestId('tool-rank-chart')).toBeNull();
    expect(screen.queryByTestId('tool-error-chart')).toBeNull();
    expect(screen.queryByText(/暂无工具调用失败记录/)).toBeNull();
  });

  it('有调用但无失败时只缺错误分布的空态', async () => {
    api.tools.mockResolvedValue({
      data: { ...toolStats, failed_calls: 0, tool_error_distribution: {} },
    });
    renderPanel();

    expect(await screen.findByTestId('tool-rank-chart')).toBeTruthy();
    expect(await screen.findByText('暂无工具调用失败记录。')).toBeTruthy();
    expect(screen.queryByTestId('tool-error-chart')).toBeNull();
  });

  it('Top 10 柱图最多的排在最上面，错误表按次数降序、饼图取前 5', async () => {
    api.tools.mockResolvedValue({ data: toolStats });
    renderPanel();

    const rank = await screen.findByTestId('tool-rank-chart');
    // rankTools 升序后反转：轴第一项是最少的入选工具
    expect(within(rank).getByTestId('tool-rank-chart-yaxis').textContent).toBe(
      '["web_search","file_read"]',
    );
    expect(
      within(rank).getByTestId('tool-rank-chart-series-0').textContent,
    ).toBe('[3,9]');

    const rows = await screen.findAllByTestId('tool-error-row');
    expect(rows.map((row) => row.textContent)).toEqual([
      'web_search4',
      'file_read1',
    ]);
    expect(screen.getByTestId('tool-error-chart-series-0').textContent).toBe(
      '[{"name":"web_search","value":4},{"name":"file_read","value":1}]',
    );
  });

  it('失败率档位作用在成功率数值上', async () => {
    // 66.7% 落在 70 以下 → 中性档（danger 文字）
    api.tools.mockResolvedValue({ data: toolStats });
    renderPanel();
    const rate = await screen.findByText('66.7%');
    expect(rate.className).toContain('text-danger-7');
  });

  it('失败时给文案与重试入口', async () => {
    api.tools.mockResolvedValueOnce({
      error: { detail: 'boom' },
      response: { status: 500 },
    });
    renderPanel();

    const failed = await screen.findByTestId('tool-stats-error');
    expect(within(failed).getByText('工具调用统计加载失败。')).toBeTruthy();
    api.tools.mockResolvedValue({ data: toolStats });
    await userEvent.click(
      within(failed).getByRole('button', { name: '重新加载' }),
    );
    await waitFor(() => expect(api.tools).toHaveBeenCalledTimes(2));
  });
});
