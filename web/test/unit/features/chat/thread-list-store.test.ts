import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const { sortThreads, useThreadList } =
  await import('@/features/chat/model/thread-list-store');

const reset = () => {
  for (const fn of Object.values(api)) fn.mockReset();
  useThreadList.setState({
    agentSlug: null,
    agentToolApprovalMode: null,
    threads: [],
    loading: false,
    error: null,
  });
};

/** 只判空实现：`load` 在 effect 里被并发调用，`waitFor` 之外不需要等待。 */

const thread = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  agent_id: 'default-chatbot',
  title: id,
  ...extra,
});

describe('sortThreads', () => {
  it('置顶的排前面，其余保持后端的顺序', () => {
    const sorted = sortThreads([
      thread('a'),
      thread('b', { is_pinned: true }),
      thread('c'),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('useThreadList', () => {
  beforeEach(reset);

  it('解析默认智能体只请求一次，并发与串行都复用结果', async () => {
    api.getDefaultAgent.mockResolvedValue({
      agent: { slug: 'default-chatbot' },
    });

    // 侧边栏与对话页同时挂载：在飞请求也要复用
    const [first, second] = await Promise.all([
      useThreadList.getState().ensureAgentSlug(),
      useThreadList.getState().ensureAgentSlug(),
    ]);
    await useThreadList.getState().ensureAgentSlug();

    expect([first, second]).toEqual(['default-chatbot', 'default-chatbot']);
    expect(api.getDefaultAgent).toHaveBeenCalledTimes(1);
  });

  it('取不到默认智能体时给出可展示原因，不静默留空', async () => {
    api.getDefaultAgent.mockRejectedValue(new Error('boom'));

    await expect(
      useThreadList.getState().ensureAgentSlug(),
    ).resolves.toBeNull();

    expect(useThreadList.getState().error).toBe('获取默认智能体失败。');
  });

  it('加载会话列表写入状态并清掉上一次的错误', async () => {
    useThreadList.setState({ error: '旧错误' });
    api.listThreads.mockResolvedValue([thread('a')]);

    await useThreadList.getState().load('default-chatbot');

    expect(useThreadList.getState().threads.map((item) => item.id)).toEqual([
      'a',
    ]);
    expect(useThreadList.getState().loading).toBe(false);
    expect(useThreadList.getState().error).toBeNull();
    expect(api.listThreads).toHaveBeenCalledWith(
      expect.objectContaining({ agentSlug: 'default-chatbot' }),
    );
  });

  it('解析失败时 initialize 不拉列表，保留失败原因', async () => {
    api.getDefaultAgent.mockRejectedValue(new Error('boom'));

    await useThreadList.getState().initialize();

    expect(api.listThreads).not.toHaveBeenCalled();
    expect(useThreadList.getState().error).toBe('获取默认智能体失败。');
    expect(useThreadList.getState().loading).toBe(false);
  });

  it('没有智能体时不发列表请求，避免拉回跨智能体的会话', async () => {
    await useThreadList.getState().load(null);

    expect(api.listThreads).not.toHaveBeenCalled();
  });

  it('侧边栏与对话页同时 initialize 只发一次默认智能体请求', async () => {
    let resolveAgent: (value: unknown) => void = () => undefined;
    api.getDefaultAgent.mockReturnValue(
      new Promise((resolve) => {
        resolveAgent = resolve;
      }),
    );
    api.listThreads.mockResolvedValue([thread('a')]);

    const both = Promise.all([
      useThreadList.getState().initialize(),
      useThreadList.getState().initialize(),
    ]);
    resolveAgent({ agent: { slug: 'default-chatbot' } });
    await both;

    expect(api.getDefaultAgent).toHaveBeenCalledTimes(1);
    expect(api.listThreads).toHaveBeenCalledTimes(1);
    expect(useThreadList.getState().threads.map((item) => item.id)).toEqual([
      'a',
    ]);
  });

  it('后发起的加载覆盖先发起的，旧响应不写回', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    api.listThreads
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce([thread('new')]);

    const stale = useThreadList.getState().load('default-chatbot');
    await useThreadList.getState().load('default-chatbot');
    resolveFirst([thread('old')]);
    await stale;

    expect(useThreadList.getState().threads.map((item) => item.id)).toEqual([
      'new',
    ]);
  });

  it('加载失败时保留旧列表并给出原因', async () => {
    api.listThreads.mockResolvedValue([thread('a')]);
    await useThreadList.getState().load('default-chatbot');

    api.listThreads.mockRejectedValue(new Error('网络不可用'));
    await useThreadList.getState().load('default-chatbot');

    expect(useThreadList.getState().threads.map((item) => item.id)).toEqual([
      'a',
    ]);
    expect(useThreadList.getState().error).toBe('网络不可用');
  });

  it('新建线程插到最前且不重复', () => {
    useThreadList.setState({ threads: [thread('a'), thread('b')] });

    // 用未置顶的线程：置顶会被 sortThreads 排到最前，测不出插入位置
    useThreadList.getState().upsert(thread('new'));

    expect(useThreadList.getState().threads.map((item) => item.id)).toEqual([
      'new',
      'a',
      'b',
    ]);

    useThreadList.getState().upsert(thread('a', { title: '改名' }));
    expect(useThreadList.getState().threads.map((item) => item.id)).toEqual([
      'new',
      'a',
      'b',
    ]);
  });

  it('已存在的线程按字段合并，不丢后端返回的其它字段', () => {
    useThreadList.setState({
      threads: [thread('a', { is_pinned: true, thread_status: 'done' })],
    });

    useThreadList.getState().upsert(thread('a', { title: '新标题' }));

    expect(useThreadList.getState().threads[0]).toMatchObject({
      title: '新标题',
      is_pinned: true,
      thread_status: 'done',
    });
  });
});

describe('会话变更动作', () => {
  beforeEach(reset);

  it('重命名成功后只改本地那一条，并按后端返回合并', async () => {
    useThreadList.setState({ threads: [thread('a'), thread('b')] });
    api.updateThread.mockResolvedValue({
      id: 'a',
      agent_id: 'default-chatbot',
      title: '新标题',
    });

    await expect(
      useThreadList.getState().rename('a', ' 新标题 '),
    ).resolves.toBe(true);

    expect(api.updateThread).toHaveBeenCalledWith('a', { title: '新标题' });
    expect(useThreadList.getState().threads.map((item) => item.title)).toEqual([
      '新标题',
      'b',
    ]);
    expect(useThreadList.getState().error).toBeNull();
  });

  it('空标题不发请求', async () => {
    useThreadList.setState({ threads: [thread('a')] });

    await expect(useThreadList.getState().rename('a', '   ')).resolves.toBe(
      false,
    );

    expect(api.updateThread).not.toHaveBeenCalled();
  });

  it('重命名失败时保留原标题并给出原因', async () => {
    useThreadList.setState({ threads: [thread('a', { title: '原名' })] });
    api.updateThread.mockRejectedValue(new Error('标题过长'));

    await expect(useThreadList.getState().rename('a', '新名')).resolves.toBe(
      false,
    );

    expect(useThreadList.getState().threads[0]?.title).toBe('原名');
    expect(useThreadList.getState().error).toBe('标题过长');
  });

  it('置顶切换取反当前值并重排', async () => {
    useThreadList.setState({
      threads: [thread('a'), thread('b', { is_pinned: true })],
    });
    api.updateThread.mockResolvedValue({
      id: 'a',
      agent_id: 'default-chatbot',
      is_pinned: true,
    });

    await useThreadList.getState().togglePin('a');

    expect(api.updateThread).toHaveBeenCalledWith('a', { isPinned: true });
    expect(useThreadList.getState().threads.map((item) => item.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('删除成功后从列表移除，失败时保留', async () => {
    useThreadList.setState({ threads: [thread('a'), thread('b')] });
    api.deleteThread.mockResolvedValue(undefined);

    await expect(useThreadList.getState().remove('a')).resolves.toBe(true);
    expect(useThreadList.getState().threads.map((item) => item.id)).toEqual([
      'b',
    ]);

    api.deleteThread.mockRejectedValue(new Error('会话不存在'));
    await expect(useThreadList.getState().remove('b')).resolves.toBe(false);
    expect(useThreadList.getState().threads.map((item) => item.id)).toEqual([
      'b',
    ]);
    expect(useThreadList.getState().error).toBe('会话不存在');
  });

  it('解析默认智能体时带上它的审批模式默认值', async () => {
    api.getDefaultAgent.mockResolvedValue({
      agent: {
        slug: 'default-chatbot',
        config_json: { context: { tool_approval_mode: 'always_trust' } },
      },
    });

    await useThreadList.getState().ensureAgentSlug();

    expect(useThreadList.getState().agentToolApprovalMode).toBe('always_trust');
  });

  it('智能体配了非法审批模式时按未配置处理', async () => {
    api.getDefaultAgent.mockResolvedValue({
      agent: {
        slug: 'default-chatbot',
        config_json: { context: { tool_approval_mode: 'auto' } },
      },
    });

    await useThreadList.getState().ensureAgentSlug();

    expect(useThreadList.getState().agentToolApprovalMode).toBeNull();
  });

  it('智能体没配审批模式时留空，交给本地偏好与默认值', async () => {
    api.getDefaultAgent.mockResolvedValue({
      agent: { slug: 'default-chatbot', config_json: { context: {} } },
    });

    await useThreadList.getState().ensureAgentSlug();

    expect(useThreadList.getState().agentToolApprovalMode).toBeNull();
  });

  it('设置线程审批模式：先就地改 metadata，再以后端返回为准', async () => {
    useThreadList.setState({ threads: [thread('a')] });
    let resolveUpdate!: (value: unknown) => void;
    api.updateThread.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    const pending = useThreadList
      .getState()
      .setToolApprovalMode('a', 'always_trust');

    // 乐观更新：请求还没回来，界面已经显示新选择
    expect(
      useThreadList.getState().threads[0]?.metadata?.tool_approval_mode,
    ).toBe('always_trust');

    // 后端返回另一个值时以它为准，而不是保留本地的猜测
    resolveUpdate(thread('a', { metadata: { tool_approval_mode: 'default' } }));

    await expect(pending).resolves.toBe(true);
    expect(api.updateThread).toHaveBeenCalledWith('a', {
      toolApprovalMode: 'always_trust',
    });
    expect(
      useThreadList.getState().threads[0]?.metadata?.tool_approval_mode,
    ).toBe('default');
  });

  it('设置失败时回滚线程 metadata 并留下可展示原因', async () => {
    useThreadList.setState({
      threads: [thread('a', { metadata: { tool_approval_mode: 'default' } })],
    });
    api.updateThread.mockRejectedValue(new Error('审批模式保存失败'));

    const ok = await useThreadList
      .getState()
      .setToolApprovalMode('a', 'always_trust');

    expect(ok).toBe(false);
    expect(
      useThreadList.getState().threads[0]?.metadata?.tool_approval_mode,
    ).toBe('default');
    expect(useThreadList.getState().error).toBe('审批模式保存失败');
  });

  it('线程不在首屏列表里时仍然持久化，只是不改本地列表', async () => {
    api.updateThread.mockResolvedValue(
      thread('missing', { metadata: { tool_approval_mode: 'always_trust' } }),
    );

    const ok = await useThreadList
      .getState()
      .setToolApprovalMode('missing', 'always_trust');

    expect(ok).toBe(true);
    expect(api.updateThread).toHaveBeenCalledWith('missing', {
      toolApprovalMode: 'always_trust',
    });
    expect(useThreadList.getState().threads).toEqual([]);
  });

  it('迟到的成功不覆盖用户之后写下的选择', async () => {
    useThreadList.setState({ threads: [thread('a')] });
    let resolveFirst!: (value: unknown) => void;
    api.updateThread
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce(
        thread('a', { metadata: { tool_approval_mode: 'default' } }),
      );

    const first = useThreadList
      .getState()
      .setToolApprovalMode('a', 'always_trust');
    await useThreadList.getState().setToolApprovalMode('a', 'default');

    resolveFirst(
      thread('a', { metadata: { tool_approval_mode: 'always_trust' } }),
    );
    await expect(first).resolves.toBe(true);

    expect(
      useThreadList.getState().threads[0]?.metadata?.tool_approval_mode,
    ).toBe('default');
  });

  it('迟到的失败只回滚它自己写下的值，不抹掉之后的选择', async () => {
    useThreadList.setState({ threads: [thread('a')] });
    let rejectFirst!: (error: Error) => void;
    api.updateThread
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        }),
      )
      .mockResolvedValueOnce(
        thread('a', { metadata: { tool_approval_mode: 'default' } }),
      );

    const first = useThreadList
      .getState()
      .setToolApprovalMode('a', 'always_trust');
    // 用户在第一次请求还没回来时又选了 default，并且这次保存成功
    await useThreadList.getState().setToolApprovalMode('a', 'default');
    expect(
      useThreadList.getState().threads[0]?.metadata?.tool_approval_mode,
    ).toBe('default');

    rejectFirst(new Error('保存失败'));
    await expect(first).resolves.toBe(false);

    // 第一次选择的回滚不能把用户后来的选择擦掉
    expect(
      useThreadList.getState().threads[0]?.metadata?.tool_approval_mode,
    ).toBe('default');
  });

  it('标记已读只收敛状态字段，不用旧响应覆盖标题与置顶', async () => {
    useThreadList.setState({
      threads: [thread('a', { title: '本地新标题', is_pinned: true })],
    });
    api.markViewed.mockResolvedValue(
      thread('a', {
        title: '服务端旧标题',
        is_pinned: false,
        thread_status: 'done',
      }),
    );

    await expect(useThreadList.getState().markViewed('a')).resolves.toBe(true);

    expect(useThreadList.getState().threads[0]).toMatchObject({
      title: '本地新标题',
      is_pinned: true,
      thread_status: 'done',
    });
  });

  it('标记已读失败时保留列表并返回 false', async () => {
    useThreadList.setState({
      threads: [thread('a', { thread_status: 'ready' })],
    });
    api.markViewed.mockRejectedValue(new Error('500'));

    await expect(useThreadList.getState().markViewed('a')).resolves.toBe(false);

    expect(useThreadList.getState().threads[0]?.thread_status).toBe('ready');
  });

  it('同步线程状态只合并 thread_status', async () => {
    useThreadList.setState({
      agentSlug: 'default-chatbot',
      threads: [
        thread('a', { title: '本地标题', thread_status: 'loading' }),
        thread('b', { thread_status: 'done' }),
      ],
    });
    api.listThreads.mockResolvedValue([
      thread('a', { title: '服务端标题', thread_status: 'ready' }),
    ]);

    await useThreadList.getState().syncStatuses();

    expect(useThreadList.getState().threads[0]).toMatchObject({
      title: '本地标题',
      thread_status: 'ready',
    });
    // 响应里没有的线程保持原状态，不被清空
    expect(useThreadList.getState().threads[1]?.thread_status).toBe('done');
  });

  it('还没解析出智能体时不同步状态', async () => {
    useThreadList.setState({ agentSlug: null, threads: [thread('a')] });

    await useThreadList.getState().syncStatuses();

    expect(api.listThreads).not.toHaveBeenCalled();
  });

  it('同步状态失败是静默的：列表保留旧状态', async () => {
    useThreadList.setState({
      agentSlug: 'default-chatbot',
      threads: [thread('a', { thread_status: 'loading' })],
    });
    api.listThreads.mockRejectedValue(new Error('boom'));

    await expect(
      useThreadList.getState().syncStatuses(),
    ).resolves.toBeUndefined();

    expect(useThreadList.getState().threads[0]?.thread_status).toBe('loading');
  });
});

describe('setModelSpec', () => {
  it('就地记进会话 metadata，保留其它字段', () => {
    useThreadList.setState({
      threads: [
        { id: 'a', agent_id: 'x', metadata: { keep: 1 } },
        { id: 'b', agent_id: 'x' },
      ] as never,
    });

    useThreadList.getState().setModelSpec('a', 'p:m');

    const threads = useThreadList.getState().threads;
    expect(threads[0]?.metadata).toEqual({ keep: 1, model_spec: 'p:m' });
    // 其它会话不动
    expect(threads[1]?.metadata).toBeUndefined();
  });

  it('列表里没有该会话时是空操作', () => {
    useThreadList.setState({ threads: [{ id: 'a', agent_id: 'x' }] as never });

    useThreadList.getState().setModelSpec('missing', 'p:m');

    expect(useThreadList.getState().threads[0]?.metadata).toBeUndefined();
  });
});
