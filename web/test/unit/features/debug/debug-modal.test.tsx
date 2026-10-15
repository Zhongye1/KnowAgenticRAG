/**
 * 调试弹窗：四个页签的数据来源与过滤、危险操作二次确认、凭据不外泄与导出。
 *
 * 这里不 mock `debug-api`，而是 mock 生成的 SDK——envelope 解包与凭据落盘都走真实实现。
 */
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// antd 词汇（按钮两字间距、message/modal 上下文）由应用装配承载，测试里同构挂上
import { AntdProvider } from '@/app/theme/antd-provider';

/** 弹窗里有多次 userEvent 驱动的页签与表格交互，给本文件单独放宽预算。 */
vi.setConfig({ testTimeout: 15000 });

const { api, currentUser, notifications, confirmMock } = vi.hoisted(() => ({
  api: {
    logs: vi.fn(),
    config: vi.fn(),
    users: vi.fn(),
    impersonate: vi.fn(),
  },
  currentUser: {
    value: {
      id: 7,
      uid: 'u-7',
      username: 'root',
      role: 'superadmin',
      department_name: '平台组',
      last_login: '2026-10-09T01:00:00Z',
    } as Record<string, unknown> | null,
  },
  notifications: { addNotification: vi.fn() },
  confirmMock: vi.fn(),
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  getSystemLogsApiSystemLogsGet: (...args: unknown[]) => api.logs(...args),
  getConfigApiSystemConfigGet: (...args: unknown[]) => api.config(...args),
  readUsersApiAuthUsersGet: (...args: unknown[]) => api.users(...args),
  impersonateUserApiAuthImpersonateUserIdPost: (...args: unknown[]) =>
    api.impersonate(...args),
}));

vi.mock('@/entities/session', () => ({
  useUser: () => ({ data: currentUser.value }),
}));

vi.mock('@/shared/ui/notifications', () => ({
  useNotifications: () => notifications,
}));

vi.mock('@/shared/ui/confirm-dialog', () => ({
  useConfirm: () => ({ confirm: (...args: unknown[]) => confirmMock(...args) }),
}));

const { DebugModal } = await import('@/features/debug');
const { useSystemLogs } = await import('@/features/debug/model/debug-queries');
const { TOKEN_STORAGE_KEY } = await import('@/shared/api');

const LOG_TEXT = [
  '2026-10-09 12:00:01,123 - INFO - ars.api - 服务启动',
  '2026-10-09 12:00:02,001 - WARNING - ars.worker - 队列积压',
  '2026-10-09 12:00:03,500 - ERROR - ars.services.rag - 检索炸了',
].join('\n');

const CONFIG = {
  RAG_TOP_K: 5,
  RAG_ENABLE: true,
  LLM_KEY: 'sk-不该出现',
  _config_items: {
    RAG_TOP_K: { type: 'int', des: '检索条数' },
    RAG_ENABLE: { type: 'bool', des: '检索开关' },
  },
};

const USERS = [
  {
    id: 7,
    uid: 'u-7',
    username: 'root',
    role: 'superadmin',
    department_name: '平台组',
  },
  {
    id: 8,
    uid: 'u-8',
    username: 'alice',
    role: 'user',
    department_name: '算法组',
  },
  {
    id: 9,
    uid: 'u-9',
    username: 'ops',
    role: 'superadmin',
    department_name: '平台组',
  },
];

const queryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient()}>{children}</QueryClientProvider>
);

/** 每个用例一个 user：剪贴板桩由 userEvent 自己装，测试只在其上打补丁。 */
let user: ReturnType<typeof userEvent.setup>;

const renderModal = (open = true) => {
  const onOpenChange = vi.fn();
  render(
    <AntdProvider>
      <QueryClientProvider client={queryClient()}>
        <DebugModal open={open} onOpenChange={onOpenChange} />
      </QueryClientProvider>
    </AntdProvider>,
  );
  return { onOpenChange };
};

