/**
 * 会话搜索的展示逻辑。
 *
 * 逐条移植上游 `GlobalSearchModal.vue` 的三个纯函数：片段高亮切片、结果日期格式、
 * 最近会话的时间分组。上游用 dayjs + 上海时区插件，本仓不引日期库，改用固定 +08:00
 * 偏移（上海自 1991 年起没有夏令时）。
 */
import type { ChatThread, ThreadSearchItem } from '../api/agent-api';

/** 与上游一致的默认视图上限。 */
export const RECENT_THREAD_LIMIT = 30;
/** 每页结果条数，与上游 `CONVERSATION_SEARCH_LIMIT` 一致。 */
export const CONVERSATION_SEARCH_LIMIT = 20;

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 把后端给的 UTC 时间串换算到上海时钟；之后一律用 getUTC* 读取。 */
const toShanghaiDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() + SHANGHAI_OFFSET_MS);
};

/** 一条片段被切成的高亮段：`match` 为真时用 `<mark>` 渲染。 */
export type SnippetSegment = { text: string; match: boolean };

/**
 * 按查询词切片段，大小写不敏感、纯子串匹配（上游同规则：不分词、不正则、标题不高亮）。
 * 空内容或空查询时返回整段非高亮。
 */
export const splitSnippet = (
  content: string,
  query: string,
): SnippetSegment[] => {
  const text = content ?? '';
  const needle = (query ?? '').trim();
  if (!text || !needle) return [{ text, match: false }];

  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const segments: SnippetSegment[] = [];
  let cursor = 0;
  let index = lowerText.indexOf(lowerNeedle);

  while (index >= 0) {
    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), match: false });
    }
    segments.push({
      text: text.slice(index, index + needle.length),
      match: true,
    });
    cursor = index + needle.length;
    index = lowerText.indexOf(lowerNeedle, cursor);
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments;
};

/** 结果行右侧的日期：当年显示 `M月D日`，跨年显示 `YYYY-MM-DD`。 */
export const formatResultDate = (
  value?: string | null,
  now: Date = new Date(),
): string => {
  const parsed = toShanghaiDate(value);
  if (!parsed) return '';
  const month = parsed.getUTCMonth() + 1;
  const day = parsed.getUTCDate();
  const nowShanghai = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  if (parsed.getUTCFullYear() === nowShanghai.getUTCFullYear()) {
    return `${month}月${day}日`;
  }
  return `${parsed.getUTCFullYear()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** 最近会话的时间分组标签（上游同边界：≤7 天、≤30 天、更早）。 */
export const getRecentGroupLabel = (
  value?: string | null,
  now: Date = new Date(),
): string => {
  const parsed = toShanghaiDate(value);
  if (!parsed) return '更早';
  const startOfDay = (date: Date) =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const diffDays = Math.floor(
    (startOfDay(new Date(now.getTime() + SHANGHAI_OFFSET_MS)) -
      startOfDay(parsed)) /
      (24 * 60 * 60 * 1000),
  );
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

/** 结果行要展示的片段：上游只取第一条。 */
export const getResultSnippet = (item: ThreadSearchItem): string =>
  item.snippets?.[0]?.content ?? '';
