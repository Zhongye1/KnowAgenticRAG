import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { api, threadApi, runStreamMock, captured } = vi.hoisted(() => ({
  captured: { options: undefined as Record<string, unknown> | undefined },
  api: {
    listThreadRequests: vi.fn(),
    steerRequest: vi.fn(),
    cancelRequest: vi.fn(),
    continueThreadQueue: vi.fn(),
    createRun: vi.fn(),
    getAgentHistory: vi.fn(),
    streamRequestEvents: vi.fn(),
  },
  threadApi: { createThread: vi.fn(), getAgentState: vi.fn() },
  runStreamMock: {
    startRunStream: vi.fn(),
    stopRunStreamSubscription: vi.fn(),
    resumeActiveRunForThread: vi.fn(),
  },
}));

vi.mock('@/features/chat/api/agent-api', () => ({
  agentRunApi: api,
  chatThreadApi: threadApi,
}));
vi.mock('@/features/chat/model/run-stream', () => ({
  createRunStream: (options: Record<string, unknown>) => {
    captured.options = options;
    return runStreamMock;
  },
}));

const { createChatRuntime } = await import('@/features/chat/model/chat-runtime');
const { getThreadRuntime, disposeThreadRuntime } = await import(
  '@/features/chat/model/thread-runtime-store'
);

const THREAD = 'thread-queue';
const SLUG = 'default-chatbot';

type QueuePayload = {
  requests: Array<Record<string, unknown>>;
  queue: {
    status: string;
    paused_reason: string | null;
    blocking_run_id: string | null;
    can_continue: boolean;
  };
};

const snapshot = (content: string): QueuePayload => ({
  requests: [{ request_id: 'req-2', status: 'queued', content, queue_position: 1 }],
  queue: {
    status: 'running',
    paused_reason: null,
    blocking_run_id: null,
    can_continue: false,
  },
});

/** 真实分帧的 SSE 响应体，交给 `processRunSseResponse` 解析。 */
const sseResponse = (frames: string) =>
  new Response(frames, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });

/** 造一个可手动结算的 promise，用于验证乱序响应。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** 公开面只有队列同步会建立订阅，测试统一走这条路径。 */
const subscribeThroughQueue = async (
  runtime: { refreshQueue: (threadId: string, agentSlug: string) => Promise<void> },
  content = '第二条问题',
) => {
  api.listThreadRequests.mockResolvedValue(snapshot(content));
  await runtime.refreshQueue(THREAD, SLUG);
};

const createRuntime = (onNotice = vi.fn()) =>
  createChatRuntime({
    currentAgentId: () => SLUG,
    fetchAgentState: () => undefined,
    onNotice,
  });

