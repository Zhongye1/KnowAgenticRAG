/**
 * Run 事件流的 SSE 分帧解析。
 *
 * 逐行对照上游 `useAgentRunStream.js` 的 `processRunSseResponse`：按空行分帧、
 * 支持多行 `data:`、跳过 `:` 开头的注释（心跳）、`id:` 作为续传游标。
 */

export type RunSseEvent = {
  event: string;
  data: unknown;
  id: string | null;
};

/** 逐帧消费一个 SSE 响应体；每帧解析成功后调用 `onEvent`。 */
export async function processRunSseResponse(
  response: Response,
  onEvent: (event: string, data: unknown, id: string | null) => void,
): Promise<void> {
  if (!response?.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventType = 'message';
  let eventId: string | null = null;
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length === 0) return;
    const dataText = dataLines.join('\n');
    try {
      onEvent(eventType, JSON.parse(dataText), eventId);
    } catch (error) {
      console.warn('Failed to parse run SSE data:', error, dataText);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');
        if (!line) {
          dispatch();
          eventType = 'message';
          eventId = null;
          dataLines = [];
          continue;
        }
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim() || 'message';
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        } else if (line.startsWith('id:')) {
          eventId = line.slice(3).trim();
        }
      }
    }

    dispatch();
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // 释放失败不影响已消费的数据
    }
  }
}
