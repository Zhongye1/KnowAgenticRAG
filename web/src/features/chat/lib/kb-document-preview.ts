/**
 * 知识库文档预览（`open_kb_document` / `find_kb_document`）的解析。
 *
 * 结果要么是一个文档窗口（`content`），要么是多个上下文窗口（`windows`）。摘要文案按
 * 调用方式分两套：打开按行号区间，查找按匹配数与窗口数。
 */
import type { ChatToolCall } from '../api/agent-api';

/** 文档窗口：一行一段，行首形如 `12\t正文`。 */
export type DocumentWindow = {
  content: string;
  startLine: number;
  endLine: number;
  matchedLines: number[];
};

export type DocumentPreview = {
  summary: string;
  fileId: string;
  windows: DocumentWindow[];
};

export type PreviewMode = 'open' | 'find';

type RawWindow = {
  content?: unknown;
  start_line?: unknown;
  end_line?: unknown;
  matched_lines?: unknown;
};

const toLineNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** 结果是不是可预览的文档结构；不是时调用方走通用文本渲染。 */
export function isPreviewResult(value: unknown): value is RawWindow & {
  content: string;
} {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { content?: unknown }).content === 'string',
  );
}

/** 解析结果内容；不是可预览结构时返回 `null`。模式由调用方按工具决定。 */
export function parseDocumentPreview(
  content: unknown,
  mode: PreviewMode,
): DocumentPreview | null {
  let payload: unknown = content;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }

  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;
  const rawWindows = Array.isArray(record.windows)
    ? (record.windows as RawWindow[])
    : isPreviewResult(record)
      ? [record as RawWindow]
      : [];

  const windows = rawWindows
    .filter((window) => typeof window?.content === 'string')
    .map((window) => ({
      content: window.content as string,
      startLine: toLineNumber(window.start_line),
      endLine: toLineNumber(window.end_line),
      matchedLines: Array.isArray(window.matched_lines)
        ? window.matched_lines.filter(
            (line): line is number => typeof line === 'number',
          )
        : [],
    }));

  // 既没有可用窗口、顶层也没有正文时，这不是一份文档（例如一个错误对象），
  // 交给通用文本渲染，而不是画一个「暂无可预览内容」的空壳
  if (windows.length === 0 && typeof record.content !== 'string') return null;

  const startLine = toLineNumber(record.start_line);
  const endLine = toLineNumber(record.end_line);
  const totalLines = toLineNumber(record.total_lines);
  const moreText = record.has_more_after
    ? `，下一段 offset ${String(record.next_offset ?? '')}`
    : '';
  const modeText = record.match_mode === 'regex' ? '正则' : '关键词';

  return {
    summary:
      mode === 'find'
        ? `${modeText}查找: ${toLineNumber(record.total_matches)} 处匹配，${windows.length} 个上下文窗口`
        : `打开文档: 第 ${startLine}-${endLine} 行 / 共 ${totalLines} 行${moreText}`,
    fileId: typeof record.file_id === 'string' ? record.file_id : '',
    windows,
  };
}

/** 窗口标题：有行号时带区间。 */
export function windowTitle(window: DocumentWindow, index: number): string {
  return window.startLine || window.endLine
    ? `窗口 ${index + 1}: 第 ${window.startLine}-${window.endLine} 行`
    : `窗口 ${index + 1}`;
}

/** 窗口的稳定 key。 */
export function windowKey(window: DocumentWindow, index: number): string {
  return `${window.startLine}-${window.endLine}-${index}`;
}

/** 行首 `12\t正文` 里的行号；没有则返回 null。 */
export function lineNumberOf(line: string): number | null {
  const match = /^\s*(\d+)\t/.exec(line);

  return match ? Number(match[1]) : null;
}

/** 这一行是否落在命中行里。 */
export function isMatchedLine(line: string, matchedLines: number[]): boolean {
  const number = lineNumberOf(line);

  return number !== null && matchedLines.includes(number);
}

/** 从工具调用取预览；不是可预览结构时返回 `null`。 */
export function buildDocumentPreview(
  toolCall: ChatToolCall,
  mode: PreviewMode,
): DocumentPreview | null {
  return parseDocumentPreview(toolCall.tool_call_result?.content, mode);
}
