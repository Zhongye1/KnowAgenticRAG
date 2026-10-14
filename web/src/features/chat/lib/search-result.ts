/**
 * 会话搜索的展示逻辑。
 *
 * 只留会话这一侧：片段高亮切片与结果日期格式在 `@/shared/lib`（文件搜索共用），
 * 这里只保留默认视图上限、最近会话的时间分组与结果片段取值。
 */
import { toShanghaiDate } from '@/shared/lib';

import type { ChatThread, ThreadSearchItem } from '../api/agent-api';

/** 默认视图上限。 */
export const RECENT_THREAD_LIMIT = 30;
/** 每页结果条数。 */
export const CONVERSATION_SEARCH_LIMIT = 20;

/** 最近会话的时间分组标签：≤7 天、≤30 天、更早。 */
export const getRecentGroupLabel = (
  value?: string | null,
  now: Date = new Date(),
): string => {
  const parsed = toShanghaiDate(value);
  if (!parsed) return '更早';
  const startOfDay = (date: Date) =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const nowShanghai = toShanghaiDate(now.toISOString());
  const diffDays = nowShanghai
    ? Math.floor(
        (startOfDay(nowShanghai) - startOfDay(parsed)) / (24 * 60 * 60 * 1000),
      )
    : 0;
  if (diffDays <= 7) return '前 7 天';
  if (diffDays <= 30) return '前 30 天';
  return '更早';
};

/** 默认视图的行：分组标题或一条会话。 */
export type RecentRow =
  | { type: 'label'; key: string; label: string }
  | { type: 'thread'; key: string; thread: ChatThread };

/** 按更新时间倒序取最近会话，并插入分组标题。 */
export const groupRecentThreads = (
  threads: ChatThread[],
  now: Date = new Date(),
): RecentRow[] => {
  const sorted = [...threads]
    .sort((left, right) => {
      const first = toShanghaiDate(left.updated_at || left.created_at);
      const second = toShanghaiDate(right.updated_at || right.created_at);
      if (!first && !second) return 0;
      if (!first) return 1;
      if (!second) return -1;
      return second.getTime() - first.getTime();
    })
    .slice(0, RECENT_THREAD_LIMIT);

  const rows: RecentRow[] = [];
  let lastGroup = '';
  for (const thread of sorted) {
    const group = getRecentGroupLabel(
      thread.updated_at || thread.created_at,
      now,
    );
    if (group !== lastGroup) {
      rows.push({ type: 'label', key: `label-${group}`, label: group });
      lastGroup = group;
    }
    rows.push({ type: 'thread', key: thread.id, thread });
  }
  return rows;
};

/** 结果行要展示的片段：只取第一条。 */
export const getResultSnippet = (item: ThreadSearchItem): string =>
  item.snippets?.[0]?.content ?? '';
