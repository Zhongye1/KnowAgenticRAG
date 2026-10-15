import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 这套用例逐个靠 userEvent 驱动弹窗与表单，全套件并行跑时会超过默认 5 秒预算；
 * 与 `knowledge-file-table` 等重交互文件同一口径，给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

const { syncStatuses, upsert, sessionState, session } = vi.hoisted(() => {
  const state = { isSuperuser: false, isAdmin: false, knowledgeEnabled: false };
  return {
    syncStatuses: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn(),
    sessionState: state,
    session: {
      useUser: () => ({
        data: {
          uid: 'u-1',
          username: 'tester',
          role: 'user',
          avatar: null,
        },
      }),
      useLogout: () => ({ mutate: vi.fn() }),
      useKnowledgeEnabled: () => state.knowledgeEnabled,
      useIsSuperuser: () => state.isSuperuser,
      useIsAdmin: () => state.isAdmin,
      useShellBranding: () => ({ brandName: 'ARS', avatar: '' }),
      // 文案映射有自己的用例，这里给一个能通过的最小实现
      formatUserRole: () => '普通用户',
      useUserConfig: () => ({
        data: { enableMemory: false },
        isPending: false,
      }),
      useUpdateProfile: () => ({ mutateAsync: vi.fn() }),
      useUpdateUserConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
      useUploadAvatar: () => ({ mutateAsync: vi.fn() }),
    },
  };
});

vi.mock('@/features/account-settings', () => ({
  // 弹窗本体在 features 里单独测，这里只验证菜单入口的接线
  SettingsModal: ({ open }: { open: boolean }) =>
    open ? <div>账户设置弹窗</div> : null,
}));

vi.mock('@/features/task-center', () => ({
  // 入口与面板在 features 里单独测，这里只验证它落在用户行里、拿到了折叠态
  TaskCenter: ({ collapsed }: { collapsed: boolean }) => (
    <span data-testid="task-center">{collapsed ? 'collapsed' : 'expanded'}</span>
  ),
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
  // 弹窗本体在 features 里单独测，这里只验证导航列的接线
  GlobalSearchModal: ({
    open,
    onSelectThread,
  }: {
    open: boolean;
    onSelectThread: (thread: { id: string } | null) => void;
  }) =>
    open ? (
      <>
        <button
          type="button"
          onClick={() => onSelectThread({ id: 'thread-B' })}
        >
          选中搜索结果
        </button>
        <button type="button" onClick={() => onSelectThread(null)}>
          选中新对话
        </button>
      </>
    ) : null,
}));

vi.mock('@/entities/session', () => session);

/**
 * 只替换切换动作：菜单项要断言的是「点它会不会触发主题切换」。
 * 真的执行切换会改 `html.dark`，进而让 `useIsDarkMode` 的 MutationObserver
 * 在 act 之外同步状态；主题是否真的应用由 `day-night-switcher.test.tsx` 覆盖。
 */
const { toggleThemeMock } = vi.hoisted(() => ({ toggleThemeMock: vi.fn() }));

vi.mock('@/shared/lib', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib')>();
  return { ...actual, toggleTheme: toggleThemeMock };
});

const { AppSidebar } = await import('@/widgets/app-sidebar');
const { useDebugPanel } = await import('@/features/debug');

/** 路由探针：选中搜索结果后断言跳转目标。 */
const LocationProbe = () => (
  <span data-testid="path">{useLocation().pathname}</span>
);

const renderSidebar = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <AppSidebar />
        <LocationProbe />
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

describe('导航列的线程状态同步', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    syncStatuses.mockClear();
    setVisibility('visible');
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
    window.localStorage.clear();
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

  it('折叠态跳过同步', async () => {
    window.localStorage.setItem('ars_sidebar_collapsed', 'true');
    renderSidebar();

    await advanceSync();

    expect(syncStatuses).not.toHaveBeenCalled();
  });

  it('卸载后不再同步', async () => {
    const { unmount } = renderSidebar();
    unmount();

    await advanceSync();

    expect(syncStatuses).not.toHaveBeenCalled();
  });
});

