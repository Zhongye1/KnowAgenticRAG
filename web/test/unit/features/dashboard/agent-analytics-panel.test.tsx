/**
 * 智能体分析面板用例。
 *
 * 之前这块只有 `overview-tab` 的间接覆盖：满意度表的行集合、排序与「0 反馈不显示百分比」
 * 都没有守卫（Reviewer 指出该表 0 反馈会被后端记成 100%，界面会显示绿色 100%）。
 */
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: { agents: vi.fn() },
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  getAgentAnalyticsApiDashboardStatsAgentsGet: (...args: unknown[]) =>
    api.agents(...args),
}));

/** 图表底座在 jsdom 里拿不到 2D 上下文，替换成不画图的占位。 */
vi.mock('@/features/dashboard/ui/echart', () => ({
  EChart: ({ testId, ariaLabel }: { testId?: string; ariaLabel?: string }) => (
    <div data-testid={testId} data-chart-label={ariaLabel} />
  ),
}));

const { AgentAnalyticsPanel } =
  await import('@/features/dashboard/ui/agent-analytics-panel');

/** 后端在 `total_feedbacks == 0` 时把满意度记成 100；这里照抄真实形状。 */
const analytics = {
  total_agents: 3,
  agent_conversation_counts: [
    { agent_id: 'chat', conversation_count: 27 },
    { agent_id: 'research', conversation_count: 5 },
    { agent_id: 'idle', conversation_count: 0 },
  ],
  agent_tool_usage: [
    { agent_id: 'chat', tool_usage_count: 12 },
    { agent_id: 'research', tool_usage_count: 3 },
    { agent_id: 'idle', tool_usage_count: 0 },
  ],
  agent_satisfaction_rates: [
    { agent_id: 'chat', satisfaction_rate: 100, total_feedbacks: 4 },
    { agent_id: 'research', satisfaction_rate: 50, total_feedbacks: 2 },
    { agent_id: 'idle', satisfaction_rate: 100, total_feedbacks: 0 },
  ],
  agent_names: { chat: '智能助手', research: '调研探索员', idle: '闲置智能体' },
  top_performing_agents: [],
};

const renderPanel = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AgentAnalyticsPanel />
    </QueryClientProvider>,
  );
};

describe('智能体分析面板', () => {
  beforeEach(() => {
    // 生成客户端的结果形状是 `{ data }`，unwrap 从这里取响应体
    api.agents.mockReset().mockResolvedValue({ data: analytics });
  });

  it('满意度表：有反馈显示百分比，0 反馈显示占位而不是后端给的 100', async () => {
    renderPanel();
    const rows = await screen.findAllByTestId('agent-satisfaction-row');
    expect(rows).toHaveLength(3);

    const byAgent = new Map(rows.map((row) => [row.textContent ?? '', row]));
    const chatRow =
      [...byAgent.keys()].find((text) => text.includes('智能助手')) ?? '';
    expect(chatRow).toContain('100%');

    const idle = rows.find((row) => row.textContent?.includes('闲置智能体'));
    // 变异：去掉 totalFeedbacks 判定，这里会显示「100%」
    expect(idle?.textContent).toContain('—');
    expect(idle?.textContent).not.toContain('100%');
  });

  it('表格按对话数与工具调用数排序，取前 3', async () => {
    renderPanel();
    const rows = await screen.findAllByTestId('agent-satisfaction-row');
    expect(rows[0].textContent).toContain('智能助手');
    expect(rows[1].textContent).toContain('调研探索员');
    expect(rows[2].textContent).toContain('闲置智能体');
  });

  it('接口失败时给文案与重试入口', async () => {
    api.agents.mockRejectedValue(new Error('统计不可用'));
    renderPanel();

    await waitFor(() =>
      expect(screen.getByText('智能体分析加载失败。')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy();
  });
});
