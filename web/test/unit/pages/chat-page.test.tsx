import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { paths } from '@/shared/config';

const { chat, runtime, notifications } = vi.hoisted(() => ({
  chat: {
    loadHistory: vi.fn(),
    createThread: vi.fn(),
    refreshQueue: vi.fn(),
    sendMessage: vi.fn(),
    cancelRun: vi.fn(),
    submitInterrupt: vi.fn(),
    steer: vi.fn(),
    cancelQueued: vi.fn(),
    continueQueue: vi.fn(),
    stopRequestStreams: vi.fn(),
  },
  runtime: {
    messages: [] as unknown[],
    queuedRequests: [] as unknown[],
    queueSnapshot: null as unknown,
    continueQueueInFlight: false,
    isStreaming: false,
    pendingInterrupt: null as unknown,
    onGoingConv: { msgChunks: {} },
  },
  notifications: { addNotification: vi.fn() },
}));

vi.mock('@/features/chat', () => ({
  agentRunApi: {
    getDefaultAgent: vi
      .fn()
      .mockResolvedValue({ agent: { slug: 'default-chatbot' } }),
  },
  describeQueueRow: () => ({ canSteer: true, canCancel: true }),
  isThreadWaitingForUserAction: () => false,
  describeQueue: () => ({
    visible: false,
    pendingCount: 0,
    paused: false,
    pausedReason: null,
    canContinue: false,
  }),
  PendingInterruptPanel: () => null,
  QueueBar: () => null,
  useChatRuntime: () => chat,
  useThreadRuntime: () => runtime,
}));

vi.mock('@/shared/ui/notifications', () => ({
  useNotifications: () => notifications,
}));

vi.mock('@/shared/ui/content-layout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { ChatPage } = await import('@/pages/chat/ui/chat-page');

/**
 * 复刻真实路由形状：`/agent` 与 `/agent/:threadId` 共用同一个组件实例。
 * 同时套上 `StrictMode`，与 `pnpm dev` 的挂载行为一致。
 */
function renderAt(initialPath: string) {
  return render(
    <React.StrictMode>
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={paths.app.chat.path} element={<ChatPage />} />
        <Route
          path={`${paths.app.chat.path}/:threadId`}
          element={<ChatPage />}
        />
      </Routes>
      <NewChatLink />
      <SwitchThreadLink />
    </MemoryRouter>
    </React.StrictMode>,
  );
}

const send = async (text = '你好') => {
  await userEvent.type(await screen.findByLabelText('消息输入'), text);
  await userEvent.click(screen.getByRole('button', { name: '发送' }));
};

/** 侧边栏「新建对话」的真实入口：回到没有线程的地址。 */
const NewChatLink = () => <Link to={paths.app.chat.getHref()}>新建对话</Link>;

/** 线程列表里的真实入口：切到另一条线程。 */
const SwitchThreadLink = () => (
  <Link to={paths.app.chat.getHref('thread-B')}>切到 B</Link>
);

describe('对话页的线程生命周期', () => {
  beforeEach(() => {
    for (const fn of Object.values(chat)) fn.mockReset();
    notifications.addNotification.mockReset();
    chat.loadHistory.mockResolvedValue(undefined);
    chat.refreshQueue.mockResolvedValue(undefined);
    chat.sendMessage.mockResolvedValue(undefined);
    chat.createThread.mockResolvedValue('thread-新');
  });

  it('地址没有线程时先建线程，再用新线程发送', async () => {
    renderAt(paths.app.chat.getHref());

    await send();

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith({
        threadId: 'thread-新',
        agentSlug: 'default-chatbot',
        query: '你好',
      }),
    );
    expect(chat.createThread).toHaveBeenCalledExactlyOnceWith('default-chatbot');
  });

  it('地址已有线程时不建新线程，直接用该线程发送', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    await send();

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith({
        threadId: 'thread-A',
        agentSlug: 'default-chatbot',
        query: '你好',
      }),
    );
    expect(chat.createThread).not.toHaveBeenCalled();
  });

  it('建线程失败时保留输入并提示，不静默丢弃', async () => {
    chat.createThread.mockRejectedValue(new Error('智能体不存在'));
    renderAt(paths.app.chat.getHref());

    await send();

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: '智能体不存在' }),
      ),
    );
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect(screen.getByLabelText<HTMLInputElement>('消息输入').value).toBe(
      '你好',
    );
  });

  it('建过线程后点「新建对话」再发送，会再建一条而不是串回上一条', async () => {
    chat.createThread
      .mockResolvedValueOnce('thread-新1')
      .mockResolvedValueOnce('thread-新2');
    renderAt(paths.app.chat.getHref());

    await send('第一条');
    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ threadId: 'thread-新1' }),
      ),
    );

    await userEvent.click(screen.getByRole('link', { name: '新建对话' }));
    await send('第二条');

    // 地址已经回到 /agent，此时必须重新建线程，不能复用上一条
    await waitFor(() => expect(chat.createThread).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ threadId: 'thread-新2', query: '第二条' }),
      ),
    );
  });

  it('离开线程时断开它的排队事件流', async () => {
    const { unmount } = renderAt(paths.app.chat.getHref('thread-A'));

    await waitFor(() => expect(chat.refreshQueue).toHaveBeenCalled());
    unmount();

    expect(chat.stopRequestStreams).toHaveBeenCalledWith('thread-A');
  });

  it('从 A 切到 B 时只断开 A 的排队事件流', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));
    await waitFor(() =>
      expect(chat.refreshQueue).toHaveBeenCalledWith(
        'thread-A',
        'default-chatbot',
      ),
    );
    // 丢掉挂载期 StrictMode 双调用产生的清理记录，只看切线程这一次
    chat.stopRequestStreams.mockClear();

    await userEvent.click(screen.getByRole('link', { name: '切到 B' }));

    await waitFor(() =>
      expect(chat.stopRequestStreams).toHaveBeenCalledWith('thread-A'),
    );
    expect(chat.stopRequestStreams).not.toHaveBeenCalledWith('thread-B');
  });

  it('建线程期间用户离开页面时放弃这次发送', async () => {
    let resolveCreate!: (id: string) => void;
    chat.createThread.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const { unmount } = renderAt(paths.app.chat.getHref());

    await send();
    unmount();
    resolveCreate('thread-新');

    await waitFor(() => expect(chat.createThread).toHaveBeenCalledTimes(1));
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });
});
