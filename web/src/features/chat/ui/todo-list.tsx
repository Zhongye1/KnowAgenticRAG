/**
 * 任务清单（`write_todos`）的展示。
 *
 * 每条待办一个状态图标加一行名称；名称超过 20 个字符由解析层截断，完整内容留在
 * `title` 上。列表为空时给一句空态。
 */
import {
  CheckCircle2,
  CircleHelp,
  Clock,
  LoaderCircle,
  XCircle,
} from 'lucide-react';

import type { TodoItem, TodoStatus } from '../lib/todo-list';

const STATUS_ICONS: Record<TodoStatus, typeof CheckCircle2> = {
  completed: CheckCircle2,
  in_progress: LoaderCircle,
  pending: Clock,
  cancelled: XCircle,
  unknown: CircleHelp,
};

const STATUS_CLASSES: Record<TodoStatus, string> = {
  completed: 'text-[var(--main-600)]',
  in_progress: 'text-[var(--main-600)] animate-spin',
  pending: 'text-[var(--gray-500)]',
  cancelled: 'text-[var(--gray-500)]',
  unknown: 'text-[var(--gray-500)]',
};

type TodoListProps = {
  items: TodoItem[];
};

export const TodoList = ({ items }: TodoListProps) => {
  if (items.length === 0) {
    return (
      <p className="py-3 text-center text-xs text-[var(--gray-500)]">
        暂无待办事项
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, index) => {
        const Icon = STATUS_ICONS[item.status];

        return (
          <li
            key={`${item.title}-${index}`}
            className="flex items-center gap-2"
            data-status={item.status}
          >
            <Icon
              className={`size-4 shrink-0 ${STATUS_CLASSES[item.status]}`}
              aria-hidden
            />
            <span
              className="truncate text-[var(--gray-800)]"
              title={item.title}
            >
              {item.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
};
