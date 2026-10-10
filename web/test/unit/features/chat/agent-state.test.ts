import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({ api: { getAgentState: vi.fn() } }));

vi.mock('@/features/chat/api/agent-api', () => ({
  chatThreadApi: { getAgentState: api.getAgentState },
}));

const { fetchAgentState, invalidateAgentStateReads } =
  await import('@/features/chat/model/agent-state');
const { disposeThreadRuntime, getThreadRuntime, hasThreadRuntime } =
  await import('@/features/chat/model/thread-runtime-store');

const THREAD = 'thread-state';

describe('线程 state 拉取', () => {
  beforeEach(() => {
    api.getAgentState.mockReset();
    // 运行时由进入线程时创建；这里模拟它已存在
    disposeThreadRuntime(THREAD);
    getThreadRuntime(THREAD);
  });

  it('把 token_usage 写进线程运行时', async () => {
    api.getAgentState.mockResolvedValue({
      agent_state: { token_usage: { llm_input_tokens: 1234 } },
    });

    await fetchAgentState(THREAD);

    expect(api.getAgentState).toHaveBeenCalledWith(THREAD);
    expect(
      (getThreadRuntime(THREAD).agentState as { token_usage?: unknown })
        ?.token_usage,
    ).toEqual({ llm_input_tokens: 1234 });
  });

  it('响应里没有 agent_state 时写 null，不保留上一次的快照', async () => {
    api.getAgentState.mockResolvedValueOnce({
      agent_state: { token_usage: { llm_input_tokens: 1 } },
    });
    await fetchAgentState(THREAD);

    api.getAgentState.mockResolvedValueOnce({});
    await fetchAgentState(THREAD);

    expect(getThreadRuntime(THREAD).agentState).toBeNull();
  });

  it('迟到的响应不会覆盖更新的那一次读取', async () => {
    let resolveSlow!: (value: unknown) => void;
    api.getAgentState
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSlow = resolve;
        }),
      )
      .mockResolvedValueOnce({
        agent_state: { token_usage: { llm_input_tokens: 222 } },
      });

    const slow = fetchAgentState(THREAD);
    await fetchAgentState(THREAD);
    expect(
      (getThreadRuntime(THREAD).agentState as { token_usage?: unknown })
        ?.token_usage,
    ).toEqual({ llm_input_tokens: 222 });

    resolveSlow({ agent_state: { token_usage: { llm_input_tokens: 111 } } });
    await slow;

    expect(
      (getThreadRuntime(THREAD).agentState as { token_usage?: unknown })
        ?.token_usage,
    ).toEqual({ llm_input_tokens: 222 });
  });

  it('中断仍属于当前 run 时恢复成待处理项', async () => {
    api.getAgentState.mockResolvedValue({
      agent_state: {},
      interrupt: {
        status: 'human_approval_required',
        thread_id: THREAD,
        run_id: 'run-1',
        approval: {
          action_requests: [{ name: 'execute', args: { command: 'ls' } }],
          review_configs: [{ allow_accept: true }],
        },
      },
    });
    const runtime = getThreadRuntime(THREAD);
    runtime.activeRunId = 'run-1';

    await fetchAgentState(THREAD);

    expect(runtime.pendingInterrupt).toMatchObject({
      interruptedRunId: 'run-1',
    });
  });

  it('中断属于已经换掉的 run 时不恢复', async () => {
    api.getAgentState.mockResolvedValue({
      agent_state: {},
      interrupt: {
        status: 'human_approval_required',
        thread_id: THREAD,
        run_id: 'run-旧',
        approval: {
          action_requests: [{ name: 'execute', args: { command: 'ls' } }],
          review_configs: [{ allow_accept: true }],
        },
      },
    });
    const runtime = getThreadRuntime(THREAD);
    runtime.activeRunId = 'run-新';

    await fetchAgentState(THREAD);

    expect(runtime.pendingInterrupt).toBeNull();
  });

  it('流式进行中不弹出历史中断', async () => {
    api.getAgentState.mockResolvedValue({
      agent_state: {},
      interrupt: {
        status: 'human_approval_required',
        thread_id: THREAD,
        run_id: 'run-1',
        approval: {
          action_requests: [{ name: 'execute', args: { command: 'ls' } }],
          review_configs: [{ allow_accept: true }],
        },
      },
    });
    const runtime = getThreadRuntime(THREAD);
    runtime.activeRunId = 'run-1';
    runtime.isStreaming = true;

    await fetchAgentState(THREAD);

    expect(runtime.pendingInterrupt).toBeNull();
  });

  it('拉取失败只记录，不抛出也不清空已有状态', async () => {
    api.getAgentState.mockResolvedValueOnce({
      agent_state: { token_usage: { llm_input_tokens: 999 } },
    });
    await fetchAgentState(THREAD);

    api.getAgentState.mockRejectedValueOnce(new Error('500'));
    await expect(fetchAgentState(THREAD)).resolves.toBeUndefined();

    expect(
      (getThreadRuntime(THREAD).agentState as { token_usage?: unknown })
        ?.token_usage,
    ).toEqual({ llm_input_tokens: 999 });
  });

  it('没有线程运行时不做任何事', async () => {
    disposeThreadRuntime(THREAD);

    await fetchAgentState(THREAD);

    expect(api.getAgentState).not.toHaveBeenCalled();
  });

  it('空线程 id 不发请求', async () => {
    await fetchAgentState('');

    expect(api.getAgentState).not.toHaveBeenCalled();
  });

  it('线程在读取期间被删除时不复活它的运行时', async () => {
    let resolveState!: (value: unknown) => void;
    api.getAgentState.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      }),
    );

    const pending = fetchAgentState(THREAD);
    disposeThreadRuntime(THREAD);
    resolveState({ agent_state: { token_usage: { llm_input_tokens: 1 } } });
    await pending;

    expect(hasThreadRuntime(THREAD)).toBe(false);
  });

  it('中断不带 run_id 时按当前 run 处理', async () => {
    api.getAgentState.mockResolvedValue({
      agent_state: {},
      interrupt: {
        status: 'human_approval_required',
        thread_id: THREAD,
        approval: {
          action_requests: [{ name: 'execute', args: {} }],
          review_configs: [{}],
        },
      },
    });
    const runtime = getThreadRuntime(THREAD);
    runtime.activeRunId = 'run-1';

    await fetchAgentState(THREAD);

    expect(runtime.pendingInterrupt).toMatchObject({ interruptedRunId: null });
  });

  it('被作废的读取既不写状态也不通知界面', async () => {
    let resolveState!: (value: unknown) => void;
    api.getAgentState.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      }),
    );
    const runtime = getThreadRuntime(THREAD);
    runtime.agentState = { token_usage: { llm_input_tokens: 7 } };

    const pending = fetchAgentState(THREAD);
    // 用户在响应回来前批准了审批：这次读取已经过期
    invalidateAgentStateReads(THREAD);
    resolveState({ agent_state: { token_usage: { llm_input_tokens: 999 } } });
    await pending;

    expect(
      (runtime.agentState as { token_usage?: unknown }).token_usage,
    ).toEqual({ llm_input_tokens: 7 });
    expect(runtime.pendingInterrupt).toBeNull();
  });
});
