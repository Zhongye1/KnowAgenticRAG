/** 一轮对话里的来源提取：知识库检索片段与网络搜索来源。 */
import type { ChatMessage, ChatToolCall } from '../api/agent-api';
import { parseKbQueryResult } from './kb-query-result';
import { parseWebSearchResults } from './web-search-results';

/** 会产生知识库来源的工具。 */
const KB_TOOLS = new Set(['query_kb']);

/** 会产生网络来源的工具。 */
const WEB_TOOLS = new Set(['web_search', 'tavily_search', 'doubao_search']);

export type KnowledgeSource = {
  kbId: string;
  /** 知识库名；调用方解析不出来时为空串。 */
  kbName: string;
  content: string;
  score: number | null;
  source: string;
  fileId: string;
  chunkId: string;
};

export type WebSource = {
  toolName: string;
  title: string;
  url: string;
  score: number | null;
  content: string;
  publishedDate: string;
};

export type ConversationSources = {
  knowledgeChunks: KnowledgeSource[];
  webSources: WebSource[];
};

export type ExtractSourcesOptions = {
  /** `kb_id` → 知识库名；拿不到时来源条目仍会保留，只是名称为空。 */
  resolveKbName?: (kbId: string) => string;
};

const toolNameOf = (toolCall: ChatToolCall): string =>
  toolCall?.name || toolCall?.function?.name || '';

const toolCallArgs = (toolCall: ChatToolCall): Record<string, unknown> => {
  const args = toolCall?.args ?? toolCall?.function?.arguments;
  if (!args) return {};
  if (typeof args === 'object') return args as Record<string, unknown>;

  try {
    const parsed: unknown = JSON.parse(String(args));

    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const stringArg = (args: Record<string, unknown>, key: string): string =>
  typeof args[key] === 'string' ? (args[key] as string) : '';

/** 分数降序；没有分数的排在后面，但不丢掉。 */
const byScoreDesc = <T extends { score: number | null }>(a: T, b: T): number =>
  (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY);

/** 提取一轮对话里的全部来源。 */
export function extractSources(
  messages: ChatMessage[] | null | undefined,
  options: ExtractSourcesOptions = {},
): ConversationSources {
  const knowledgeChunks: KnowledgeSource[] = [];
  const webSources: WebSource[] = [];
  const seenChunks = new Set<string>();
  const seenUrls = new Set<string>();

  for (const message of messages ?? []) {
    if (message?.type !== 'ai' || !Array.isArray(message.tool_calls)) continue;

    for (const toolCall of message.tool_calls) {
      const name = toolNameOf(toolCall);

      if (KB_TOOLS.has(name)) {
        const parsed = parseKbQueryResult(toolCall.tool_call_result?.content);
        const args = toolCallArgs(toolCall);
        const fallbackKbId = stringArg(args, 'kb_id');

        for (const chunk of parsed.chunks) {
          const kbId = chunk.kbId || fallbackKbId;
          const dedupKey = `${kbId}::${chunk.chunkId || chunk.content}`;
          if (seenChunks.has(dedupKey)) continue;
          seenChunks.add(dedupKey);

          knowledgeChunks.push({
            kbId,
            kbName:
              kbId && options.resolveKbName ? options.resolveKbName(kbId) : '',
            content: chunk.content,
            score: chunk.score,
            source: chunk.source,
            fileId: chunk.fileId,
            chunkId: chunk.chunkId,
          });
        }
        continue;
      }

      if (WEB_TOOLS.has(name)) {
        const parsed = parseWebSearchResults(toolCall);
        for (const item of parsed.results) {
          if (item.url && seenUrls.has(item.url)) continue;
          if (item.url) seenUrls.add(item.url);

          webSources.push({
            toolName: name,
            title: item.title,
            url: item.url,
            score: item.score,
            content: item.content,
            publishedDate: '',
          });
        }
      }
    }
  }

  return {
    knowledgeChunks: knowledgeChunks.sort(byScoreDesc),
    webSources: webSources.sort(byScoreDesc),
  };
}

/** 这一轮有没有任何来源；用来决定是否渲染来源入口。 */
export function hasSources(sources: ConversationSources): boolean {
  return sources.knowledgeChunks.length > 0 || sources.webSources.length > 0;
}