const openTab = (name: string) =>
  user.click(screen.getByRole('button', { name: new RegExp(name) }));

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  notifications.addNotification.mockReset();
  confirmMock.mockReset();
  currentUser.value = {
    id: 7,
    uid: 'u-7',
    username: 'root',
    role: 'superadmin',
    department_name: '平台组',
    last_login: '2026-10-09T01:00:00Z',
  };
  window.localStorage.clear();
  user = userEvent.setup();
  api.logs.mockResolvedValue({ data: { log: LOG_TEXT }, error: undefined });
  api.config.mockResolvedValue({ data: CONFIG, error: undefined });
  api.users.mockResolvedValue({ data: USERS, error: undefined });
  api.impersonate.mockResolvedValue({
    data: { access_token: 'new-token' },
    error: undefined,
  });
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('系统日志页签', () => {
  it('默认按全部级别取日志并逐行渲染，级别可单独关掉', async () => {
    renderModal();

    await waitFor(() =>
      expect(screen.getByText(/服务启动/)).toBeInTheDocument(),
    );
    expect(api.logs).toHaveBeenCalledWith({
      query: { levels: 'INFO,WARNING,ERROR,DEBUG' },
    });
    expect(screen.getByText(/匹配 3 \/ 3 行/)).toBeInTheDocument();
    expect(screen.getByText(/检索炸了/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'ERROR' }));

    await waitFor(() => expect(screen.queryByText(/检索炸了/)).toBeNull());
    expect(screen.getByText(/队列积压/)).toBeInTheDocument();
    expect(api.logs).toHaveBeenLastCalledWith({
      query: { levels: 'INFO,WARNING,DEBUG' },
    });
  });

  it('完全相同的日志行不会撞 key（真实日志里同一秒会重复）', async () => {
    const duplicated = [
      '2026-10-09 12:00:01,123 - INFO - ars.api - 重复的一行',
      '2026-10-09 12:00:01,123 - INFO - ars.api - 重复的一行',
    ].join('\n');
    api.logs.mockResolvedValue({ data: { log: duplicated }, error: undefined });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    renderModal();

    await waitFor(() =>
      expect(screen.getAllByText(/重复的一行/)).toHaveLength(2),
    );
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes('same key'),
      ),
    ).toBe(false);
  });

  it('每行按时间 / 级别 / 模块 / 消息分列渲染', async () => {
    renderModal();
    await waitFor(() =>
      expect(screen.getByText(/服务启动/)).toBeInTheDocument(),
    );

    const rows = screen.getAllByTestId('debug-log-row');
    expect(rows).toHaveLength(3);
    expect(
      Array.from(rows[0].querySelectorAll('span')).map(
        (cell) => cell.textContent,
      ),
    ).toEqual(['2026-10-09 12:00:01,123', 'INFO', 'ars.api', '服务启动']);
  });

  it('至少留一个级别：点掉最后一个级别不生效，也不会不带级别重取整份日志', async () => {
    renderModal();
    await waitFor(() =>
      expect(screen.getByText(/服务启动/)).toBeInTheDocument(),
    );

    for (const level of ['INFO', 'WARN', 'ERROR']) {
      await user.click(screen.getByRole('button', { name: level }));
    }
    expect(screen.getByRole('button', { name: 'DEBUG' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'DEBUG' }));

    expect(screen.getByRole('button', { name: 'DEBUG' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // 每次请求都带着级别，不存在「不带 levels 读整份日志」的那一次
    expect(
      api.logs.mock.calls.every(
        (call) => (call[0] as { query?: { levels?: string } })?.query?.levels,
      ),
    ).toBe(true);
  });

  it('关键字按整行过滤，并在统计里给出命中数', async () => {
    renderModal();
    await waitFor(() =>
      expect(screen.getByText(/服务启动/)).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText('过滤日志关键字'), '队列');

    expect(screen.getByText(/匹配 1 \/ 3 行/)).toBeInTheDocument();
    expect(screen.queryByText(/服务启动/)).toBeNull();
  });

  it('复制只复制过滤后的日志', async () => {
    renderModal();
    await waitFor(() =>
      expect(screen.getByText(/服务启动/)).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText('过滤日志关键字'), '队列');
    await user.click(screen.getByRole('button', { name: /复制/ }));

    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe(
        '2026-10-09 12:00:02,001 - WARNING - ars.worker - 队列积压',
      ),
    );
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });

  it('剪贴板被拒绝时提示失败，而不是静默成功', async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValueOnce(new Error('denied'));
    renderModal();
    await waitFor(() =>
      expect(screen.getByText(/服务启动/)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: /复制/ }));

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' }),
      ),
    );
    expect(writeText).toHaveBeenCalled();
  });

  it('下载写出过滤后的文本，文件名带时间戳', async () => {
    const blobs: Blob[] = [];
    const downloads: string[] = [];
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return 'blob:mock';
      },
      revokeObjectURL: vi.fn(),
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function click(this: HTMLAnchorElement) {
        downloads.push(this.download);
      });

    renderModal();
    await waitFor(() =>
      expect(screen.getByText(/服务启动/)).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /下载/ }));

    expect(downloads).toEqual([
      expect.stringMatching(/^ars-api-log-\d{8}_\d{6}\.log$/),
    ]);
    expect(blobs).toHaveLength(1);
    await expect(blobs[0].text()).resolves.toBe(LOG_TEXT);
    clickSpy.mockRestore();
  });

  it('日志接口失败时给出错误提示，不伪装成空日志', async () => {
    api.logs.mockResolvedValue({
      data: undefined,
      error: { detail: '仅超级管理员可访问' },
      response: { status: 403 },
    });
    renderModal();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '仅超级管理员可访问',
    );
  });

  it('弹窗关掉后停掉轮询（enabled 跟着 open）', async () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderHook(
        ({ open }: { open: boolean }) =>
          useSystemLogs('INFO', { enabled: open, autoRefresh: true }),
        { wrapper, initialProps: { open: true } },
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      const afterOpen = api.logs.mock.calls.length;
      expect(afterOpen).toBe(1);

      rerender({ open: false });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      expect(api.logs.mock.calls.length).toBe(afterOpen);
    } finally {
      vi.useRealTimers();
    }
  });

  it('自动刷新按 5 秒轮询，关掉后不再重取', async () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderHook(
        ({ autoRefresh }: { autoRefresh: boolean }) =>
          useSystemLogs('INFO', { autoRefresh }),
        { wrapper, initialProps: { autoRefresh: true } },
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      const afterMount = api.logs.mock.calls.length;
      expect(afterMount).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100);
      });
      expect(api.logs.mock.calls.length).toBe(2);

      rerender({ autoRefresh: false });
      const afterStop = api.logs.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });
      expect(api.logs.mock.calls.length).toBe(afterStop);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('系统配置页签', () => {
  it('表格列出键值类型与说明，搜索同时过滤', async () => {
    renderModal();
    await openTab('系统配置');

    const table = await screen.findByRole('table');
    expect(within(table).getByText('RAG_TOP_K')).toBeInTheDocument();
    expect(within(table).getByText('int')).toBeInTheDocument();
    expect(within(table).getByText('检索条数')).toBeInTheDocument();
    expect(within(table).queryByText('_config_items')).toBeNull();

    await user.type(screen.getByLabelText('搜索配置项'), '开关');

    expect(within(table).queryByText('RAG_TOP_K')).toBeNull();
    expect(within(table).getByText('RAG_ENABLE')).toBeInTheDocument();
  });

  it('可切到 JSON 视图，复制的是完整配置', async () => {
    renderModal();
    await openTab('系统配置');
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'JSON' }));

    const json = screen.getByTestId('debug-config-json');
    expect(json).toHaveTextContent('"RAG_TOP_K": 5');
    expect(screen.queryByRole('table')).toBeNull();

    await user.click(screen.getByRole('button', { name: /复制 JSON/ }));
    await waitFor(async () =>
      expect(JSON.parse(await navigator.clipboard.readText())).toEqual(CONFIG),
    );
  });

  it('配置页只读：不给修改入口（写配置在后端做）', async () => {
    renderModal();
    await openTab('系统配置');

    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
    expect(within(table).queryByRole('button')).toBeNull();
  });
});

