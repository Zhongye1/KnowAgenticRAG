/**
 * 反馈列表弹窗：空态、卡片列表、类型筛选。
 *
 * 类型筛选在客户端做（本仓的反馈端点不接受 `rating` 参数），因此断言的是
 * 「同一份响应被过滤后的可见卡片」，而不是又发了一次请求。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { feedbackItems } from './fixtures';

const { api } = vi.hoisted(() => ({ api: { feedbacks: vi.fn() } }));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  getAllFeedbacksApiDashboardFeedbacksGet: (...args: unknown[]) =>
    api.feedbacks(...args),
}));

const { FeedbackDialog } =
  await import('@/features/dashboard/ui/feedback-dialog');

const onOpenChange = vi.fn();

const renderDialog = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FeedbackDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('反馈列表弹窗', () => {
  it('没有反馈时给引导文案（本机真实形态）', async () => {
    api.feedbacks.mockResolvedValue({ data: [] });
    renderDialog();

    expect(
      await screen.findByText(
        '暂无反馈数据。用户在会话里点赞或点踩后会出现在这里。',
      ),
    ).toBeTruthy();
    expect(screen.queryAllByTestId('feedback-card')).toHaveLength(0);
  });

  it('渲染卡片：用户、类型、正文、原因与时间', async () => {
    api.feedbacks.mockResolvedValue({ data: feedbackItems });
    renderDialog();

    const cards = await screen.findAllByTestId('feedback-card');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('点赞')).toBeTruthy();
    expect(within(cards[0]).getByText('这条回复很准')).toBeTruthy();
    expect(within(cards[1]).getByText('点踩')).toBeTruthy();
    expect(within(cards[1]).getByText('答非所问')).toBeTruthy();
    // 反馈原因只在点踩卡片上出现
    expect(within(cards[0]).queryByText('反馈原因：')).toBeNull();
    expect(within(cards[1]).getByText('2026-10-02 10:00:00')).toBeTruthy();
  });

  it('按类型筛选只改可见卡片，不重新发请求', async () => {
    // 变异：把筛选当服务端参数会让端点被重复调用（而它并不接受该参数）
    api.feedbacks.mockResolvedValue({ data: feedbackItems });
    renderDialog();
    await screen.findAllByTestId('feedback-card');
    expect(api.feedbacks).toHaveBeenCalledTimes(1);

    await userEvent.click(
      within(screen.getByTestId('feedback-rating-filter')).getByText('点踩'),
    );

    const cards = screen.getAllByTestId('feedback-card');
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText('答非所问')).toBeTruthy();
    expect(api.feedbacks).toHaveBeenCalledTimes(1);
  });

  it('筛选后为空时提示切换类型，而不是「暂无反馈数据」', async () => {
    api.feedbacks.mockResolvedValue({ data: [feedbackItems[0]] });
    renderDialog();
    await screen.findAllByTestId('feedback-card');

    await userEvent.click(
      within(screen.getByTestId('feedback-rating-filter')).getByText('点踩'),
    );
    expect(
      await screen.findByText('当前类型下没有反馈，可切换类型查看。'),
    ).toBeTruthy();
  });

  it('长正文给「展开全部」入口，短正文不给', async () => {
    api.feedbacks.mockResolvedValue({
      data: [
        { ...feedbackItems[0], message_content: 'a'.repeat(241) },
        { ...feedbackItems[1], id: 9, message_content: '短回复' },
      ],
    });
    renderDialog();

    const cards = await screen.findAllByTestId('feedback-card');
    expect(
      within(cards[0]).getByRole('button', { name: '展开全部' }),
    ).toBeTruthy();
    expect(
      within(cards[1]).queryByRole('button', { name: '展开全部' }),
    ).toBeNull();

    await userEvent.click(
      within(cards[0]).getByRole('button', { name: '展开全部' }),
    );
    expect(within(cards[0]).getByRole('button', { name: '收起' })).toBeTruthy();
  });

  it('失败时给文案与重试入口', async () => {
    api.feedbacks.mockResolvedValueOnce({
      error: { detail: 'boom' },
      response: { status: 500 },
    });
    renderDialog();

    const failed = await screen.findByTestId('feedback-list-error');
    expect(within(failed).getByText('反馈列表加载失败。')).toBeTruthy();
    api.feedbacks.mockResolvedValue({ data: feedbackItems });
    await userEvent.click(
      within(failed).getByRole('button', { name: '重新加载' }),
    );
    await waitFor(() => expect(api.feedbacks).toHaveBeenCalledTimes(2));
    expect(await screen.findAllByTestId('feedback-card')).toHaveLength(2);
  });
});