describe('导航列的会话搜索入口', () => {
  beforeEach(() => {
    vi.useRealTimers();
    upsert.mockClear();
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('入口打开弹窗，选中结果后写回列表并跳转', async () => {
    renderSidebar();

    await userEvent.click(screen.getByRole('button', { name: '搜索' }));
    await userEvent.click(
      await screen.findByRole('button', { name: '选中搜索结果' }),
    );

    expect(upsert).toHaveBeenCalledWith({ id: 'thread-B' });
    expect(screen.getByTestId('path').textContent).toBe('/agent/thread-B');
  });

  it('选中「新对话」回到没有线程的地址', async () => {
    renderSidebar();

    await userEvent.click(screen.getByRole('button', { name: '搜索' }));
    await userEvent.click(
      await screen.findByRole('button', { name: '选中新对话' }),
    );

    expect(upsert).not.toHaveBeenCalled();
    expect(screen.getByTestId('path').textContent).toBe('/agent');
  });
});

describe('导航列的折叠态', () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.body.removeAttribute('data-theme');
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.body.removeAttribute('data-theme');
  });

  it('默认展开，点击折叠后写入本地存储', async () => {
    renderSidebar();

    expect(screen.getByRole('link', { name: /新建对话/ })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '折叠侧边栏' }));

    expect(window.localStorage.getItem('ars_sidebar_collapsed')).toBe('true');
  });

  it('刷新后按本地存储恢复折叠态', () => {
    window.localStorage.setItem('ars_sidebar_collapsed', 'true');
    renderSidebar();

    expect(
      screen.getByRole('button', { name: '展开侧边栏' }),
    ).toBeInTheDocument();
    // 折叠态由 CSS 收起文字，折叠动作本身换成展开动作
    expect(screen.queryByRole('button', { name: '折叠侧边栏' })).toBeNull();
  });

  it('存储值损坏时按展开处理', () => {
    window.localStorage.setItem('ars_sidebar_collapsed', 'yes');
    renderSidebar();

    expect(screen.getByRole('link', { name: /新建对话/ })).toBeTruthy();
  });

  it('折叠态把搜索入口放进导航项，且全页只有这一个', async () => {
    window.localStorage.setItem('ars_sidebar_collapsed', 'true');
    renderSidebar();

    const nav = screen.getByRole('navigation', { name: '页面导航' });
    expect(screen.getAllByRole('button', { name: '搜索' })).toHaveLength(1);

    await userEvent.click(within(nav).getByRole('button', { name: '搜索' }));

    expect(
      await screen.findByRole('button', { name: '选中搜索结果' }),
    ).toBeInTheDocument();
  });

  it('展开态只在品牌区放搜索入口，导航项里没有', () => {
    renderSidebar();

    const nav = screen.getByRole('navigation', { name: '页面导航' });

    expect(within(nav).queryByRole('button', { name: '搜索' })).toBeNull();
    expect(screen.getAllByRole('button', { name: '搜索' })).toHaveLength(1);
  });

  it('展开态把日夜切换开关放在 GitHub 那一行', () => {
    renderSidebar();

    const githubRow = screen.getByRole('link', { name: /GitHub/ }).parentElement;

    expect(
      within(githubRow as HTMLElement).getByRole('switch', {
        name: '切换日间/夜间模式',
      }),
    ).toBeInTheDocument();
  });

  it('折叠态不渲染放不下的日夜切换开关', () => {
    window.localStorage.setItem('ars_sidebar_collapsed', 'true');
    renderSidebar();

    expect(
      screen.queryByRole('switch', { name: '切换日间/夜间模式' }),
    ).toBeNull();
  });

  it('任务中心入口与用户菜单同一行，并按折叠态传参', () => {
    renderSidebar();

    const userRow = screen.getByRole('button', { name: '用户菜单' })
      .parentElement;

    expect(
      within(userRow as HTMLElement).getByTestId('task-center').textContent,
    ).toBe('expanded');
  });

  it('折叠态仍能从用户菜单切主题，补回被隐藏的开关', async () => {
    window.localStorage.setItem('ars_sidebar_collapsed', 'true');
    renderSidebar();

    toggleThemeMock.mockClear();
    await userEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    await userEvent.click(await screen.findByText('切换到深色模式'));

    expect(toggleThemeMock).toHaveBeenCalledTimes(1);
  });
});

describe('导航项的顺序与门禁', () => {
  beforeEach(() => {
    vi.useRealTimers();
    sessionState.isSuperuser = false;
    sessionState.knowledgeEnabled = false;
    window.localStorage.clear();
  });

  afterEach(() => {
    sessionState.isSuperuser = false;
    sessionState.knowledgeEnabled = false;
    window.localStorage.clear();
  });

  it('普通用户按参照顺序看到四项，且没有数据总览', () => {
    renderSidebar();

    const nav = screen.getByRole('navigation', { name: '页面导航' });
    const titles = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);

    expect(titles).toEqual(['新建对话', '智能体', '个人空间', '技能']);
    expect(screen.queryByRole('link', { name: /数据总览/ })).toBeNull();
  });

  it('超管多一项数据总览', () => {
    sessionState.isSuperuser = true;
    renderSidebar();

    expect(screen.getByRole('link', { name: /数据总览/ })).toBeInTheDocument();
  });

  it('知识库能力开启时扩展项文案切换', () => {
    sessionState.knowledgeEnabled = true;
    renderSidebar();

    expect(
      screen.getByRole('link', { name: /知识库 · 技能/ }),
    ).toBeInTheDocument();
  });
});

describe('用户菜单里的调试入口', () => {
  beforeEach(() => {
    vi.useRealTimers();
    sessionState.isSuperuser = false;
    useDebugPanel.setState({ open: false });
    window.localStorage.clear();
  });

  afterEach(() => {
    sessionState.isSuperuser = false;
    useDebugPanel.setState({ open: false });
    window.localStorage.clear();
  });

  it('非超管看不到调试入口', async () => {
    renderSidebar();

    await userEvent.click(screen.getByRole('button', { name: '用户菜单' }));

    expect(await screen.findByText('文档中心')).toBeInTheDocument();
    expect(screen.queryByText('调试面板')).toBeNull();
    expect(useDebugPanel.getState().open).toBe(false);
  });

  it('超管的调试入口打开同一个开关', async () => {
    sessionState.isSuperuser = true;
    renderSidebar();

    await userEvent.click(screen.getByRole('button', { name: '用户菜单' }));
    await userEvent.click(await screen.findByText('调试面板'));

    expect(useDebugPanel.getState().open).toBe(true);
  });
});
