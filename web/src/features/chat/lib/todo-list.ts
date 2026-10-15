/** 任务清单（`write_todos`）的解析。 */
import type { ChatToolCall } from '../api/agent-api';
import { parseToolCallArgs } from './tool-call';

/** 名称截断长度。 */
export const TODO_NAME_MAX_LENGTH = 20;

export type TodoStatus =
  'completed' | 'in_progress' | 'pending' | 'cancelled' | 'unknown';

export type TodoItem = {
  status: TodoStatus;
  /** 截断后的展示名。 */
  label: string;
  /** 完整内容，用于悬浮提示。 */
  title: string;
};

const KNOWN_STATUSES: readonly TodoStatus[] = [
  'completed',
  'in_progress',
  'pending',
  'cancelled',
];

function toStatus(value: unknown): TodoStatus {
  return KNOWN_STATUSES.includes(value as TodoStatus)
    ? (value as TodoStatus)
    : 'unknown';
}

/** 按 Unicode 切分截断，避免截断代理对。 */
export function truncateTodoName(content: unknown): string {
  return Array.from(String(content ?? ''))
    .slice(0, TODO_NAME_MAX_LENGTH)
    .join('');
}

/** 把结果内容解析成待办列表；形状不符时返回空数组。 */
export function parseTodoList(content: unknown): TodoItem[] {
  let data: unknown = content;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }

  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { todos?: unknown } | null)?.todos)
      ? ((data as { todos: unknown[] }).todos as unknown[])
      : [];

  return list
    .map((raw) => {
      const item = raw as { content?: unknown; status?: unknown } | null;

      return {
        status: toStatus(item?.status),
        label: truncateTodoName(item?.content),
        title: String(item?.content ?? ''),
      };
    })
    .filter((item) => item.title !== '');
}

/**
 * 头部文案：优先反映结果里的进度——进行中的第一条、其次待处理的第一条、
 * 都没有时用最后一条；结果里没有列表时退到参数。
 */
export function todoHeaderLabel(toolCall: ChatToolCall): string {
  const items = parseTodoList(toolCall.tool_call_result?.content);
  if (items.length > 0) {
    const inProgress = items.find((item) => item.status === 'in_progress');
    if (inProgress) return `进行中: ${inProgress.label}`;

    const pending = items.find((item) => item.status === 'pending');
    if (pending) return `待处理: ${pending.label}`;

    return `更新: ${items[items.length - 1]!.label}`;
  }

  const args = parseToolCallArgs(toolCall);
  for (const key of ['content', 'action', 'todo']) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}