describe('用户与会话页签', () => {
  it('展示当前登录用户，自己那一行不给切换按钮', async () => {
    renderModal();
    await openTab('用户与会话');

    const card = await screen.findByTestId('debug-current-user');
    expect(card).toHaveTextContent('root');
    expect(card).toHaveTextContent('u-7');
    expect(card).toHaveTextContent('superadmin');
    expect(card).toHaveTextContent('平台组');
    expect(card).toHaveTextContent('2026-10-09T01:00:00Z');

    expect(screen.getAllByRole('button', { name: /切换身份/ })).toHaveLength(1);
    expect(screen.getByText('当前')).toBeInTheDocument();
  });

  it('取消二次确认就不切换身份', async () => {
    confirmMock.mockResolvedValue(false);
    renderModal();
    await openTab('用户与会话');

    await user.click(await screen.findByRole('button', { name: /切换身份/ }));

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ destructive: true }),
    );
    expect(api.impersonate).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('确认后切换身份、写回令牌并重载页面', async () => {
    confirmMock.mockResolvedValue(true);
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    renderModal();
    await openTab('用户与会话');

    await user.click(await screen.findByRole('button', { name: /切换身份/ }));

    await waitFor(() =>
      expect(api.impersonate).toHaveBeenCalledWith({ path: { user_id: 8 } }),
    );
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('new-token');
  });

  it('切换失败时报错且不动现有凭据', async () => {
    confirmMock.mockResolvedValue(true);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'old-token');
    api.impersonate.mockResolvedValue({
      data: undefined,
      error: { detail: '目标用户不存在' },
      response: { status: 404 },
    });
    renderModal();
    await openTab('用户与会话');

    await user.click(await screen.findByRole('button', { name: /切换身份/ }));

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: '目标用户不存在' }),
      ),
    );
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('old-token');
  });

  it('另一个超管不给切换入口：后端禁止模拟超管', async () => {
    renderModal();
    await openTab('用户与会话');
    await screen.findByRole('button', { name: /切换身份/ });

    const table = screen.getByRole('table');
    const opsRow = within(table).getByText('ops').closest('tr');
    expect(opsRow).not.toBeNull();
    expect(
      within(opsRow as HTMLElement).getByText('超管不可切换'),
    ).toBeInTheDocument();
    expect(
      within(table).getAllByRole('button', { name: /切换身份/ }),
    ).toHaveLength(1);
  });

  it('用户列表可搜索', async () => {
    renderModal();
    await openTab('用户与会话');
    await screen.findByRole('button', { name: /切换身份/ });

    await user.type(screen.getByLabelText('搜索用户'), '算法');

    const table = screen.getByRole('table');
    expect(within(table).getByText('alice')).toBeInTheDocument();
    expect(within(table).queryByText('root')).toBeNull();
  });

  it('用户列表加载失败时给出错误提示', async () => {
    api.users.mockResolvedValue({
      data: undefined,
      error: { detail: '没有权限' },
      response: { status: 403 },
    });
    renderModal();
    await openTab('用户与会话');

    expect(await screen.findByRole('alert')).toHaveTextContent('没有权限');
  });
});

