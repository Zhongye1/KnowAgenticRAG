/**
 * 概览 6 张指标卡与「哪些面板该挂载」。
 *
 * 关键业务结果：指标取真实响应字段（不是硬编码 0）、满意度按 80/60 档位上色、
 * 「反馈数」卡片可点击打开反馈列表、LITE（能力声明为 false）时知识库面板不挂载、
 * 失败面板给出重试入口。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agentAnalytics,
  dashboardStats,
  emptyKnowledgeStats,
  emptyToolStats,
  knowledgeStats,
  userActivity,
} from './fixtures';

const { api, session } = vi.hoisted(() => ({
  api: {
    stats: vi.fn(),
    users: vi.fn(),
    tools: vi.fn(),
    agents: vi.fn(),
    knowledge: vi.fn(),
  },
  session: { knowledgeEnabled: true as boolean | undefined },
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  getDashboardStatsApiDashboardStatsGet: (...args: unknown[]) =>
    api.stats(...args),
  getUserActivityStatsApiDashboardStatsUsersGet: (...args: unknown[]) =>
    api.users(...args),
  getToolCallStatsApiDashboardStatsToolsGet: (...args: unknown[]) =>
    api.tools(...args),
  getAgentAnalyticsApiDashboardStatsAgentsGet: (...args: unknown[]) =>
    api.agents(...args),
  readKnowledgeStatsApiDashboardStatsKnowledgeGet: (...args: unknown[]) =>
    api.knowledge(...args),
}));

vi.mock('@/entities/session', () => ({
  useKnowledgeEnabled: () => session.knowledgeEnabled,
}));

/** 图表底座在 jsdom 里拿不到 2D 上下文，替换成回显 series 名称与数值的探针。 */
vi.mock('@/features/dashboard/ui/echart', () => ({
  EChart: ({ testId, ariaLabel }: { testId?: string; ariaLabel?: string }) => (
    <div data-testid={testId} data-chart-label={ariaLabel} />
  ),
}));

const { DashboardOverviewTab } =
  await import('@/features/dashboard/ui/overview-tab');

const openFeedback = vi.fn();

const renderOverview = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DashboardOverviewTab onOpenFeedback={openFeedback} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  session.knowledgeEnabled = true;
  api.stats.mockResolvedValue({ data: dashboardStats });
  api.users.mockResolvedValue({ data: userActivity });
  api.tools.mockResolvedValue({ data: emptyToolStats });
  api.agents.mockResolvedValue({ data: agentAnalytics });
  api.knowledge.mockResolvedValue({ data: emptyKnowledgeStats });
});

describe('概览指标卡', () => {
  it('六个指标取自响应字段，满意度按 100% 进正常档', async () => {
    renderOverview();

    const conversations = await screen.findByTestId(
      'metric-total-conversations',
    );
    expect(within(conversations).getByText('27')).toBeTruthy();
    expect(within(conversations).getByText('累计会话')).toBeTruthy();
    expect(
      within(screen.getByTestId('metric-active-conversations')).getByText('22'),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('metric-total-messages')).getByText('62'),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('metric-total-users')).getByText('21'),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('metric-total-feedbacks')).getByText('0'),
    ).toBeTruthy();
    // 变异：满意度档位阈值写错会让 100% 变成警告色（valueTone 类名变化）
    const satisfaction = screen.getByTestId('metric-satisfaction');
    expect(within(satisfaction).getByText('100%')).toBeTruthy();
    expect(satisfaction.querySelector('.text-success-7')).toBeTruthy();
  });

  it('点击「反馈数」卡片请求打开反馈列表', async () => {
    renderOverview();
    const card = await screen.findByTestId('metric-total-feedbacks');
    expect(card.tagName).toBe('BUTTON');
    expect(card.getAttribute('aria-label')).toBe('查看反馈列表');
    await userEvent.click(card);
    expect(openFeedback).toHaveBeenCalledTimes(1);
  });

  it('非可点击卡片渲染成 article，不带 button 语义', async () => {
    renderOverview();
    expect((await screen.findByTestId('metric-total-users')).tagName).toBe(
      'ARTICLE',
    );
  });
});

describe('面板挂载与空态', () => {
  it('知识域可用时挂载知识库面板，工具面板空态显式呈现', async () => {
    renderOverview();
    expect(await screen.findByTestId('knowledge-stats')).toBeTruthy();
    expect(await screen.findByText(/暂无工具调用记录/)).toBeTruthy();
    expect(screen.getByText(/暂无知识库，创建后会按类型统计/)).toBeTruthy();
    expect(screen.getByText(/暂无文件，上传后会按扩展名统计/)).toBeTruthy();
  });

  it('能力声明为 false 时不挂载知识库面板，也不请求该端点', async () => {
    // 变异：去掉能力判定会让 LITE 模式发一次必 404 的请求
    session.knowledgeEnabled = false;
    renderOverview();
    await screen.findByTestId('tool-stats');
    expect(screen.queryByTestId('knowledge-stats')).toBeNull();
    expect(api.knowledge).not.toHaveBeenCalled();
    expect(screen.queryByText(/暂无知识库/)).toBeNull();
  });

  it('能力投影未取到（undefined）时同样不挂载，避免首屏闪烁', async () => {
    session.knowledgeEnabled = undefined;
    renderOverview();
    await screen.findByTestId('tool-stats');
    expect(screen.queryByTestId('knowledge-stats')).toBeNull();
  });

  it('有知识库数据时渲染两张分布图与容量单位', async () => {
    api.knowledge.mockResolvedValue({ data: knowledgeStats });
    renderOverview();
    expect(await screen.findByTestId('knowledge-database-chart')).toBeTruthy();
    expect(screen.getByTestId('knowledge-file-chart')).toBeTruthy();
    const storageCard = screen.getByText('存储容量 (MB)').closest('article');
    expect(storageCard?.textContent).toContain('3');
  });
});

describe('失败与重试', () => {
  it('指标接口失败时给出文案与重试按钮，重试真的重发请求', async () => {
    api.stats.mockResolvedValueOnce({
      error: { detail: 'boom' },
      response: { status: 500 },
    });
    renderOverview();

    const failed = await screen.findByTestId('overview-metrics-error');
    expect(within(failed).getByText('概览指标加载失败。')).toBeTruthy();
    expect(api.stats).toHaveBeenCalledTimes(1);

    api.stats.mockResolvedValue({ data: dashboardStats });
    await userEvent.click(
      within(failed).getByRole('button', { name: '重新加载' }),
    );
    await waitFor(() => expect(api.stats).toHaveBeenCalledTimes(2));
    const card = await screen.findByTestId('metric-total-conversations');
    await waitFor(() => expect(within(card).getByText('27')).toBeTruthy());
  });

  it('工具统计失败只影响自己的面板', async () => {
    api.tools.mockResolvedValue({
      error: { detail: 'boom' },
      response: { status: 500 },
    });
    renderOverview();
    expect(await screen.findByText('工具调用统计加载失败。')).toBeTruthy();
    expect(await screen.findByTestId('metric-total-users')).toBeTruthy();
  });
});
