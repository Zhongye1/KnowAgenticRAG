import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMock = vi.fn();
const steerMock = vi.fn();
const cancelMock = vi.fn();
const continueMock = vi.fn();
const createThreadMock = vi.fn();

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  listThreadRequestsApiAgentThreadThreadIdRequestsGet: (...args: unknown[]) =>
    listMock(...args),
  steerRequestApiAgentRequestsRequestIdSteerPost: (...args: unknown[]) =>
    steerMock(...args),
  cancelRequestApiAgentRequestsRequestIdCancelPost: (...args: unknown[]) =>
    cancelMock(...args),
  continueThreadRequestsApiAgentThreadThreadIdRequestsContinuePost: (
    ...args: unknown[]
  ) => continueMock(...args),
  createThreadApiChatThreadPost: (...args: unknown[]) => createThreadMock(...args),
}));

const { agentRunApi, chatThreadApi } = await import(
  '@/features/chat/api/agent-api'
);
const { ApiError } = await import('@/shared/api/base');

const queuePayload = {
  requests: [
    {
      request_id: 'req-2',
      status: 'queued',
      source: 'chat',
      content: '第二条问题',
      queue_policy: 'enqueue',
      queue_position: 1,
      created_at: '2026-10-01T17:11:22.760588Z',
    },
  ],
  queue: {
    status: 'running',
    paused_reason: null,
    blocking_run_id: null,
    can_continue: false,
  },
};

/**
 * 生成物失败分支：`error` 是整段响应体（非 2xx 时客户端 `JSON.parse(body)`），
 * 因此结构化 detail 外面还包着一层 `detail`。network 分支没有 response。
 */
const failure = (body: unknown, status: number) => ({
  data: undefined,
  error: body,
  response: new Response(null, { status }),
});

const networkFailure = (cause: unknown) => ({
  data: undefined,
  error: cause,
  response: undefined,
});

describe('agentRunApi 队列接口', () => {
  beforeEach(() => {
    listMock.mockReset();
    steerMock.mockReset();
    cancelMock.mockReset();
    continueMock.mockReset();
    createThreadMock.mockReset();
  });

  it('listThreadRequests 把 agent_slug 放进 query 并解出队列快照', async () => {
    listMock.mockResolvedValue({ data: queuePayload, error: undefined });

    await expect(
      agentRunApi.listThreadRequests('t-1', 'default-chatbot'),
    ).resolves.toEqual(queuePayload);
    expect(listMock).toHaveBeenCalledWith({
      path: { thread_id: 't-1' },
      query: { agent_slug: 'default-chatbot' },
    });
  });

  it('steer 与 cancel 只带路径参数，不带请求体', async () => {
    steerMock.mockResolvedValue({ data: { status: 'queued' }, error: undefined });
    cancelMock.mockResolvedValue({ data: { status: 'cancelled' }, error: undefined });

    await agentRunApi.steerRequest('req-2');
    await agentRunApi.cancelRequest('req-2');

    expect(steerMock).toHaveBeenCalledWith({ path: { request_id: 'req-2' } });
    expect(cancelMock).toHaveBeenCalledWith({ path: { request_id: 'req-2' } });
  });

  it('continue 必须带 agent_slug，否则后端 422', async () => {
    continueMock.mockResolvedValue({
      data: { status: 'dispatched', request_id: 'req-2' },
      error: undefined,
    });

    await agentRunApi.continueThreadQueue('t-1', 'default-chatbot');

    expect(continueMock).toHaveBeenCalledWith({
      path: { thread_id: 't-1' },
      query: { agent_slug: 'default-chatbot' },
    });
  });

  // 以下两个响应体取自本机后端真实返回（curl 实测），不是构造的字段组合：
  //   {"detail":{"code":"steer_in_progress","message":"引导已等待当前运行结束，暂时不能取消"}}
  //   {"detail":{"code":"request_already_dispatched","message":"请求已派发，请通过 run 取消接口取消正在进行的运行","run_id":"…"}}
  it('后端 409 的业务 message 成为错误文案，而不是通用「请求失败」', async () => {
    cancelMock.mockResolvedValue(
      failure(
        {
          detail: {
            code: 'steer_in_progress',
            message: '引导已等待当前运行结束，暂时不能取消',
          },
        },
        409,
      ),
    );

    await expect(agentRunApi.cancelRequest('req-1')).rejects.toThrow(
      '引导已等待当前运行结束，暂时不能取消',
    );
  });

  it('run 取消接口对应的 409 业务码同样透出', async () => {
    cancelMock.mockResolvedValue(
      failure(
        {
          detail: {
            code: 'request_already_dispatched',
            message: '请求已派发，请通过 run 取消接口取消正在进行的运行',
            run_id: 'run-1',
          },
        },
        409,
      ),
    );

    await expect(agentRunApi.cancelRequest('req-1')).rejects.toThrow(
      '请求已派发，请通过 run 取消接口取消正在进行的运行',
    );
  });

  it('失败时抛出 ApiError，detail 是后端 detail 本体而非外层响应体', async () => {
    const detail = { code: 'request_already_dispatched', run_id: 'run-1' };
    cancelMock.mockResolvedValue(failure({ detail }, 409));

    let caught: unknown;
    try {
      await agentRunApi.cancelRequest('req-1');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as InstanceType<typeof ApiError>).status).toBe(409);
    expect((caught as InstanceType<typeof ApiError>).detail).toEqual(detail);
  });

  it('网络失败没有响应体时状态码退化为 0，且不把浏览器英文文案当提示', async () => {
    cancelMock.mockResolvedValue(networkFailure(new TypeError('Failed to fetch')));

    let caught: unknown;
    try {
      await agentRunApi.cancelRequest('req-1');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as InstanceType<typeof ApiError>).status).toBe(0);
    expect((caught as Error).message).toBe('请求失败（HTTP 0）');
  });

  it('请求事件流走对端点，并把 abort signal 透传给 fetch', async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await agentRunApi.streamRequestEvents('req-1', {
      signal: controller.signal,
    });

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/api/agent/requests/req-1/events');
    expect(init.signal).toBe(controller.signal);
    vi.unstubAllGlobals();
  });

  it('建线程把 agentSlug 映射成后端字段 agent_id，并透传幂等 request_id', async () => {
    createThreadMock.mockResolvedValue({
      data: { id: 'thread-1', agent_id: 'default-chatbot' },
      error: undefined,
    });

    await expect(
      chatThreadApi.createThread({
        agentSlug: 'default-chatbot',
        requestId: 'web-1',
      }),
    ).resolves.toEqual({ id: 'thread-1', agent_id: 'default-chatbot' });
    expect(createThreadMock).toHaveBeenCalledWith({
      body: {
        agent_id: 'default-chatbot',
        title: '新的对话',
        metadata: {},
        request_id: 'web-1',
      },
    });
  });

  it('不传 request_id 时不发送该字段，后端自行生成', async () => {
    createThreadMock.mockResolvedValue({
      data: { id: 'thread-2', agent_id: 'default-chatbot' },
      error: undefined,
    });

    await chatThreadApi.createThread({
      agentSlug: 'default-chatbot',
      metadata: { tool_approval_mode: 'always_trust' },
    });

    expect(createThreadMock).toHaveBeenCalledWith({
      body: {
        agent_id: 'default-chatbot',
        title: '新的对话',
        metadata: { tool_approval_mode: 'always_trust' },
      },
    });
  });
});