describe('本地存储页签', () => {
  beforeEach(() => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'super-secret-token');
    window.localStorage.setItem('theme', 'dark');
    window.localStorage.setItem('custom-key', 'custom-value');
  });

  it('列出条目、标记系统键，且凭据值不出现在页面上', async () => {
    renderModal();
    await openTab('本地存储');

    const list = screen.getByRole('list');
    expect(within(list).getByText('theme')).toBeInTheDocument();
    expect(within(list).getByText('custom-value')).toBeInTheDocument();
    expect(within(list).getByText('（凭据已隐藏）')).toBeInTheDocument();
    expect(screen.getByRole('dialog').textContent).not.toContain(
      'super-secret-token',
    );
    expect(
      within(list).queryByRole('button', { name: `复制 ${TOKEN_STORAGE_KEY}` }),
    ).toBeNull();
  });

  it('每次切到本地存储页都重读 localStorage', async () => {
    renderModal();
    await openTab('本地存储');
    expect(screen.queryByText('later-key')).toBeNull();

    window.localStorage.setItem('later-key', 'later-value');
    await openTab('系统日志');
    await openTab('本地存储');

    expect(screen.getByText('later-key')).toBeInTheDocument();
  });

  it('搜索过滤键与值', async () => {
    renderModal();
    await openTab('本地存储');

    await user.type(await screen.findByLabelText('搜索本地存储'), 'custom');

    expect(screen.getByText('custom-key')).toBeInTheDocument();
    expect(screen.queryByText('theme')).toBeNull();
    expect(screen.queryByText(/没有匹配的条目/)).toBeNull();
  });

  it('导出 JSON 跳过凭据', async () => {
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return 'blob:mock';
      },
      revokeObjectURL: vi.fn(),
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    renderModal();
    await openTab('本地存储');

    await user.click(await screen.findByRole('button', { name: /导出/ }));

    expect(blobs).toHaveLength(1);
    const payload = JSON.parse(await blobs[0].text()) as Record<string, string>;
    expect(payload).toEqual({ theme: 'dark', 'custom-key': 'custom-value' });
    expect(JSON.stringify(payload)).not.toContain('super-secret-token');
    clickSpy.mockRestore();
  });

  it('复制单个键的值', async () => {
    renderModal();
    await openTab('本地存储');

    await user.click(
      await screen.findByRole('button', { name: '复制 custom-key' }),
    );

    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe('custom-value'),
    );
  });
});

describe('弹窗骨架', () => {
  it('关着时不取任何数据', () => {
    renderModal(false);

    expect(api.logs).not.toHaveBeenCalled();
    expect(api.config).not.toHaveBeenCalled();
    expect(api.users).not.toHaveBeenCalled();
    expect(screen.queryByText('调试面板')).toBeNull();
  });

  it('关闭按钮把开合状态交回调用方', async () => {
    const { onOpenChange } = renderModal();

    // Modal 有挂载动画；等日志内容渲染可见后再点页脚的关闭按钮
    await screen.findByText(/服务启动/);
    await user.click(screen.getByRole('button', { name: '关闭' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
