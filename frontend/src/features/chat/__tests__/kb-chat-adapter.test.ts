import type { ChatModelRunResult } from '@assistant-ui/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createKbChatAdapter } from '../lib/chat-adapter';
import { useChatRunStore } from '../stores/chat-run-store';
import { useChatSettingsStore } from '../stores/chat-settings-store';

/** 组装 SSE 响应体（与后端 EventSourceResponse 行格式一致） */
const sseResponse = (events: Array<{ event: string; data: unknown }>): Response => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const item of events) {
          controller.enqueue(
            encoder.encode(`event: ${item.event}\ndata: ${JSON.stringify(item.data)}\n\n`),
          );
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
};

const runAdapter = async (
  mode: 'chat' | 'agent',
  messageId = 'msg-1',
): Promise<string> => {
  const adapter = createKbChatAdapter(mode);
  let text = '';
  // 驱动 assistant-ui ChatModelAdapter：runtime 要求累计文本（后一帧覆盖前一帧）
  const stream = adapter.run({
    messages: [
      { role: 'user', content: [{ type: 'text', text: '营收确认规则？' }] },
    ],
    abortSignal: new AbortController().signal,
    context: { config: { modelName: 'mock:qwen' } },
    unstable_assistantMessageId: messageId,
  } as never) as unknown as AsyncIterable<ChatModelRunResult>;

  for await (const part of stream) {
    for (const content of part.content ?? []) {
      if (content.type === 'text') text = content.text;
    }
  }
  return text;
};

const fetchMock = (response: Response) => {
  const spy = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(() =>
    Promise.resolve(response),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
};

describe('createKbChatAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('chat 模式命中 /chat/stream 并渲染回答文本', async () => {
    useChatSettingsStore.getState().setKbName('platform_docs');
    const spy = fetchMock(
      sseResponse([
        { event: 'step', data: { name: 'recall', detail: 'text=1 visual=0' } },
        { event: 'delta', data: { content: '营收' } },
        { event: 'delta', data: { content: '确认规则' } },
        { event: 'done', data: { reason: 'complete' } },
      ]),
    );

    const text = await runAdapter('chat');

    expect(String(spy.mock.calls[0]?.[0])).toContain(
      '/api/v1/knowledge_bases/platform_docs/chat/stream',
    );
    expect(text).toBe('营收确认规则');
    const run = useChatRunStore.getState().runs['msg-1'];
    expect(run?.steps).toEqual([{ name: 'recall', detail: 'text=1 visual=0' }]);
    expect(run?.doneReason).toBe('complete');
  });

  it('agent 模式命中 /agent/stream 并累积 step / agent 元数据', async () => {
    useChatSettingsStore.getState().setKbName('finance');
    const spy = fetchMock(
      sseResponse([
        { event: 'step', data: { name: 'plan', detail: 'need_retrieval=true' } },
        { event: 'step', data: { name: 'act', detail: 'tool_calls=2' } },
        { event: 'step', data: { name: 'grade', detail: 'score=0.42' } },
        {
          event: 'citation',
          data: {
            citations: [],
            images: [{ image_id: 'doc-1_t1', image_path: 'kb/core/finance/doc-1/tiles/1.png' }],
          },
        },
        { event: 'delta', data: { content: '见 [1]' } },
        {
          event: 'done',
          data: {
            reason: 'complete',
            agent: {
              need_retrieval: true,
              sub_queries: ['营收确认规则', '收入准则条款'],
              plan_rationale: '问题涉及准则条款',
              grade_score: 0.42,
              rewrites: 1,
              tool_calls: 2,
            },
          },
        },
      ]),
    );

    await runAdapter('agent');

    expect(String(spy.mock.calls[0]?.[0])).toContain(
      '/api/v1/knowledge_bases/finance/agent/stream',
    );
    const run = useChatRunStore.getState().runs['msg-1'];
    expect(run?.steps?.map((step) => step.name)).toEqual(['plan', 'act', 'grade']);
    expect(run?.images).toHaveLength(1);
    expect(run?.agent).toMatchObject({
      sub_queries: ['营收确认规则', '收入准则条款'],
      rewrites: 1,
      tool_calls: 2,
    });
  });

  it('error 事件转成异常（含 trace_id）', async () => {
    useChatSettingsStore.getState().setKbName('finance');
    fetchMock(
      sseResponse([
        { event: 'error', data: { msg: '模型未配置', trace_id: 'trace-9' } },
      ]),
    );

    await expect(runAdapter('agent')).rejects.toThrow('模型未配置（trace_id: trace-9）');
  });
});
