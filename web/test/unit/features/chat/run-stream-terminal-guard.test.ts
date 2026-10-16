/**
 * `end` 事件终态守卫的接线。
 *
 * 事件流的形状不在契约里（后端用 `format_sse` 拼 dict，`text/event-stream` 不进 OpenAPI），
 * 前端按约定读。`end` 的 status 改名后代码会落进兜底分支：`sawTerminalEvent` 已置真，
 * 不会再回查 run，但 `finalizeRunStream` 不会被调用——静默地少收尾一次。
 *
 * 这里驱动真实的 SSE 帧（只桩掉发起请求的那一层），断言未知终态会告警、已知终态不会。
 * 把守卫的调用点去掉，第二条用例必须失败。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const streamRunEvents = vi.fn();

vi.mock('@/features/chat/api/agent-api', () => ({
  agentRunApi: {
    streamRunEvents: (...args: unknown[]) => streamRunEvents(...args),
  },
}));

const { createRunStream } = await import('@/features/chat/model/run-stream');

const sseResponse = (frames: string) =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frames));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );

const endFrame = (status: string) =>
  `id: 1-0\nevent: end\ndata: ${JSON.stringify({ payload: { status } })}\n\n`;

/** 只桩掉请求层，事件解析、分帧与状态机都跑真实的。 */
const driveStream = async (frames: string, threadId: string) => {
  streamRunEvents.mockResolvedValue(sseResponse(frames));

  const stream = createRunStream({
    currentAgentId: () => 'chatbot',
    handleStreamChunk: vi.fn(),
    fetchThreadMessages: async () => ({}),
    fetchAgentState: vi.fn(),
    resetOnGoingConv: vi.fn(),
  });

  await stream.startRunStream(threadId, `run-${threadId}`);
};

describe('Run 事件流的终态守卫', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    vi.clearAllMocks();
  });

  it('已知终态不告警', async () => {
    await driveStream(endFrame('completed'), 'th-known');

    expect(warn).not.toHaveBeenCalled();
  });

  it('未知终态告警并带上原值', async () => {
    await driveStream(endFrame('succeeded'), 'th-unknown');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toBe('succeeded');
  });
});
