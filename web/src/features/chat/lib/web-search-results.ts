/** 网络搜索结果的解析。 */
import type { ChatToolCall } from '../api/agent-api';

export type WebSearchResult = {
  title: string;
  url: string;
  score: number | null;
  content: string;
};

export type WebSearchResults = {
  results: WebSearchResult[];
  /** 结果不是结构化 JSON 时的原始文本；没有时为 `''`。 */
  rawText: string;
};

const EMPTY: WebSearchResults = { results: [], rawText: '' };

/** 归一单条结果；标题与链接都拿不到时返回 null，避免渲染空行。 */
function normalizeResult(item: unknown): WebSearchResult | null {
  if (!item || typeof item !== 'object') return null;

  const record = item as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const url = typeof record.url === 'string' ? record.url.trim() : '';
  if (!title && !url) return null;

  return {
    title: title || url,
    url,
    score: typeof record.score === 'number' ? record.score : null,
    content: typeof record.content === 'string' ? record.content : '',
  };
}

/** 解析工具结果；非结构化内容进 `rawText`。 */
export function parseWebSearchResults(
  toolCall: ChatToolCall | null | undefined,
): WebSearchResults {
  const content = toolCall?.tool_call_result?.content;
  if (content === undefined || content === null || content === '') return EMPTY;

  let parsed: unknown = content;
  if (typeof content === 'string') {
    try {
      parsed = JSON.parse(content);
    } catch {
      return { results: [], rawText: content };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return EMPTY;

  const raw = (parsed as { results?: unknown }).results;
  const list = Array.isArray(raw) ? raw : [];

  return {
    results: list
      .map(normalizeResult)
      .filter((item): item is WebSearchResult => item !== null),
    rawText: '',
  };
}
