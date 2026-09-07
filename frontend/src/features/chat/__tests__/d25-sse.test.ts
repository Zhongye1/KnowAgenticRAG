import { describe, expect, it } from 'vitest';

import { parseD25Data, parseSseBlock, parseSseStream } from '../lib/d25-sse';

const streamFrom = (chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
};

const collect = async (chunks: string[]) => {
  const events: { event: string; data: string }[] = [];
  for await (const message of parseSseStream(streamFrom(chunks))) {
    events.push(message);
  }
  return events;
};

describe('parseSseBlock', () => {
  it('解析 event 与 data 行', () => {
    expect(parseSseBlock('event: delta\ndata: {"content":"你好"}')).toEqual({
      event: 'delta',
      data: '{"content":"你好"}',
    });
  });

  it('容忍 CRLF 与 data 前空格', () => {
    expect(parseSseBlock('event: meta\r\ndata: {"hit_count":3}')).toEqual({
      event: 'meta',
      data: '{"hit_count":3}',
    });
  });

  it('忽略注释保活行', () => {
    expect(parseSseBlock(': ping - 2026-09-07\nevent: done\ndata: {"reason":"complete"}')).toEqual({
      event: 'done',
      data: '{"reason":"complete"}',
    });
  });

  it('多条 data 行按 SSE 规范拼接', () => {
    expect(parseSseBlock('event: delta\ndata: "a"\ndata: "b"')).toEqual({
      event: 'delta',
      data: '"a"\n"b"',
    });
  });

  it('纯注释块返回 null', () => {
    expect(parseSseBlock(': ping')).toBeNull();
  });
});

describe('parseSseStream', () => {
  it('按事件边界产出完整事件', async () => {
    const events = await collect([
      'event: meta\ndata: {"hit_count":2}\n\n',
      'event: delta\ndata: {"content":"答"}\n\n',
    ]);
    expect(events).toEqual([
      { event: 'meta', data: '{"hit_count":2}' },
      { event: 'delta', data: '{"content":"答"}' },
    ]);
  });

  it('事件跨 chunk 分片时自动拼接', async () => {
    const events = await collect([
      'event: ci',
      'tation\ndata: {"cit',
      'ations":[{"n":1}]}\n\nevent: do',
      'ne\ndata: {"reason":"complete"}\n\n',
    ]);
    expect(events).toEqual([
      { event: 'citation', data: '{"citations":[{"n":1}]}' },
      { event: 'done', data: '{"reason":"complete"}' },
    ]);
  });

  it('流末尾无结束空行的事件不丢失', async () => {
    const events = await collect(['event: usage\ndata: {"total_tokens":42}\n']);
    expect(events).toEqual([
      { event: 'usage', data: '{"total_tokens":42}' },
    ]);
  });

  it('空流产出为空', async () => {
    expect(await collect([])).toEqual([]);
  });
});

describe('parseD25Data', () => {
  it('解析对象 JSON', () => {
    expect(parseD25Data('{"content":"a"}')).toEqual({ content: 'a' });
  });

  it('非对象/非法 JSON 返回 null', () => {
    expect(parseD25Data('"str"')).toBeNull();
    expect(parseD25Data('{oops')).toBeNull();
  });
});
