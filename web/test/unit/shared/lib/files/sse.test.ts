import { describe, expect, it, vi } from 'vitest';

import { processSseResponse } from '@/shared/lib/files/sse';

/** 把若干片段拼成一个 SSE 响应，模拟分块到达。 */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe('processSseResponse', () => {
  it('按空行分帧，解析 event / data / id', async () => {
    const onEvent = vi.fn();
    await processSseResponse(
      sseResponse([
        'event: delta\nid: 5-0\ndata: {"payload":{"text":"hi"}}\n\n',
      ]),
      onEvent,
    );

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      'delta',
      { payload: { text: 'hi' } },
      '5-0',
    );
  });

  it('跨分块拼接未完成的帧', async () => {
    const onEvent = vi.fn();
    await processSseResponse(
      sseResponse(['event: delta\ndata: {"a"', ':1}\n\n']),
      onEvent,
    );

    expect(onEvent).toHaveBeenCalledWith('delta', { a: 1 }, null);
  });

  it('多行 data 以换行拼接后再解析', async () => {
    const onEvent = vi.fn();
    await processSseResponse(
      sseResponse(['data: {"a":\ndata: 1}\n\n']),
      onEvent,
    );

    expect(onEvent).toHaveBeenCalledWith('message', { a: 1 }, null);
  });

  it('跳过注释帧（心跳）', async () => {
    const onEvent = vi.fn();
    await processSseResponse(sseResponse([': keep-alive\n\n']), onEvent);

    expect(onEvent).not.toHaveBeenCalled();
  });

  it('数据不是合法 JSON 时跳过该帧且不抛出', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onEvent = vi.fn();

    await expect(
      processSseResponse(sseResponse(['data: not-json\n\n']), onEvent),
    ).resolves.toBeUndefined();

    expect(onEvent).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('处理 CRLF 行尾', async () => {
    const onEvent = vi.fn();
    await processSseResponse(
      sseResponse(['event: end\r\ndata: {"status":"completed"}\r\n\r\n']),
      onEvent,
    );

    expect(onEvent).toHaveBeenCalledWith('end', { status: 'completed' }, null);
  });

  it('响应没有 body 时直接返回', async () => {
    const onEvent = vi.fn();
    await expect(
      processSseResponse(new Response(null), onEvent),
    ).resolves.toBeUndefined();

    expect(onEvent).not.toHaveBeenCalled();
  });
});
