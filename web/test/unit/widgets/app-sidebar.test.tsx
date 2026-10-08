import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { syncStatuses, upsert, session } = vi.hoisted(() => ({
  syncStatuses: vi.fn().mockResolvedValue(undefined),
  upsert: vi.fn(),
  session: {
    useUser: () => ({ uid: 'u-1', username: 'tester' }),
    useLogout: () => vi.fn(),
    useKnowledgeEnabled: () => false,
    useIsSuperuser: () => false,
  },
}));

vi.mock('@/features/chat', () => ({
  ConversationList: () => null,
  useThreadList: (selector: (state: unknown) => unknown) =>
    selector({
      syncStatuses,
      upsert,
      threads: [
        {
          id: 'thread-B',
          agent_id: 'default-chatbot',
          title: '命中的会话',
        },
      ],
    }),
  // 弹窗本体在 features 里单独测，这里只验证侧边栏的接线
  GlobalSearchModal: ({
    open,
    onSelectThread,
  }: {
    open: boolean;
    onSelectThread: (thread: { id: string } | null) => void;
  }) =>
    open ? (
      <>
        <button type="button" onClick={() => onSelectThread({ id: 'thread-B' })}>
          选中搜索结果
        </button>
        <button type="button" onClick={() => onSelectThread(null)}>
          选中新对话
        </button>
      </>
    ) : null,
}));

vi.mock('@/entities/session', () => session);

const { AppSidebar } = await import('@/widgets/app-sidebar');
const { SidebarProvider } = await import('@/shared/ui/sidebar');

/** 路由探针：选中搜索结果后断言跳转目标。 */
const LocationProbe = () => <span data-testid="path">{useLocation().pathname}</span>;

const renderSidebar = (defaultOpen = true) =>
  render(
    <MemoryRouter>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        <LocationProbe />
      </SidebarProvider>
    </MemoryRouter>,
  );

/** 推进一个同步周期；回调里的 promise 需要用 act 包住。 */
const advanceSync = async () => {
  await act(async () => {
    vi.advanceTimersByTime(12_000);
  });
};

const setVisibility = (value: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => value,
  });
};

/** `useIsMobile` 按 `window.innerWidth` 判定（断点 768），不是按 media query 的 matches。 */
const setMobileViewport = (isMobile: boolean) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: isMobile ? 480 : 1280,
  });
};

describe('侧边栏的线程状态同步', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    syncStatuses.mockClear();
    setVisibility('visible');
    setMobileViewport(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
    setMobileViewport(false);
  });

  it('展开且页面可见时按 12 秒一次同步状态', async () => {
    renderSidebar();

    await advanceSync();
    expect(syncStatuses).toHaveBeenCalledTimes(1);

    await advanceSync();
    expect(syncStatuses).toHaveBeenCalledTimes(2);
  });

  it('页面不可见时跳过同步', async () => {
    setVisibility('hidden');
    renderSidebar();

    await advanceSync();

    expect(syncStatuses).not.toHaveBeenCalled();
  });

  it('桌面端侧边栏折叠时跳过同步', async () => {
    renderSidebar(false);

    await advanceSync();

    expect(syncStatuses).not.toHaveBeenCalled();
  });

  it('移动端折叠态只是桌面开合状态，仍然同步', async () => {
    setMobileViewport(true);
    renderSidebar(false);

    await advanceSync();

    expect(syncStatuses).toHaveBeenCalledTimes(1);
  });

  it('卸载后不再同步', async () => {
    const { unmount } = renderSidebar();
    unmount();

    await advanceSync();

    expect(syncStatuses).not.toHaveBeenCalled();
  });
});

describe('侧边栏的会话搜索入口', () => {
  beforeEach(() => {
    vi.useRealTimers();
    upsert.mockClear();
  });

  it('入口打开弹窗，选中结果后写回列表并跳转', async () => {
    renderSidebar();

    await userEvent.click(screen.getByRole('button', { name: /搜索会话/ }));
    await userEvent.click(
      await screen.findByRole('button', { name: '选中搜索结果' }),
    );

    expect(upsert).toHaveBeenCalledWith({ id: 'thread-B' });
    expect(screen.getByTestId('path').textContent).toBe('/agent/thread-B');
  });

  it('选中「新对话」回到没有线程的地址', async () => {
    renderSidebar();

    await userEvent.click(screen.getByRole('button', { name: /搜索会话/ }));
    await userEvent.click(
      await screen.findByRole('button', { name: '选中新对话' }),
    );

    expect(upsert).not.toHaveBeenCalled();
    expect(screen.getByTestId('path').textContent).toBe('/agent');
  });
});
