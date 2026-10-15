import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  attachToolResults,
  splitStreamedChunks,
  type StreamedChunk,
} from '@/features/chat/lib/message-processor';
import { createStreamHandler } from '@/features/chat/model/stream-handler';
import {
  disposeThreadRuntime,
  getThreadRuntime,
  useThreadRuntime,
} from '@/features/chat/model/thread-runtime-store';

const THREAD = 'thread-stream-handler';

/**
 * 后端 `make_chunk(status="stream_event", event=payload)` 的真实形状：
 * `event.data.output` 是一条 ToolMessage 字典，它的 `id` 是消息 id，
 * `tool_call_id` 才是发起它的那次调用。
 */
const toolFinishedChunk = (toolCallId: string, content: string) => ({
  status: 'stream_event',
  event: {
    method: 'tools',
    data: {
      event: 'tool-finished',
      tool_call_id: toolCallId,
      output: {
        id: '5cc2eca4-38f2-4335-af16-ba5f02f61ed2',
        tool_call_id: toolCallId,
        type: 'tool',
        status: 'success',
        content,
      },
    },
  },
});

const aiToolCallChunk = (toolCallId: string) => ({
  status: 'loading',
  msg: {
    id: 'ai-1',
    type: 'AIMessageChunk',
    content: '',
    tool_call_chunks: [
      { index: 0, id: toolCallId, name: 'bash', args: '{"command":"ls"}' },
    ],
  },
});

const createHandler = () =>
  createStreamHandler({
    getThreadRuntime: (threadId) => getThreadRuntime(threadId) ?? null,
  });

const handle = (chunk: Record<string, unknown>) =>
  createHandler().handleStreamChunk(chunk, THREAD);

/** 订阅线程状态的最小探针：版本号变化会重渲染，据此观察是否通知了界面。 */
const RuntimeProbe = () => {
  const runtime = useThreadRuntime(THREAD);
  const toolCount = Object.values(runtime?.onGoingConv.msgChunks ?? {})
    .flat()
    .filter((chunk) => (chunk as { type?: string }).type === 'tool').length;

  return <span data-testid="tool-count">{toolCount}</span>;
};

