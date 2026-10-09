import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { syncStatuses, upsert, sessionState, session } = vi.hoisted(() => {
  const state = { isSuperuser: false, debugOpen: null as boolean | null };
  return {
    syncStatuses: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn(),
    sessionState: state,
    session: {
      useUser: () => ({
        data: { uid: 'u-1', username: 'tester', department_name: '平台组' },
      }),
      useLogout: () => vi.fn(),
      useKnowledgeEnabled: () => false,
      useIsSuperuser: () => state.isSuperuser,
    },
  };
});

/** 调试弹窗自己有一份测试；这里只验证用户菜单的入口是否接线。 */
vi.mock('@/features/debug', () => ({
  DebugModal: ({ open }: { open: boolean }) => {
    sessionState.debugOpen = open;
    return open ? <span data-testid="debug-modal-open" /> : null;
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
    // 外壳在真实应用里提供 QueryClient，侧边栏的挂载点（如调试弹窗）依赖它
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <SidebarProvider defaultOpen={defaultOpen}>
          <AppSidebar />
          <LocationProbe />
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
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

describe('用户菜单里的调试入口', () => {
  beforeEach(() => {
    vi.useRealTimers();
    sessionState.isSuperuser = false;
    sessionState.debugOpen = null;
  });

  afterEach(() => {
    sessionState.isSuperuser = false;
  });

  it('非超管看不到调试入口', async () => {
    renderSidebar();

    await userEvent.click(screen.getByRole('button', { name: /tester/ }));

    expect(screen.queryByRole('menuitem', { name: /调试/ })).toBeNull();
    expect(sessionState.debugOpen).toBe(false);
  });

  it('超管的调试入口打开弹窗', async () => {
    sessionState.isSuperuser = true;
    renderSidebar();

    await userEvent.click(screen.getByRole('button', { name: /tester/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /调试/ }));

    expect(await screen.findByTestId('debug-modal-open')).toBeInTheDocument();
    expect(sessionState.debugOpen).toBe(true);
  });
});