describe('队列运行时', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    threadApi.createThread.mockReset();
    api.getAgentHistory.mockResolvedValue({ history: [] });
    // 每次调用都要新造一个响应体：ReadableStream 只能被读一次
    api.streamRequestEvents.mockImplementation(() => Promise.resolve(sseResponse('')));
    runStreamMock.startRunStream.mockReset();
    disposeThreadRuntime(THREAD);
    // 失败路径按设计会 console.warn，这里只关心用户可见提示
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('refreshQueue 把排队请求与队列快照写进线程状态', async () => {
    api.listThreadRequests.mockResolvedValue(snapshot('第二条问题'));

    await createRuntime().refreshQueue(THREAD, SLUG);

    const runtime = getThreadRuntime(THREAD);
    expect(runtime.queuedRequests).toHaveLength(1);
    expect(runtime.queueSnapshot.status).toBe('running');
    expect(api.listThreadRequests).toHaveBeenCalledWith(THREAD, SLUG);
  });

  it('缺少 agent slug 时不发请求，避免后端 422', async () => {
    await createRuntime().refreshQueue(THREAD, '');

    expect(api.listThreadRequests).not.toHaveBeenCalled();
  });

  it('refreshQueue 失败时给出可见提示，并保留上一次成功的快照', async () => {
    api.listThreadRequests.mockResolvedValue(snapshot('上一次成功'));
    const onNotice = vi.fn();
    const runtime = createRuntime(onNotice);
    await runtime.refreshQueue(THREAD, SLUG);

    api.listThreadRequests.mockRejectedValue(new Error('boom'));
    await runtime.refreshQueue(THREAD, SLUG);

    expect(onNotice).toHaveBeenCalledWith({
      level: 'warning',
      message: '同步队列状态失败，队列显示可能不是最新。',
    });
    expect(getThreadRuntime(THREAD).queuedRequests[0]?.content).toBe(
      '上一次成功',
    );
  });

  it('先发后到的旧快照被丢弃，不会覆盖新状态', async () => {
    const first = deferred<ReturnType<typeof snapshot>>();
    const second = deferred<ReturnType<typeof snapshot>>();
    api.listThreadRequests
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const runtime = createRuntime();

    const stale = runtime.refreshQueue(THREAD, SLUG);
    const fresh = runtime.refreshQueue(THREAD, SLUG);
    second.resolve(snapshot('新'));
    await fresh;
    first.resolve(snapshot('旧'));
    await stale;

    expect(getThreadRuntime(THREAD).queuedRequests[0]?.content).toBe('新');
  });

  it('steer 之后再同步一次队列，让位次与策略立即反映出来', async () => {
    api.steerRequest.mockResolvedValue({});
    api.listThreadRequests.mockResolvedValue(snapshot('第二条问题'));

    await createRuntime().steer({ threadId: THREAD, agentSlug: SLUG, requestId: 'req-2' });

    expect(api.steerRequest).toHaveBeenCalledWith('req-2');
    expect(api.listThreadRequests).toHaveBeenCalledTimes(1);
    // 先提交 steer，再拉队列；顺序反了会把提升前的位次写进界面
    expect(api.steerRequest.mock.invocationCallOrder[0]).toBeLessThan(
      api.listThreadRequests.mock.invocationCallOrder[0]!,
    );
  });

  it('恢复中断后，在途的 state 读取不会把审批再弹回来', async () => {
    let resolveState!: (value: unknown) => void;
    threadApi.getAgentState.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      }),
    );
    const { fetchAgentState } = await import(
      '@/features/chat/model/agent-state'
    );
    const { getThreadRuntime } = await import(
      '@/features/chat/model/thread-runtime-store'
    );
    const runtime = getThreadRuntime(THREAD);
    const pending = fetchAgentState(THREAD);

    api.createRun.mockResolvedValue({
      request_id: 'req-resume',
      status: 'queued',
      thread_id: THREAD,
    });
    const chat = createRuntime();
    await chat.submitInterrupt({
      threadId: THREAD,
      agentSlug: SLUG,
      resume: { type: 'approve' },
      interruptedRunId: 'run-1',
    });

    resolveState({
      agent_state: {},
      interrupt: {
        status: 'human_approval_required',
        thread_id: THREAD,
        run_id: 'run-1',
        approval: {
          action_requests: [{ name: 'execute', args: {} }],
          review_configs: [{}],
        },
      },
    });
    await pending;

    // 用户已经批准过：这次响应是过期的，不能把审批面板弹回来
    expect(runtime.pendingInterrupt).toBeNull();
  });

  it('run 收尾与中断都会触发一次队列同步', async () => {
    api.listThreadRequests.mockResolvedValue(snapshot('队头已派发'));
    createRuntime();

    const onTerminalDetected = captured.options?.onTerminalDetected as (info: {
      threadId: string;
    }) => void;
    onTerminalDetected({ threadId: THREAD });
    await vi.waitFor(() =>
      expect(api.listThreadRequests).toHaveBeenCalledWith(THREAD, SLUG),
    );

    api.listThreadRequests.mockClear();
    const onInterruptDetected = captured.options?.onInterruptDetected as (info: {
      threadId: string;
    }) => void;
    onInterruptDetected({ threadId: THREAD });
    await vi.waitFor(() =>
      expect(api.listThreadRequests).toHaveBeenCalledWith(THREAD, SLUG),
    );
  });

  it('cancelQueued 成功后同步队列；后端拒绝时抛出且不刷新', async () => {
    api.listThreadRequests.mockResolvedValue({ requests: [], queue: null });
    const runtime = createRuntime();
    api.cancelRequest.mockResolvedValue({});
    await runtime.cancelQueued({ threadId: THREAD, agentSlug: SLUG, requestId: 'req-2' });
    expect(api.listThreadRequests).toHaveBeenCalledTimes(1);

    api.cancelRequest.mockRejectedValue(new Error('请求已派发'));
    api.listThreadRequests.mockClear();

    await expect(
      runtime.cancelQueued({ threadId: THREAD, agentSlug: SLUG, requestId: 'req-1' }),
    ).rejects.toThrow('请求已派发');
    expect(api.listThreadRequests).not.toHaveBeenCalled();
  });

  it('排队事件的位次变化写回队列条目', async () => {
    api.listThreadRequests.mockResolvedValue(snapshot('第二条问题'));
    api.streamRequestEvents.mockImplementation(() =>
      Promise.resolve(
        sseResponse(
          'event: queued\ndata: {"request_id":"req-2","status":"queued","position":3}\n\n',
        ),
      ),
    );
    const runtime = createRuntime();
    await subscribeThroughQueue(runtime);

    await vi.waitFor(() =>
      expect(getThreadRuntime(THREAD).queuedRequests[0]?.queue_position).toBe(3),
    );
    expect(api.streamRequestEvents).toHaveBeenCalledWith('req-2', {
      signal: expect.anything(),
    });
  });

  it('请求被派发成 run 时移出队列并订阅该 run', async () => {
    api.listThreadRequests.mockResolvedValue(snapshot('第二条问题'));
    api.streamRequestEvents.mockImplementation(() =>
      Promise.resolve(
        sseResponse(
          'event: run_created\ndata: {"request_id":"req-2","run_id":"run-9"}\n\n',
        ),
      ),
    );
    const runtime = createRuntime();
    await subscribeThroughQueue(runtime);

    await vi.waitFor(() =>
      expect(getThreadRuntime(THREAD).queuedRequests).toHaveLength(0),
    );
    const thread = getThreadRuntime(THREAD);
    expect(thread.pendingRequestId).toBe('req-2');
    expect(thread.requestStreams['req-2']).toBeUndefined();
    expect(runStreamMock.startRunStream).toHaveBeenCalledWith(
      THREAD,
      'run-9',
      '0-0',
    );
  });

  it('请求失败时收尾、提示并回读历史', async () => {
    api.listThreadRequests.mockResolvedValue(snapshot('第二条问题'));
    api.streamRequestEvents.mockImplementation(() =>
      Promise.resolve(
        sseResponse(
          'event: failed\ndata: {"request_id":"req-2","status":"failed"}\n\n',
        ),
      ),
    );
    const onNotice = vi.fn();
    const runtime = createRuntime(onNotice);
    // 先置上加载态：订阅一旦建立，事件可能在同一轮微任务里就处理完
    getThreadRuntime(THREAD).replyLoadingVisible = true;
    await subscribeThroughQueue(runtime);

    await vi.waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith({
        level: 'error',
        message: '排队请求执行失败。',
      }),
    );

    const thread = getThreadRuntime(THREAD);
    expect(thread.queuedRequests).toHaveLength(0);
    expect(thread.pendingRequestId).toBeNull();
    expect(thread.replyLoadingVisible).toBe(false);
    expect(api.getAgentHistory).toHaveBeenCalled();
  });

  it('同步队列后为每条排队请求建立订阅', async () => {
    api.listThreadRequests.mockResolvedValue({
      requests: [
        { request_id: 'req-1', status: 'queued', content: '一' },
        { request_id: 'req-2', status: 'queued', content: '二' },
      ],
      queue: snapshot('').queue,
    });
    await createRuntime().refreshQueue(THREAD, SLUG);

    expect(api.streamRequestEvents.mock.calls.map((call) => call[0])).toEqual([
      'req-1',
      'req-2',
    ]);
  });

  it('取消排队请求会中止它的订阅', async () => {
    api.listThreadRequests.mockResolvedValue(snapshot('第二条问题'));
    let aborted = false;
    api.streamRequestEvents.mockImplementation(
      (_id: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const runtime = createRuntime();
    await subscribeThroughQueue(runtime);

    api.cancelRequest.mockResolvedValue({});
    // 取消成功后后端不再把该请求算作排队，同步结果里没有它
    api.listThreadRequests.mockResolvedValue({
      requests: [],
      queue: snapshot('').queue,
    });
    await runtime.cancelQueued({
      threadId: THREAD,
      agentSlug: SLUG,
      requestId: 'req-2',
    });

    expect(aborted).toBe(true);
    expect(getThreadRuntime(THREAD).requestStreams['req-2']).toBeUndefined();
  });

  it('发送时先插入本地用户消息，并把请求 id 交给后端复用', async () => {
    api.createRun.mockResolvedValue({
      request_id: 'req-9',
      status: 'dispatched',
      run_id: 'run-9',
      thread_id: THREAD,
    });
    const runtime = createRuntime();

    const sending = runtime.sendMessage({
      threadId: THREAD,
      agentSlug: SLUG,
      query: '你好',
    });
    // 占位消息在请求返回前就已经能渲染
    const seeded = Object.values(getThreadRuntime(THREAD).onGoingConv.msgChunks);
    expect(seeded.flat()).toContainEqual(
      expect.objectContaining({ type: 'human', content: '你好' }),
    );

    await sending;

    const requestId = api.createRun.mock.calls[0][0].meta.request_id;
    expect(typeof requestId).toBe('string');
    expect(api.createRun.mock.calls[0][0].meta).toMatchObject({
      request_id: requestId,
    });
  });

  it('带图发送时本地占位就带上图片，用户不必等历史刷新才看到', async () => {
    api.createRun.mockResolvedValue({
      request_id: 'req-img',
      status: 'dispatched',
      run_id: 'run-img',
      thread_id: THREAD,
    });
    const runtime = createRuntime();

    await runtime.sendMessage({
      threadId: THREAD,
      agentSlug: SLUG,
      query: '',
      imageContent: 'iVBORw0KGgoAAA',
    });

    const seeded = Object.values(getThreadRuntime(THREAD).onGoingConv.msgChunks).flat();
    expect(seeded).toContainEqual(
      expect.objectContaining({
        type: 'human',
        image_content: 'iVBORw0KGgoAAA',
      }),
    );
    // 图片必须真的发给后端，不能只留在界面上
    expect(api.createRun).toHaveBeenCalledWith(
      expect.objectContaining({ image_content: 'iVBORw0KGgoAAA' }),
    );
  });

  it('发送失败时撤掉本地用户消息，不留孤儿', async () => {
    api.createRun.mockRejectedValue(new Error('对话线程不存在'));
    const runtime = createRuntime();

    await expect(
      runtime.sendMessage({ threadId: THREAD, agentSlug: SLUG, query: '你好' }),
    ).rejects.toThrow('对话线程不存在');

    expect(getThreadRuntime(THREAD).onGoingConv.msgChunks).toEqual({});
    expect(getThreadRuntime(THREAD).replyLoadingVisible).toBe(false);
  });

  it('发送被排队时不订阅 run，也不留着加载态', async () => {
    api.createRun.mockResolvedValue({
      request_id: 'req-9',
      status: 'queued',
      run_id: null,
      queue_policy: 'enqueue',
      queue_position: 1,
      thread_id: THREAD,
    });
    // 后端刚把它收进队列，同步队列时会看到这一条
    api.listThreadRequests.mockResolvedValue({
      requests: [
        {
          request_id: 'req-9',
          status: 'queued',
          content: '排队',
          queue_position: 1,
        },
      ],
      queue: snapshot('').queue,
    });
    const runtime = createRuntime();

    await runtime.sendMessage({ threadId: THREAD, agentSlug: SLUG, query: '排队' });

    const thread = getThreadRuntime(THREAD);
    expect(runStreamMock.startRunStream).not.toHaveBeenCalled();
    expect(thread.replyLoadingVisible).toBe(false);
    expect(thread.queuedRequests.map((item) => item.request_id)).toEqual([
      'req-9',
    ]);
    expect(api.streamRequestEvents).toHaveBeenCalledWith('req-9', {
      signal: expect.anything(),
    });
  });

  it('订阅仍在进行时重复同步，不会为同一条请求再开一条流', async () => {
    // 流一直挂着不结束，模拟队列长时间不动
    api.streamRequestEvents.mockImplementation(() => new Promise(() => undefined));
    const runtime = createRuntime();
    await subscribeThroughQueue(runtime);
    await vi.waitFor(() =>
      expect(api.streamRequestEvents).toHaveBeenCalledTimes(1),
    );

    await runtime.refreshQueue(THREAD, SLUG);
    await runtime.refreshQueue(THREAD, SLUG);

    expect(api.streamRequestEvents).toHaveBeenCalledTimes(1);
  });

  it('停止订阅只影响该线程，别的线程仍在订阅', async () => {
    const aborted = new Map<string, boolean>();
    api.listThreadRequests.mockImplementation((threadId: string) =>
      Promise.resolve({
        requests: [{ request_id: `req-${threadId}`, status: 'queued' }],
        queue: snapshot('').queue,
      }),
    );
    api.streamRequestEvents.mockImplementation(
      (requestId: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          aborted.set(requestId, false);
          options.signal.addEventListener('abort', () => {
            aborted.set(requestId, true);
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const runtime = createRuntime();
    await runtime.refreshQueue('thread-A', SLUG);
    await runtime.refreshQueue('thread-B', SLUG);
    await vi.waitFor(() =>
      expect(aborted.size).toBe(2),
    );

    runtime.stopRequestStreams('thread-A');

    expect(aborted.get('req-thread-A')).toBe(true);
    expect(aborted.get('req-thread-B')).toBe(false);
    expect(getThreadRuntime('thread-B').requestStreams).toHaveProperty(
      'req-thread-B',
    );
  });

  it('同步在途时停止订阅：旧快照被丢弃，也不会为已离开的线程建订阅', async () => {
    const pending = deferred<QueuePayload>();
    api.listThreadRequests.mockReturnValue(pending.promise);
    const runtime = createRuntime();

    const inFlight = runtime.refreshQueue(THREAD, SLUG);
    runtime.stopRequestStreams(THREAD);
    pending.resolve(snapshot('离开前发出的快照'));
    await inFlight;

    expect(getThreadRuntime(THREAD).queuedRequests).toEqual([]);
    expect(api.streamRequestEvents).not.toHaveBeenCalled();
  });

  it('短命事件流没有终态就结束时只同步一次，不重新订阅', async () => {
    api.streamRequestEvents.mockImplementation(() =>
      Promise.resolve(
        sseResponse(
          'event: queued\ndata: {"request_id":"req-2","status":"queued","position":2}\n\n',
        ),
      ),
    );
    const runtime = createRuntime();
    await subscribeThroughQueue(runtime);

    await vi.waitFor(() =>
      expect(api.listThreadRequests.mock.calls.length).toBeGreaterThan(1),
    );
    // 立刻结束的流只做一次同步：重订阅会与「静默结束」互相触发成热循环
    expect(api.streamRequestEvents).toHaveBeenCalledTimes(1);
    expect(getThreadRuntime(THREAD).queuedRequests).toHaveLength(1);
  });

  it('长命事件流静默结束时重新同步并重新订阅', async () => {
    vi.useFakeTimers();
    try {
      const end = deferred<Response>();
      api.streamRequestEvents.mockImplementation(() => end.promise);
      const runtime = createRuntime();
      await subscribeThroughQueue(runtime);
      await vi.waitFor(() =>
        expect(api.streamRequestEvents).toHaveBeenCalledTimes(1),
      );

      vi.setSystemTime(Date.now() + 61_000);
      end.resolve(
        sseResponse(
          'event: queued\ndata: {"request_id":"req-2","status":"queued","position":2}\n\n',
        ),
      );

      await vi.waitFor(() =>
        expect(api.streamRequestEvents).toHaveBeenCalledTimes(2),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('error 帧按终态收尾并提示', async () => {
    api.streamRequestEvents.mockImplementation(() =>
      Promise.resolve(
        sseResponse(
          'event: error\ndata: {"request_id":"req-2","message":"请求不存在"}\n\n',
        ),
      ),
    );
    const onNotice = vi.fn();
    const runtime = createRuntime(onNotice);
    await subscribeThroughQueue(runtime);

    await vi.waitFor(() =>
      expect(onNotice).toHaveBeenCalledWith({
        level: 'error',
        message: '排队请求的事件流报告了错误。',
      }),
    );
    expect(getThreadRuntime(THREAD).queuedRequests).toHaveLength(0);
  });

  it('别的 run 在跑时，排队请求的终态不清掉它的收尾状态', async () => {
    api.streamRequestEvents.mockImplementation(() =>
      Promise.resolve(
        sseResponse(
          'event: failed\ndata: {"request_id":"req-2","status":"failed"}\n\n',
        ),
      ),
    );
    const runtime = createRuntime();
    const thread = getThreadRuntime(THREAD);
    // 另一个 run 仍在流式输出
    thread.activeRunId = 'run-别的';
    thread.isStreaming = true;
    thread.pendingRequestId = 'req-别的';
    await subscribeThroughQueue(runtime);

    await vi.waitFor(() => expect(thread.queuedRequests).toHaveLength(0));

    expect(thread.activeRunId).toBe('run-别的');
    expect(thread.isStreaming).toBe(true);
    expect(thread.pendingRequestId).toBe('req-别的');
  });

  it('stopRequestStreams 中止该线程的全部订阅', async () => {
    const signals: AbortSignal[] = [];
    api.streamRequestEvents.mockImplementation(
      (_id: string, options: { signal: AbortSignal }) => {
        signals.push(options.signal);
        return new Promise(() => undefined);
      },
    );
    const runtime = createRuntime();
    await subscribeThroughQueue(runtime);

    // 订阅会一直挂着等事件，这里只让控制器登记完成
    await vi.waitFor(() =>
      expect(Object.keys(getThreadRuntime(THREAD).requestStreams)).toEqual([
        'req-2',
      ]),
    );

    runtime.stopRequestStreams(THREAD);

    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(getThreadRuntime(THREAD).requestStreams).toEqual({});
  });

  it('continueQueue 进行中重复点击只提交一次，结束后复位', async () => {
    const pending = deferred<unknown>();
    api.continueThreadQueue.mockReturnValue(pending.promise);
    api.listThreadRequests.mockResolvedValue({ requests: [], queue: null });
    const runtime = createRuntime();

    const first = runtime.continueQueue(THREAD, SLUG);
    const second = runtime.continueQueue(THREAD, SLUG);
    expect(getThreadRuntime(THREAD).continueQueueInFlight).toBe(true);
    pending.resolve({});
    await Promise.all([first, second]);

    expect(api.continueThreadQueue).toHaveBeenCalledTimes(1);
    expect(getThreadRuntime(THREAD).continueQueueInFlight).toBe(false);
  });

  it('createThread 并发只建一条', async () => {
    const pending = deferred<{ id: string }>();
    threadApi.createThread.mockReturnValue(pending.promise);
    const runtime = createRuntime();

    const first = runtime.createThread(SLUG);
    const second = runtime.createThread(SLUG);
    pending.resolve({ id: 'thread-新' });

    await expect(first).resolves.toMatchObject({ id: 'thread-新' });
    await expect(second).resolves.toMatchObject({ id: 'thread-新' });
    expect(threadApi.createThread).toHaveBeenCalledTimes(1);
  });

  it('失败重试沿用同一个 request_id，成功后下一次创建才换新', async () => {
    threadApi.createThread.mockRejectedValueOnce(new Error('创建对话失败'));
    const runtime = createRuntime();

    await expect(runtime.createThread(SLUG)).rejects.toThrow('创建对话失败');

    threadApi.createThread.mockResolvedValueOnce({ id: 'thread-新' });
    await expect(runtime.createThread(SLUG)).resolves.toMatchObject({
      id: 'thread-新',
    });

    threadApi.createThread.mockResolvedValueOnce({ id: 'thread-新2' });
    await expect(runtime.createThread(SLUG)).resolves.toMatchObject({
      id: 'thread-新2',
    });

    const [failed, retried, next] = threadApi.createThread.mock.calls;
    // 重试必须复用幂等键，否则响应丢失时后端会留下两条空线程
    expect(retried[0].requestId).toBe(failed[0].requestId);
    expect(next[0].requestId).not.toBe(failed[0].requestId);
    expect(next[0]).toMatchObject({ agentSlug: SLUG });
  });

  it('换智能体后不使用上一条失败创建的幂等键', async () => {
    threadApi.createThread.mockRejectedValueOnce(new Error('创建对话失败'));
    const runtime = createRuntime();
    await expect(runtime.createThread(SLUG)).rejects.toThrow('创建对话失败');

    threadApi.createThread.mockResolvedValueOnce({ id: 'thread-新' });
    await runtime.createThread('another-agent');

    const [failed, otherAgent] = threadApi.createThread.mock.calls;
    expect(otherAgent[0].agentSlug).toBe('another-agent');
    expect(otherAgent[0].requestId).not.toBe(failed[0].requestId);
  });

  it('未设置审批模式偏好时 metadata 为空对象', async () => {
    threadApi.createThread.mockResolvedValue({ id: 'thread-新' });

    await createRuntime().createThread(SLUG);

    expect(threadApi.createThread.mock.calls[0][0].metadata).toEqual({});
  });

  it('continueQueue 失败后也必须复位进行中标记，否则按钮永久禁用', async () => {
    api.continueThreadQueue.mockRejectedValue(new Error('run_active'));
    const runtime = createRuntime();

    await expect(runtime.continueQueue(THREAD, SLUG)).rejects.toThrow('run_active');

    expect(getThreadRuntime(THREAD).continueQueueInFlight).toBe(false);
  });
});
