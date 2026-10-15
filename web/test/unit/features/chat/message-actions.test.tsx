import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ChatMessage } from '@/features/chat/api/agent-api';
import type { ConversationSources } from '@/features/chat/lib/sources';
import { MessageActions } from '@/features/chat/ui/message-actions';

const { notifications } = vi.hoisted(() => ({
  notifications: { addNotification: vi.fn() },
}));

vi.mock('@/shared/ui/notifications', async () => {
  const actual = await vi.importActual<
    typeof import('@/shared/ui/notifications')
  >('@/shared/ui/notifications');
  return { ...actual, useNotifications: () => notifications };
});

vi.mock('@/features/chat/api/feedback-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/chat/api/feedback-api')>();
  return {
    ...actual,
    submitMessageFeedback: vi.fn(async (_id, rating, reason) => {
      // 模拟后端对重复提交的 409：错误信息里带 already
      throw new Error(
        `feedback already submitted for ${rating}${reason ? ` (${reason})` : ''}`,
      );
    }),
  };
});

const message = (extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 7,
  type: 'ai',
  content: '回答正文',
  created_at: '2026-10-12T09:00:00+08:00',
  run_started_at: '2026-10-12T08:59:00+08:00',
  run_finished_at: '2026-10-12T09:00:05+08:00',
  ...extra,
});

const chunk = (file: string) => ({
  kbId: 'kb-1',
  kbName: '库-1',
  content: `${file} 的片段`,
  score: 0.8,
  source: file,
  fileId: `f-${file}`,
  chunkId: `c-${file}`,
});

const sources = (
  overrides: Partial<ConversationSources> = {},
): ConversationSources => ({
  knowledgeChunks: [],
  webSources: [],
  ...overrides,
});

const webSource = {
  toolName: 'web_search',
  title: 'T',
  url: 'https://a',
  score: null,
  content: '',
  publishedDate: '',
};

describe('MessageActions 的反馈提交', () => {
  it('后端返回 already 时按「已提交」处理而不是失败', async () => {
    const user = userEvent.setup();
    render(<MessageActions message={message()} sources={sources()} />);
    await user.click(screen.getByRole('button', { name: '点赞' }));
    // 状态翻成已点赞（title 变化）——重复提交是幂等成功
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '点赞' }).getAttribute('title'),
      ).toBe('已点赞'),
    );
  });
});

describe('MessageActions 的基本项', () => {
  beforeEach(() => {
    // 「昨天/今天」的分档跟着真实时钟走：把系统时间冻在消息当天的上海时间，
    // 跨午夜跑测试也不会把 09:00 断言成「昨天 09:00」
    vi.setSystemTime(new Date('2026-10-12T10:00:00+08:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('渲染点赞、点踩、复制与时间', () => {
    render(<MessageActions message={message()} sources={sources()} />);

    expect(screen.getByRole('button', { name: '点赞' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '点踩' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '复制' })).toBeTruthy();
    // 时间条是 span，按文本找
    expect(screen.getByText('09:00')).toBeTruthy();
  });

  it('有耗时时点击在结束时间与耗时之间切换', async () => {
    render(<MessageActions message={message()} sources={sources()} />);

    await userEvent.click(screen.getByText('09:00'));
    // 65 秒折成「1分5s」，不是「65s」
    expect(screen.getByText('耗时 1分5s')).toBeTruthy();

    await userEvent.click(screen.getByText('耗时 1分5s'));
    // 时间条是 span，按文本找
    expect(screen.getByText('09:00')).toBeTruthy();
  });

  it('没有起止时间时不渲染时间项', () => {
    render(
      <MessageActions
        message={message({
          created_at: null,
          run_started_at: null,
          run_finished_at: null,
        })}
        sources={sources()}
      />,
    );

    expect(screen.queryByRole('button', { name: /09:00/ })).toBeNull();
  });

  it('没有回调时不渲染重新生成', () => {
    const { unmount } = render(
      <MessageActions message={message()} sources={sources()} />,
    );
    expect(screen.queryByRole('button', { name: '重新生成' })).toBeNull();
    unmount();

    const onRetry = vi.fn();
    render(
      <MessageActions
        message={message()}
        sources={sources()}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('button', { name: '重新生成' })).toBeTruthy();
  });

  it('已有反馈时标题显示「已点赞」', () => {
    render(
      <MessageActions
        message={message({ feedback: { rating: 'like' } })}
        sources={sources()}
      />,
    );

    expect(
      screen.getByRole('button', { name: '点赞' }).getAttribute('title'),
    ).toBe('已点赞');
  });
});

describe('MessageActions 的来源部分', () => {
  it('没有来源时不渲染入口', () => {
    render(<MessageActions message={message()} sources={sources()} />);

    expect(screen.queryByRole('button', { name: /来源/ })).toBeNull();
  });

  it('按钮文案是「来源 N」，展开后才出现两段标题', async () => {
    render(
      <MessageActions
        message={message()}
        sources={sources({
          knowledgeChunks: [chunk('a.md')],
          webSources: [webSource],
        })}
      />,
    );

    expect(screen.queryByText(/知识库来源/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /来源 2/ }));

    expect(screen.getByText('知识库来源 (1)')).toBeTruthy();
    expect(screen.getByText('网络搜索来源 (1)')).toBeTruthy();
  });

  it('只有一类来源时只渲染那一段，且不重复报片段总数', async () => {
    render(
      <MessageActions
        message={message()}
        sources={sources({ knowledgeChunks: [chunk('a.md')] })}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /来源 1/ }));

    expect(screen.getByText('a.md')).toBeTruthy();
    expect(screen.queryByText(/网络搜索来源/)).toBeNull();
    expect(screen.queryByText(/找到 1 个相关文档片段/)).toBeNull();
  });

  it('展开标题随状态切换', async () => {
    render(
      <MessageActions
        message={message()}
        sources={sources({ knowledgeChunks: [chunk('a.md')] })}
      />,
    );

    const button = screen.getByRole('button', { name: /来源 1/ });
    expect(button.getAttribute('title')).toBe('查看来源详情');
    await userEvent.click(button);
    expect(button.getAttribute('title')).toBe('收起详情');
  });
});