describe('流式工具结果', () => {
  // 线程运行时是模块级状态，每个用例都要从干净的分片表开始
  beforeEach(() => disposeThreadRuntime(THREAD));

  it('loading 的语义分片里没有工具事件，不会误产出工具结果', () => {
    handle({ status: 'loading', msg: { id: 'ai-1', content: '正文' } });

    const chunks = getThreadRuntime(THREAD).onGoingConv.msgChunks;
    expect(Object.values(chunks).flat()).not.toContainEqual(
      expect.objectContaining({ type: 'tool' }),
    );
  });

  it('tool-finished 立刻写进分片表，并按 tool_call_id 并回发起它的调用', () => {
    handle(aiToolCallChunk('call_1'));
    handle(toolFinishedChunk('call_1', '文件列表'));

    const chunks = getThreadRuntime(THREAD).onGoingConv.msgChunks;
    const { messages, toolResults } = splitStreamedChunks(
      Object.entries(chunks) as Array<[string, StreamedChunk[]]>,
    );

    expect(toolResults.get('call_1')).toBe('文件列表');

    const [withResult] = attachToolResults(messages, toolResults);
    const toolCall = withResult?.tool_calls?.find(
      (item) => item.id === 'call_1',
    );

    // 工具行必须离开「进行中」：结果与状态都要落到调用上
    expect(toolCall?.tool_call_result).toEqual({ content: '文件列表' });
  });

  it('工具结果写入分片表后通知界面重绘', async () => {
    render(<RuntimeProbe />);
    expect(screen.getByTestId('tool-count').textContent).toBe('0');

    handle(toolFinishedChunk('call_1', '文件列表'));

    // 只写分片表不 notifyThreadRuntime 时，这里会一直停在 0
    await waitFor(() =>
      expect(screen.getByTestId('tool-count').textContent).toBe('1'),
    );
  });

  it('init 下发的人类消息保留 human 角色，不会被当成助手消息', () => {
    handle({
      status: 'init',
      request_id: 'req-1',
      msg: { id: 'human-1', type: 'human', content: '你好' },
    });

    const chunks = getThreadRuntime(THREAD).onGoingConv.msgChunks;
    const { messages } = splitStreamedChunks(
      Object.entries(chunks) as Array<[string, StreamedChunk[]]>,
    );

    expect(messages.find((message) => message.id === 'human-1')?.type).toBe(
      'human',
    );
  });

  it('本地占位消息被 init 下发的权威消息替换，正文不会拼成两遍', () => {
    // 发送时的占位：真实后端在排队期间不会把这条消息写进历史
    getThreadRuntime(THREAD).onGoingConv.msgChunks['req-1'] = [
      { id: 'req-1', type: 'human', content: '你好' },
    ];

    // 后端的 init 分片形状：request_id 在分片顶层，msg 里没有 id
    handle({
      status: 'init',
      request_id: 'req-1',
      msg: { role: 'user', type: 'human', content: '你好' },
    });

    const chunks = getThreadRuntime(THREAD).onGoingConv.msgChunks;
    const { messages } = splitStreamedChunks(
      Object.entries(chunks) as Array<[string, StreamedChunk[]]>,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('你好');
  });

  it('init 下发的图片保留在用户消息上', () => {
    getThreadRuntime(THREAD).onGoingConv.msgChunks['req-2'] = [
      { id: 'req-2', type: 'human', content: '' },
    ];

    handle({
      status: 'init',
      request_id: 'req-2',
      msg: {
        role: 'user',
        type: 'human',
        content: '',
        image_content: 'iVBORw0KGgoAAA',
      },
    });

    const chunks = getThreadRuntime(THREAD).onGoingConv.msgChunks;
    const { messages } = splitStreamedChunks(
      Object.entries(chunks) as Array<[string, StreamedChunk[]]>,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.image_content).toBe('iVBORw0KGgoAAA');
  });

  it('同一个请求的 init 到两次也只渲染一条用户消息', () => {
    getThreadRuntime(THREAD).onGoingConv.msgChunks['req-4'] = [
      { id: 'req-4', type: 'human', content: '你好' },
    ];
    const initChunk = {
      status: 'init',
      request_id: 'req-4',
      msg: { role: 'user', type: 'human', content: '你好' },
    };

    handle(initChunk);
    handle(initChunk);

    const chunks = getThreadRuntime(THREAD).onGoingConv.msgChunks;
    const { messages } = splitStreamedChunks(
      Object.entries(chunks) as Array<[string, StreamedChunk[]]>,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('你好');
  });

  it('没有占位的 init 不会动别的请求的分片', () => {
    getThreadRuntime(THREAD).onGoingConv.msgChunks['其他请求'] = [
      { id: '其他请求', type: 'human', content: '别动我' },
    ];

    handle({
      status: 'init',
      request_id: 'req-5',
      msg: { role: 'user', type: 'human', content: '新的一条' },
    });

    const chunks = getThreadRuntime(THREAD).onGoingConv.msgChunks;
    const { messages } = splitStreamedChunks(
      Object.entries(chunks) as Array<[string, StreamedChunk[]]>,
    );

    expect(messages.map((message) => message.content).sort()).toEqual([
      '别动我',
      '新的一条',
    ]);
  });

  it('agent_state 分片把用量快照写进线程运行时', () => {
    handle({
      status: 'agent_state',
      thread_id: THREAD,
      agent_state: { token_usage: { llm_input_tokens: 4321 } },
    });

    expect(
      (getThreadRuntime(THREAD).agentState as { token_usage?: unknown })
        ?.token_usage,
    ).toEqual({ llm_input_tokens: 4321 });
  });

  it('agent_state 为空时不覆盖已有快照', () => {
    handle({
      status: 'agent_state',
      thread_id: THREAD,
      agent_state: { token_usage: { llm_input_tokens: 1 } },
    });

    handle({ status: 'agent_state', thread_id: THREAD });

    expect(
      (getThreadRuntime(THREAD).agentState as { token_usage?: unknown })
        ?.token_usage,
    ).toEqual({ llm_input_tokens: 1 });
  });
});
