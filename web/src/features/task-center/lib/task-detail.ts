/**
 * 任务详情弹窗的行内容。
 *
 * 详情比列表多出 `payload` 与 `result`：前者是提交时的参数（哪个知识库、哪些文件），
 * 后者是执行结果，两者都可能很大，因此只在详情里按 JSON 折叠展示，列表项不带。
 */
import { formatMinuteStamp } from '@/shared/lib';

import type { TaskDetail } from '../api/task-center-api';
import {
  formatTaskDuration,
  taskStatusLabel,
  taskTypeLabel,
} from './task-status';

export type TaskDetailRow = { label: string; value: string };

/** 有内容的字段才展示；空串、空数组、空对象都算没有内容。 */
export const hasContent = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

/** JSON 折叠文本；循环引用等无法序列化的值退化成 `String()`，不在这里抛。 */
export const prettyJson = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};

export const buildTaskDetailRows = (task: TaskDetail): TaskDetailRow[] => [
  { label: '类型', value: taskTypeLabel(task.type) },
  { label: '状态', value: taskStatusLabel(task.status) },
  { label: '进度', value: `${Math.round(task.progress || 0)}%` },
  { label: '任务号', value: task.id },
  { label: '创建时间', value: formatMinuteStamp(task.created_at) },
  {
    label: '开始时间',
    value: task.started_at ? formatMinuteStamp(task.started_at) : '-',
  },
  {
    label: '完成时间',
    value: task.completed_at ? formatMinuteStamp(task.completed_at) : '-',
  },
  { label: '耗时', value: formatTaskDuration(task) ?? '-' },
  { label: '描述', value: task.message || '-' },
  { label: '错误', value: task.error || '-' },
];
