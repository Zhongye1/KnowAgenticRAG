/**
 * 会话分析区：概览指标、统计周期与子智能体开关真的换参数、空窗口不给空图。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { emptyThreadAnalytics, threadAnalytics } from './fixtures';

const { api } = vi.hoisted(() => ({ api: { threads: vi.fn() } }));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  getThreadAnalyticsStatsApiDashboardStatsThreadsGet: (...args: unknown[]) =>
    api.threads(...args),
}));

vi.mock('@/features/dashboard/ui/echart', async () => {
  const { EChart } = await import('./chart-probe');
  return { EChart };
});

const { ThreadAnalyticsSection } =
  await import('@/features/dashboard/ui/thread-analytics-section');

const onOpenFeedback = vi.fn();

const renderSection = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThreadAnalyticsSection onOpenFeedback={onOpenFeedback} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  api.threads.mockResolvedValue({ data: threadAnalytics });
});

describe('会话分析', () => {
  it('默认近 30 天且不含子智能体', async () => {
    renderSection();
    await waitFor(() =>
      expect(api.threads).toHaveBeenCalledWith({
        query: {
          time_range: '30days',
          agent_id: undefined,
          include_subagents: false,
        },
      }),
    );
  });

  it('概览指标取 summary 字段，平均轮数保留一位小数', async () => {
    renderSection();
    const total = await screen.findByTestId('metric-thread-total');
    expect(within(total).getByText('27')).toBeTruthy();
    expect(within(total).getByText('累计会话')).toBeTruthy();
    expect(
      within(screen.getByTestId('metric-thread-active')).getByText('22'),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('metric-thread-messages')).getByText('62'),
    ).toBeTruthy();
    const average = screen.getByTestId('metric-thread-avg-messages');
    expect(within(average).getByText('平均消息数 / 会话')).toBeTruthy();
    expect(within(average).getByText('2.3')).toBeTruthy();
  });

  it('切统计周期换查询参数', async () => {
    renderSection();
    await screen.findByTestId('thread-trend-chart');

    await userEvent.click(
      within(screen.getByTestId('thread-time-range')).getByText('近 7 天'),
    );
    await waitFor(() =>
      expect(api.threads).toHaveBeenLastCalledWith({
        query: {
          time_range: '7days',
          agent_id: undefined,
          include_subagents: false,
        },
      }),
    );
  });

  it('打开子智能体开关带 include_subagents=true，分段控件状态同步', async () => {
    // 变异：开关状态不进查询键，切了也还是旧数据
    renderSection();
    await screen.findByTestId('thread-trend-chart');

    const subagents = () => screen.getByTestId('thread-subagents');
    const includeOption = () =>
      within(subagents()).getByRole('radio', { name: '包含子智能体' });
    expect(includeOption()).not.toBeChecked();
    // 点标签文本而不是 radio input：antd Segmented 的 input 是 `pointer-events: none`
    await userEvent.click(within(subagents()).getByText('包含子智能体'));

    await waitFor(() =>
      expect(api.threads).toHaveBeenLastCalledWith({
        query: {
          time_range: '30days',
          agent_id: undefined,
          include_subagents: true,
        },
      }),
    );
    expect(includeOption()).toBeChecked();
  });

  it('三个图表都画出真实数据系列，深度分布按固定桶顺序', async () => {
    renderSection();
    const trend = await screen.findByTestId('thread-trend-chart');
    expect(
      within(trend).getByTestId('thread-trend-chart-xaxis').textContent,
    ).toBe('["09-11","09-12"]');
    expect(
      within(trend).getByTestId('thread-trend-chart-series-0').textContent,
    ).toBe('[0,2]');
    expect(
      within(trend).getByTestId('thread-trend-chart-series-1').textContent,
    ).toBe('[0,1]');

    const depth = screen.getByTestId('thread-depth-chart');
    expect(
      within(depth).getByTestId('thread-depth-chart-xaxis').textContent,
    ).toBe('["0 条","1-2 条","3-5 条","6-10 条","11-20 条","20+ 条"]');
    const depthData = JSON.parse(
      within(depth).getByTestId('thread-depth-chart-series-0').textContent ??
        '[]',
    ) as { value: number }[];
    expect(depthData.map((item) => item.value)).toEqual([3, 20, 4, 0, 0, 0]);

    const agents = screen.getByTestId('thread-agent-chart');
    expect(
      within(agents).getByTestId('thread-agent-chart-yaxis').textContent,
    ).toBe('["智能助手"]');
  });

  it('活跃用户榜渲染真实行；状态分布整段暂不渲染', async () => {
    renderSection();
    const rows = await screen.findAllByTestId('top-user-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('张文杰');
    expect(rows[0].textContent).toContain('27');

    // 「会话状态分布」在组件里被整段注释掉；这条断言同时盯住它没有被悄悄渲染回来
    expect(screen.queryByTestId('thread-status-distribution')).toBeNull();
  });

  it('所选周期没有活动时给文案而不是空图', async () => {
    // 变异：不判空会画出三条全 0 的系列，看起来像「有数据」
    api.threads.mockResolvedValue({ data: emptyThreadAnalytics });
    renderSection();
    expect(await screen.findByText('所选周期内没有会话活动。')).toBeTruthy();
    expect(screen.queryByTestId('thread-trend-chart')).toBeNull();
    expect(
      screen.getByText('所选周期内没有会话，无法统计轮数分布。'),
    ).toBeTruthy();
    expect(screen.getByText('所选周期内没有智能体会话。')).toBeTruthy();
    expect(screen.getByText('所选周期内没有活跃用户。')).toBeTruthy();
    // 「会话状态分布」整段暂不渲染，它的空态文案跟着一起消失
    expect(screen.queryByText('所选周期内没有会话。')).toBeNull();
  });

  it('「反馈列表」按钮触发页面级弹窗', async () => {
    renderSection();
    await screen.findByTestId('thread-trend-chart');
    await userEvent.click(screen.getByRole('button', { name: '反馈列表' }));
    expect(onOpenFeedback).toHaveBeenCalledTimes(1);
  });

  it('失败时给文案与重试入口', async () => {
    api.threads.mockResolvedValueOnce({
      error: { detail: 'boom' },
      response: { status: 500 },
    });
    renderSection();
    const failed = await screen.findByTestId('thread-analytics-error');
    expect(within(failed).getByText('会话分析加载失败。')).toBeTruthy();
  });
});
