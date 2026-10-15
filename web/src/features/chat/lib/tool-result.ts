/** 工具结果的展示视图。 */
import type { ChatToolCall } from '../api/agent-api';
import {
  buildDocumentPreview,
  type DocumentPreview,
} from './kb-document-preview';
import {
  resolveQuestions,
  resolveUserAnswer,
  type QuestionItem,
} from './ask-question';
import { parseKbQueryResult, type KbQueryResult } from './kb-query-result';
import { buildMemoryView } from './memory';
import { parseTodoList, type TodoItem } from './todo-list';
import {
  parseWebSearchResults,
  type WebSearchResult,
} from './web-search-results';

export type ToolResultView =
  | { kind: 'image'; url: string }
  | { kind: 'web-search'; results: WebSearchResult[]; rawText: string }
  | { kind: 'todo'; items: TodoItem[] }
  | { kind: 'kb-query'; result: KbQueryResult }
  | { kind: 'ask-question'; questions: QuestionItem[]; answer: unknown }
  | { kind: 'document-preview'; preview: DocumentPreview }
  | {
      kind: 'memory';
      statusText: string;
      meta: string;
      isError: boolean;
    }
  | { kind: 'text'; text: string }
  | { kind: 'subagent-task' }
  | { kind: 'subagent-lifecycle' }
  | null;

/** 结果的原始内容；不做 JSON 解析，因为这两种工具都按原始形状判断。 */
function rawResult(toolCall: ChatToolCall): unknown {
  return toolCall.tool_call_result?.content;
}

/**
 * 生成图片：结果本身就是 `http` 开头的 URL 时画图；其余情况交给通用文本渲染，
 * 避免把「失败原因」这类字符串当成图片地址。
 */
function imageUrl(toolCall: ChatToolCall): string | null {
  const content = rawResult(toolCall);

  return typeof content === 'string' && content.startsWith('http')
    ? content
    : null;
}

/** 生成图表：结果是 `[{type:'text', text:'<url>'}]`，取第一项的 `text`。 */
function chartUrl(toolCall: ChatToolCall): string | null {
  const content = rawResult(toolCall);
  if (!Array.isArray(content) || content.length === 0) return null;

  const first = content[0] as { type?: unknown; text?: unknown } | undefined;
  if (first?.type !== 'text') return null;

  return typeof first.text === 'string' && first.text ? first.text : null;
}

/**
 * 计算器结果：数字按中文习惯加千分位、最多十位小数；`Infinity` / `NaN` 这类特殊值
 * 用符号表示。非数字原样转字符串。
 */
export function formatCalculatorResult(content: unknown): string {
  let value: unknown = content;
  if (typeof value === 'string') {
    const raw = value;
    try {
      value = JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  if (typeof value !== 'number') return String(value ?? '');
  if (!Number.isFinite(value)) {
    if (Number.isNaN(value)) return 'NaN';
    return value > 0 ? '∞' : '-∞';
  }

  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 10,
    useGrouping: true,
  }).format(value);
}

/** 按工具 id 给出结果视图；没有专门视图时返回 `null`。 */ export function buildToolResultView(
  toolCall: ChatToolCall,
): ToolResultView {
  switch (toolCall.name || toolCall.function?.name) {
    case 'text_to_img_qwen_image': {
      const url = imageUrl(toolCall);
      return url ? { kind: 'image', url } : null;
    }

    case 'chart': {
      const url = chartUrl(toolCall);
      return url ? { kind: 'image', url } : null;
    }

    case 'calculator': {
      const content = rawResult(toolCall);
      if (content === undefined || content === null || content === '') {
        return null;
      }

      return { kind: 'text', text: formatCalculatorResult(content) };
    }

    case 'open_kb_document':
    case 'find_kb_document': {
      const preview = buildDocumentPreview(
        toolCall,
        toolCall.name === 'find_kb_document' ? 'find' : 'open',
      );
      // 结果不是可预览结构时交给通用文本渲染
      if (!preview) return null;

      return { kind: 'document-preview', preview };
    }

    case 'ask_user_question': {
      const questions = resolveQuestions(toolCall);
      // 参数里没有题目且结果还没到时不接管
      if (questions.length === 0 && rawResult(toolCall) === undefined)
        return null;

      return {
        kind: 'ask-question',
        questions,
        answer: resolveUserAnswer(toolCall),
      };
    }

    case 'query_kb': {
      const content = rawResult(toolCall);
      // 还没有结果时不接管，避免把在飞的工具画成「未找到知识库内容」
      if (content === undefined) return null;

      return { kind: 'kb-query', result: parseKbQueryResult(content) };
    }

    case 'remember_memory': {
      const memory = buildMemoryView(toolCall);
      // 没有结构化结果时交给通用渲染，不猜状态文案
      if (!memory.hasResult) return null;

      return {
        kind: 'memory',
        statusText: memory.statusText,
        meta: memory.meta,
        isError: memory.isError,
      };
    }

    case 'write_todos': {
      const content = rawResult(toolCall);
      // 没有结果时交给通用渲染，避免把一个还没返回的工具画成空清单
      if (content === undefined || content === null || content === '') {
        return null;
      }

      return { kind: 'todo', items: parseTodoList(content) };
    }

    case 'web_search':
    case 'tavily_search':
    case 'doubao_search': {
      const parsed = parseWebSearchResults(toolCall);
      // 既没有结构化结果也没有原文时交给通用结果渲染，避免只剩一个空态
      if (parsed.results.length === 0 && !parsed.rawText) return null;

      return {
        kind: 'web-search',
        results: parsed.results,
        rawText: parsed.rawText,
      };
    }

    case 'task': {
      // task 的头部、状态与结果都在专用行渲染器里组装
      return { kind: 'subagent-task' };
    }

    case 'subagent_start':
    case 'subagent_status':
    case 'subagent_events':
    case 'subagent_cancel':
    case 'subagent_await': {
      return { kind: 'subagent-lifecycle' };
    }

    default:
      return null;
  }
}
