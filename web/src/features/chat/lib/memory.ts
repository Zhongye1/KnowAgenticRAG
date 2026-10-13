/**
 * 记忆工具（`remember_memory`）的展示。
 *
 * 参数侧给出内容预览与「是否纠正」；结果侧按 `status` 给文案，并把路径、行号区间与
 * 字节数拼成元信息。状态未知时不猜文案——只把结果里有的信息展示出来。
 */
import type { ChatToolCall } from '../api/agent-api';
import { parseToolCallArgs, parseToolCallResultForDisplay } from './tool-call';

/** 头部预览的截断长度；与参照同值。 */
export const MEMORY_PREVIEW_MAX_LENGTH = 60;

export type MemoryView = {
  /** 空白折叠后的内容预览。 */
  contentPreview: string;
  /** 参数里带了 `replaces`，是纠正而不是追加。 */
  isReplace: boolean;
  /** 结果状态对应的文案；状态未知或没有结果时为空串。 */
  statusText: string;
  /** 行号标签，如 `L3` 或 `L3-7`；没有时为空串。 */
  lineTag: string;
  /** `路径 · 第 N 行 · N B`；都没有时为空串。 */
  meta: string;
  /** 结果里有结构化内容。 */
  hasResult: boolean;
  /** 结果状态为 `error`。 */
  isError: boolean;
};

/** 空白折叠后截断到 60 个字符，超出加省略号。 */
export function memoryContentPreview(content: unknown): string {
  const collapsed = String(content ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  // 按 Unicode 切分：参照用 String.slice，会把代理对截成半个字符
  const characters = Array.from(collapsed);

  return characters.length > MEMORY_PREVIEW_MAX_LENGTH
    ? `${characters.slice(0, MEMORY_PREVIEW_MAX_LENGTH).join('')}…`
    : collapsed;
}

/** 按工具调用生成记忆视图。 */
export function buildMemoryView(toolCall: ChatToolCall): MemoryView {
  const args = parseToolCallArgs(toolCall);
  const contentPreview = memoryContentPreview(args.content);
  const isReplace = Boolean(args.replaces);

  const result = parseToolCallResultForDisplay(toolCall) as {
    status?: unknown;
    error?: unknown;
    path?: unknown;
    start_line?: unknown;
    end_line?: unknown;
    size?: unknown;
  } | null;

  const status = typeof result?.status === 'string' ? result.status : '';
  const statusText =
    status === 'updated'
      ? isReplace
        ? '记忆已纠正更新'
        : '记忆已追加到末尾'
      : status === 'unchanged'
        ? '记忆内容已存在，未变更'
        : status === 'error'
          ? `记忆更新失败：${String(result?.error ?? '未知错误')}`
          : '';

  const start = result?.start_line;
  const end = result?.end_line;
  const lineTag =
    typeof start === 'number' && start > 0
      ? start === end
        ? `L${start}`
        : `L${start}-${end}`
      : '';

  const parts: string[] = [];
  if (typeof result?.path === 'string' && result.path) parts.push(result.path);
  if (typeof start === 'number' && start > 0 && typeof end === 'number') {
    parts.push(start === end ? `第 ${start} 行` : `第 ${start}-${end} 行`);
  }
  if (typeof result?.size === 'number') parts.push(`${result.size} B`);

  return {
    contentPreview,
    isReplace,
    statusText,
    lineTag,
    meta: parts.join(' · '),
    hasResult: Boolean(result),
    isError: status === 'error',
  };
}
