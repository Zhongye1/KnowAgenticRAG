/**
 * 极简 SSE 解析器（D25 事件行协议）。
 *
 * 后端 EventSourceResponse 直出 `event: <name>` + `data: <JSON>` 事件行，
 * 并以 `: ping` 注释行保活；EventSource 无法携带 POST/Authorization 头，
 * 因此用 fetch + ReadableStream 手工解析。
 */

export interface SseMessage {
  event: string;
  data: string;
}

const EVENT_SEPARATOR = /\r?\n\r?\n/;

/** 解析单个 SSE 事件块（以空行分隔）；无 data 行（如注释）返回 null */
export const parseSseBlock = (raw: string): SseMessage | null => {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
};

/** 逐块解析 SSE 字节流，按事件产出（跨 chunk 的事件自动拼接） */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      for (;;) {
        const match = EVENT_SEPARATOR.exec(buffer);
        if (!match) break;
        const message = parseSseBlock(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
        if (message) yield message;
      }
    }

    buffer += decoder.decode();
    const tail = parseSseBlock(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

/** 解析 D25 data 行 JSON；非法 JSON 返回 null（事件行契约要求 JSON，防御性兜底） */
export const parseD25Data = (data: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(data);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};
