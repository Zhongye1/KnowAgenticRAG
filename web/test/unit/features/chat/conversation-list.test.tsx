import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigProvider } from 'antd';

const { api } = vi.hoisted(() => ({
  api: {
    getDefaultAgent: vi.fn(),
    listThreads: vi.fn(),
    updateThread: vi.fn(),
    deleteThread: vi.fn(),
    markViewed: vi.fn(),
  },
}));

vi.mock('@/features/chat/api/agent-api', () => ({
  agentRunApi: { getDefaultAgent: api.getDefaultAgent },
  chatThreadApi: {
    listThreads: api.listThreads,
    updateThread: api.updateThread,
    deleteThread: api.deleteThread,
    markViewed: api.markViewed,
  },
}));

const { ConversationList } =
  await import('@/features/chat/ui/conversation-list');
const { useThreadList } =
  await import('@/features/chat/model/thread-list-store');
const { getThreadRuntime, hasThreadRuntime } =
  await import('@/features/chat/model/thread-runtime-store');

const thread = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  agent_id: 'default-chatbot',
  title: id,
  ...extra,
});

/** 可手动结算的 promise，避免用例留下永不落定的请求污染 store 的单飞状态。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const LocationProbe = () => {
  const location = useLocation();
  return <span data-testid="path">{location.pathname}</span>;
};

const renderList = (currentThreadId?: string) =>
  render(
    // 与 app 一致：antd 按钮不做两字间距，否则「删除」的可访问名变成「删 除」
    <ConfigProvider button={{ autoInsertSpace: false }}>
    <MemoryRouter initialEntries={[`/agent/${currentThreadId ?? ''}`]}>
      <Routes>
        <Route
          path="/agent"
          element={<ConversationList currentThreadId={currentThreadId} />}
        />
        <Route
          path="/agent/:threadId"
          element={<ConversationList currentThreadId={currentThreadId} />}
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
    </ConfigProvider>,
  );

describe('ConversationList', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    api.getDefaultAgent.mockResolvedValue({
      agent: { slug: 'default-chatbot' },
    });
    useThreadList.setState({
      agentSlug: null,
      threads: [],
      loading: false,
      error: null,
    });
  });

  it('按当前智能体拉取列表，标题缺省时用占位文案', async () => {
    api.listThreads.mockResolvedValue([
      thread('会话一'),
      thread('会话二', { title: null }),
    ]);

    renderList();

    expect(await screen.findByText('会话一')).toBeTruthy();
    expect(screen.getByText('未命名会话')).toBeTruthy();
    expect(api.listThreads).toHaveBeenCalledWith(
      expect.objectContaining({ agentSlug: 'default-chatbot' }),
    );
  });

  it('置顶会话带标记，当前会话标记为当前页', async () => {
    api.listThreads.mockResolvedValue([
      thread('会话二', { is_pinned: true }),
      thread('会话一'),
    ]);

    renderList('会话一');

    const pinned = await screen.findByRole('link', { name: /会话二/ });
    expect(pinned.querySelector('[aria-label="已置顶"]')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: '会话一' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(
      screen.getByRole('link', { name: /会话二/ }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('加载中给出等待文案，且不出现空态文案', async () => {
    const pending = deferred<unknown>();
    api.listThreads.mockReturnValue(pending.promise);

    renderList();

    expect(await screen.findByText('正在加载会话…')).toBeTruthy();
    expect(screen.queryByText('还没有历史会话。')).toBeNull();

    pending.resolve([]);
  });

  it('解析智能体期间也保持加载态，不先闪空态', async () => {
    const agent = deferred<unknown>();
    api.getDefaultAgent.mockReturnValue(agent.promise);
    api.listThreads.mockResolvedValue([]);

    renderList();

    expect(screen.queryByText('还没有历史会话。')).toBeNull();

    agent.resolve({ agent: { slug: 'default-chatbot' } });
    await waitFor(() =>
      expect(screen.getByText('还没有历史会话。')).toBeTruthy(),
    );
  });

  it('解析失败时显示原因，不拉列表也不显示跨智能体会话', async () => {
    api.getDefaultAgent.mockRejectedValue(new Error('boom'));
    api.listThreads.mockResolvedValue([thread('别的会话')]);

    renderList();

    await waitFor(() =>
      expect(screen.getByText('获取默认智能体失败。')).toBeTruthy(),
    );
    expect(api.listThreads).not.toHaveBeenCalled();
    expect(screen.queryByText('别的会话')).toBeNull();
  });

  it('没有历史会话时给出空态', async () => {
    api.listThreads.mockResolvedValue([]);

    renderList();

    expect(await screen.findByText('还没有历史会话。')).toBeTruthy();
  });

  it('加载失败时显示原因，而不是停在空白列表', async () => {
    api.listThreads.mockRejectedValue(new Error('网络不可用'));

    renderList();

    await waitFor(() => expect(screen.getByText('网络不可用')).toBeTruthy());
  });

  it('重命名：进入编辑态、回填标题、回车提交', async () => {
    api.listThreads.mockResolvedValue([thread('旧标题')]);
    api.updateThread.mockResolvedValue({
      id: '旧标题',
      agent_id: 'default-chatbot',
      title: '新标题',
    });
    renderList();

    await userEvent.click(
      await screen.findByRole('button', { name: '会话操作：旧标题' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: '重命名' }),
    );

    const input = screen.getByLabelText('会话标题');
    expect((input as HTMLInputElement).value).toBe('旧标题');
    await userEvent.clear(input);
    await userEvent.type(input, '新标题{Enter}');

    await waitFor(() =>
      expect(api.updateThread).toHaveBeenCalledWith('旧标题', {
        title: '新标题',
      }),
    );
    expect(await screen.findByText('新标题')).toBeTruthy();
  });

  it('置顶菜单按当前状态切换文案并调用后端', async () => {
    api.listThreads.mockResolvedValue([thread('会话一')]);
    api.updateThread.mockResolvedValue({
      id: '会话一',
      agent_id: 'default-chatbot',
      is_pinned: true,
    });
    renderList();

    await userEvent.click(
      await screen.findByRole('button', { name: '会话操作：会话一' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: '置顶' }),
    );

    await waitFor(() =>
      expect(api.updateThread).toHaveBeenCalledWith('会话一', {
        isPinned: true,
      }),
    );
  });

  it('删除当前会话后回到新建对话路由，不留一条已死的会话', async () => {
    api.listThreads.mockResolvedValue([thread('会话一'), thread('会话二')]);
    api.deleteThread.mockResolvedValue(undefined);
    getThreadRuntime('会话一');
    renderList('会话一');

    await userEvent.click(
      await screen.findByRole('button', { name: '会话操作：会话一' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: '删除' }),
    );
    await userEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() =>
      expect(screen.getByTestId('path').textContent).toBe('/agent'),
    );
    // 删除后该线程的运行时条目必须消失，否则在途请求会把它复活
    expect(hasThreadRuntime('会话一')).toBe(false);
  });

  it('删除别的会话时留在当前路由', async () => {
    api.listThreads.mockResolvedValue([thread('会话一'), thread('会话二')]);
    api.deleteThread.mockResolvedValue(undefined);
    // 两条线程都先建立运行时，才能验证只清掉被删的那条
    getThreadRuntime('会话一');
    getThreadRuntime('会话二');
    renderList('会话一');

    await userEvent.click(
      await screen.findByRole('button', { name: '会话操作：会话二' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: '删除' }),
    );
    await userEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => expect(api.deleteThread).toHaveBeenCalled());
    expect(screen.getByTestId('path').textContent).toBe('/agent/会话一');
    expect(hasThreadRuntime('会话二')).toBe(false);
    expect(hasThreadRuntime('会话一')).toBe(true);
  });

  it('删除需要二次确认，确认后才调用后端', async () => {
    api.listThreads.mockResolvedValue([thread('会话一')]);
    api.deleteThread.mockResolvedValue(undefined);
    renderList();

    await userEvent.click(
      await screen.findByRole('button', { name: '会话操作：会话一' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: '删除' }),
    );

    expect(api.deleteThread).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() =>
      expect(api.deleteThread).toHaveBeenCalledWith('会话一'),
    );
    await waitFor(() => expect(screen.queryByText('会话一')).toBeNull());
  });

  it('按 thread_status 渲染运行中与新回复标记', async () => {
    api.listThreads.mockResolvedValue([
      thread('运行中', { thread_status: 'loading' }),
      thread('有新回复', { thread_status: 'ready' }),
      thread('已读完', { thread_status: 'done' }),
    ]);

    renderList();

    // 断言必须落在对应的那一行：只查全局 label 时两个分支对调也能过
    const loadingRow = await screen.findByRole('link', { name: /运行中/ });
    expect(within(loadingRow).getByLabelText('正在运行')).toBeTruthy();
    const readyRow = screen.getByRole('link', { name: /有新回复/ });
    expect(within(readyRow).getByLabelText('有新回复')).toBeTruthy();
    // done 不显示任何标记
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });
});
