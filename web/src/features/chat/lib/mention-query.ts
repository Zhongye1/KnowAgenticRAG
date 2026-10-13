/**
 * 提及候选的过滤与分组。
 *
 * 事实源是 `MessageInputComponent` 里活的实现：本地过滤是**多字段**匹配（标签、值、
 * 描述、资源 id、令牌文本、类型），防抖 250ms；本地文件只在有查询词时才参与，避免
 * 一打出 `@` 就把整个文件列表铺满。
 *
 * 参照里另有一个 `composables/useMention.js`（162 行），只按标签与值两个字段匹配，
 * 且全仓没有任何消费者——那是死代码，本仓不搬。
 */
import type { MentionResourceItem } from './mention-resources';

/** 远程文件搜索的防抖时长；与参照同值。 */
export const MENTION_SEARCH_DEBOUNCE_MS = 250;

export type MentionGroups = {
  files: MentionResourceItem[];
  knowledgeBases: MentionResourceItem[];
  mcps: MentionResourceItem[];
  skills: MentionResourceItem[];
  subagents: MentionResourceItem[];
};

const EMPTY_GROUPS = (): MentionGroups => ({
  files: [],
  knowledgeBases: [],
  mcps: [],
  skills: [],
  subagents: [],
});

/**
 * 按查询词过滤候选项；空查询返回原列表。
 *
 * 匹配字段与参照一致：任意一个字段包含查询词即命中（大小写不敏感）。这样用户既能按
 * 显示名找，也能按 id、路径或类型找。
 */
export function filterMentionItems(
  items: MentionResourceItem[],
  query: string,
): MentionResourceItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;

  return items.filter((item) =>
    [item.label, item.value, item.description, item.resourceId, item.tokenLabel, item.type]
      .some((field) => String(field ?? '').toLowerCase().includes(needle)),
  );
}

/** 按类型分组；未登记的类型被丢掉。 */
export function groupMentionItems(
  items: MentionResourceItem[],
): MentionGroups {
  const groups = EMPTY_GROUPS();

  for (const item of items) {
    switch (item.type) {
      case 'file':
        groups.files.push(item);
        break;
      case 'knowledge':
        groups.knowledgeBases.push(item);
        break;
      case 'mcp':
        groups.mcps.push(item);
        break;
      case 'skill':
        groups.skills.push(item);
        break;
      case 'subagent':
        groups.subagents.push(item);
        break;
      default:
        break;
    }
  }

  return groups;
}

/**
 * 一次过滤：配置类候选始终过滤，本地文件只在有查询词时参与。
 *
 * 文件列表单独传是因为它随查询远程变化，而配置类候选是固定的本地列表。
 */
export function buildMentionGroups(
  query: string,
  configItems: MentionResourceItem[],
  localFiles: MentionResourceItem[],
): MentionGroups {
  const groups = groupMentionItems(filterMentionItems(configItems, query));
  groups.files = query.trim()
    ? filterMentionItems(localFiles, query)
    : [];

  return groups;
}

/** 分组里是否一个候选都没有；用来决定弹窗是否展示。 */
export function isEmptyMentionGroups(groups: MentionGroups): boolean {
  return (
    groups.files.length === 0 &&
    groups.knowledgeBases.length === 0 &&
    groups.mcps.length === 0 &&
    groups.skills.length === 0 &&
    groups.subagents.length === 0
  );
}

/**
 * 键盘上下移动选中项；越界时停在边界而不是回绕。
 *
 * 回绕会让「按一下下键」从第一项跳到最末项，用户会以为候选消失了。
 */
export function moveMentionSelection(
  currentIndex: number,
  delta: number,
  total: number,
): number {
  if (total <= 0) return 0;

  return Math.max(0, Math.min(currentIndex + delta, total - 1));
}

/** 分组标题；与参照同文案（MCP / Skills / Subagents 保持英文）。 */
export const MENTION_GROUP_TITLES: Array<{
  key: keyof MentionGroups;
  title: string;
}> = [
  { key: 'files', title: '文件' },
  { key: 'knowledgeBases', title: '知识库' },
  { key: 'mcps', title: 'MCP' },
  { key: 'skills', title: 'Skills' },
  { key: 'subagents', title: 'Subagents' },
];

export type FlatMentionItem = {
  item: MentionResourceItem;
  /** 在扁平列表里的下标；键盘上下移动用的就是它。 */
  index: number;
};

/**
 * 把分组压平成一个列表。
 *
 * 键盘导航用的是「整体第几项」而不是「第几组第几项」：用户按上下键时不会意识到分组
 * 边界，所以活动下标必须在同一个序列里连续。
 */
export function flattenMentionGroups(
  groups: MentionGroups,
): FlatMentionItem[] {
  const flat: FlatMentionItem[] = [];

  for (const { key } of MENTION_GROUP_TITLES) {
    for (const item of groups[key]) {
      flat.push({ item, index: flat.length });
    }
  }

  return flat;
}
