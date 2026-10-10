/**
 * 调用统计面板：类型与时间范围切换真的换请求参数、汇总数字随口径归位、空窗口显式呈现。
 *
 * 断言的是业务结果：发出去的查询参数、图表的数据系列与横轴标签、汇总数字文案。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callTimeseries, emptyCallTimeseries } from './fixtures';

const { api } = vi.hoisted(() => ({ api: { calls: vi.fn() } }));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  getCallTimeseriesStatsApiDashboardStatsCallsTimeseriesGet: (
    ...args: unknown[]
  ) => api.calls(...args),
}));

vi.mock('@/features/dashboard/ui/echart', async () => {
  const { EChart } = await import('./chart-probe');
  return { EChart };
});

const { CallStatsPanel } =
  await import('@/features/dashboard/ui/call-stats-panel');

const renderPanel = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CallStatsPanel />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  api.calls.mockResolvedValue({ data: callTimeseries });
});

describe('调用统计', () => {
  it('默认口径是「智能体调用 + 近 14 天」，图例用后端下发的智能体名', async () => {
    renderPanel();

    await waitFor(() =>
      expect(api.calls).toHaveBeenCalledWith({
        query: { type: 'agents', time_range: '14days' },
      }),
    );
    const chart = await screen.findByTestId('call-stats-chart');
    expect(
      screen
        .getByTestId('call-stats-chart-series-0')
        .getAttribute('data-series-name'),
    ).toBe('智能助手');
    expect(screen.getByTestId('call-stats-chart-series-0').textContent).toBe(
      '[0,26]',
    );
    expect(screen.getByTestId('call-stats-chart-xaxis').textContent).toBe(
      '["09-27","09-28"]',
    );
    expect(chart.getAttribute('data-chart-label')).toBe(
      '智能体调用调用量堆叠柱图',
    );
  });

  it('汇总数字用当前口径的文案与单位', async () => {
    renderPanel();
    await screen.findByTestId('call-stats-chart');

    expect(screen.getByText('总调用量')).toBeTruthy();
    expect(screen.getByText('每单位均值')).toBeTruthy();
    expect(screen.getByText('峰值')).toBeTruthy();
    // 变异：峰值不带时间会让「哪一天最高」无从判断
    expect(screen.getByText('26（09-28）')).toBeTruthy();
    expect(screen.getByText('13')).toBeTruthy();
  });

  it('切时间范围真的换查询参数，横轴跟着换格式', async () => {
    // 变异：时间范围不进查询键，切换后请求仍是 14days
    renderPanel();
    await screen.findByTestId('call-stats-chart');

    api.calls.mockResolvedValue({
      data: {
        ...callTimeseries,
        data: [{ date: '2026-41', data: { 'default-chatbot': 4 }, total: 4 }],
        total_count: 4,
        average_count: 0.29,
        peak_count: 4,
        peak_date: '2026-41',
      },
    });
    await userEvent.click(
      within(screen.getByTestId('call-time-range')).getByText('近 14 周'),
    );

    await waitFor(() =>
      expect(api.calls).toHaveBeenLastCalledWith({
        query: { type: 'agents', time_range: '14weeks' },
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('call-stats-chart-xaxis').textContent).toBe(
        '["第41周"]',
      ),
    );
    expect(screen.getByText('4（第41周）')).toBeTruthy();
  });

  it('切类型换查询参数，Token 口径的数值与汇总折算成 M', async () => {
    renderPanel();
    await screen.findByTestId('call-stats-chart');

    api.calls.mockResolvedValue({
      data: {
        ...callTimeseries,
        data: [
          {
            date: '2026-09-28',
            data: { input_tokens: 1_500_000 },
            total: 1_500_000,
          },
        ],
        categories: ['input_tokens'],
        total_count: 1_500_000,
        average_count: 750_000,
        peak_count: 1_500_000,
      },
    });
    await userEvent.click(
      within(screen.getByTestId('call-metric-type')).getByText('Token 消耗'),
    );

    await waitFor(() =>
      expect(api.calls).toHaveBeenLastCalledWith({
        query: { type: 'tokens', time_range: '14days' },
      }),
    );
    const series = await screen.findByTestId('call-stats-chart-series-0');
    expect(series.getAttribute('data-series-name')).toBe('输入 Token');
    expect(series.textContent).toBe('[1500000]');
    expect(screen.getByText('1.50M', { selector: 'dd' })).toBeTruthy();
  });

  it('整段为空时给显式空态而不是一张全 0 的平图', async () => {
    // 变异：去掉判空会让 14 根 0 高柱看起来像「有数据」
    api.calls.mockResolvedValue({ data: emptyCallTimeseries });
    renderPanel();
    expect(
      await screen.findByText(/该口径在所选时间范围内没有调用记录/),
    ).toBeTruthy();
    expect(screen.queryByTestId('call-stats-chart')).toBeNull();
    // 汇总数字仍在：0 是有意义的信息
    expect(screen.getByText('总调用量')).toBeTruthy();
  });

  it('切换期间禁用分段控件，避免连点发出一串请求', async () => {
    let resolveSecond: ((value: unknown) => void) | undefined;
    renderPanel();
    await screen.findByTestId('call-stats-chart');

    api.calls.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    );
    await userEvent.click(
      within(screen.getByTestId('call-time-range')).getByText('近 14 小时'),
    );
    await waitFor(() =>
      expect(
        within(screen.getByTestId('call-time-range')).getByText('近 14 天'),
      ).toBeDisabled(),
    );
    resolveSecond?.({ data: callTimeseries });
  });

  it('失败时给文案与重试入口，重试重发同一口径', async () => {
    api.calls.mockResolvedValueOnce({
      error: { detail: 'boom' },
      response: { status: 500 },
    });
    renderPanel();

    const failed = await screen.findByTestId('call-stats-error');
    expect(within(failed).getByText('调用统计加载失败。')).toBeTruthy();
    api.calls.mockResolvedValue({ data: callTimeseries });
    await userEvent.click(
      within(failed).getByRole('button', { name: '重新加载' }),
    );
    await waitFor(() => expect(api.calls).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('call-stats-chart')).toBeTruthy();
  });
});
