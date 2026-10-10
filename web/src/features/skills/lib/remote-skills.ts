/**
 * 远程安装的选择规则。
 *
 * 两条入口：「按仓库拉取」（`POST /api/skills/remote/list` 列出一个来源里的全部 Skill）
 * 与「全局搜索发现」（`POST /api/skills/remote/search`）。两者合成同一种解析请求
 * `RemoteRequest[]` 交给安装流：搜索命中的每条结果自带 `source`（`owner/repo`），因此
 * 按来源分组后逐个 `POST /api/skills/remote/prepare`。
 */
import type { RemoteSkillHit, RemoteSkillOption } from '../api/skill-api';
import type { RemoteRequest } from './install-flow';

export type RemoteTab = 'repo' | 'search';

/** 历史来源的 localStorage key。 */
export const REPO_HISTORY_KEY = 'ars_skill_remote_repo_history';
export const MAX_REPO_HISTORY = 10;

/** 仓库内的本地过滤：匹配 name 与 description。 */
export const filterRepoSkills = (
  options: RemoteSkillOption[],
  keyword: string,
): RemoteSkillOption[] => {
  const query = keyword.trim().toLowerCase();
  if (!query) return options;
  return options.filter(
    (item) =>
      item.name.toLowerCase().includes(query) ||
      (item.description ?? '').toLowerCase().includes(query),
  );
};

/** 反选：只在当前可见（已过滤）的范围内翻转。 */
export const invertRepoSelection = (
  visible: RemoteSkillOption[],
  selected: string[],
): string[] => {
  const current = new Set(selected);
  return visible
    .filter((item) => !current.has(item.name))
    .map((item) => item.name);
};

/** 搜索结果的身份：同名 Skill 可能来自不同来源。 */
export const hitKey = (hit: RemoteSkillHit): string =>
  `${hit.source}@${hit.name}`;

export const isHitSelected = (
  selected: RemoteSkillHit[],
  hit: RemoteSkillHit,
): boolean => selected.some((item) => hitKey(item) === hitKey(hit));

export const toggleHit = (
  selected: RemoteSkillHit[],
  hit: RemoteSkillHit,
): RemoteSkillHit[] =>
  isHitSelected(selected, hit)
    ? selected.filter((item) => hitKey(item) !== hitKey(hit))
    : [...selected, hit];

export const invertHitSelection = (
  hits: RemoteSkillHit[],
  selected: RemoteSkillHit[],
): RemoteSkillHit[] => hits.filter((hit) => !isHitSelected(selected, hit));

/** 按仓库拉取：一个来源一次请求，明细用于进度与确认列表的展示。 */
export const buildRepoRequests = (
  source: string,
  selectedNames: string[],
  options: RemoteSkillOption[],
): RemoteRequest[] => {
  const chosen = options.filter((item) => selectedNames.includes(item.name));
  if (!chosen.length) return [];
  return [
    {
      source,
      skills: chosen.map((item) => item.name),
      skillDetails: chosen.map((item) => ({
        slug: item.name,
        name: item.name,
        description: item.description ?? '',
      })),
    },
  ];
};

/** 全局搜索：按 `source` 分组，一次请求一个来源。 */
export const buildSearchRequests = (
  selected: RemoteSkillHit[],
): RemoteRequest[] => {
  const grouped = new Map<string, RemoteSkillHit[]>();
  selected.forEach((hit) => {
    const list = grouped.get(hit.source) ?? [];
    list.push(hit);
    grouped.set(hit.source, list);
  });
  return [...grouped].map(([source, hits]) => ({
    source,
    skills: hits.map((hit) => hit.name),
    skillDetails: hits.map((hit) => ({
      slug: hit.name,
      name: hit.name,
      description: hit.installs ?? '',
    })),
  }));
};

/** 弹窗底栏的一句话摘要。 */
export const remoteSelectionSummary = (
  tab: RemoteTab,
  discovered: number,
  selected: number,
): string => {
  if (tab === 'repo') {
    if (!discovered) return '请先拉取仓库中的 Skill';
    return `已选 ${selected} / 共发现 ${discovered} 个 Skill`;
  }
  if (!discovered) return '请输入关键词查找 Skill';
  return `已选 ${selected} / 共找到 ${discovered} 个 Skill`;
};

/** 记一条来源历史：去重、置顶、最多 10 条。 */
export const addRepoHistory = (history: string[], source: string): string[] => {
  const trimmed = source.trim();
  if (!trimmed) return history;
  return [trimmed, ...history.filter((item) => item !== trimmed)].slice(
    0,
    MAX_REPO_HISTORY,
  );
};

export const removeRepoHistory = (
  history: string[],
  source: string,
): string[] => history.filter((item) => item !== source);

/** 读历史；损坏的 JSON 当没有历史，不让弹窗打不开。 */
export const readRepoHistory = (): string[] => {
  try {
    const raw = window.localStorage.getItem(REPO_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
};

export const writeRepoHistory = (history: string[]): void => {
  try {
    if (history.length === 0) {
      window.localStorage.removeItem(REPO_HISTORY_KEY);
      return;
    }
    window.localStorage.setItem(REPO_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // 存不下就算了：历史只是便利功能，不挡安装
  }
};
