/**
 * 技能面板的展示与能力判定（搜索匹配、分组、卡片标签、来源文案、图标与权限）。
 *
 * `can_manage` 缺失按「不可管理」处理：后端两个列表都会下发该字段，缺失只可能是契约
 * 漂移，宁可少给入口。授权边界始终在后端。
 */
import {
  BookOpenText,
  EthernetPort,
  FileText,
  FlaskConical,
  Globe,
  Image,
  Microscope,
  Paintbrush,
  Sheet,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';

import type { SkillCard } from '../api/skill-api';
import type { ShareConfig } from '@/shared/lib/share-config';

export type SkillGroupKey = 'personal' | 'builtin' | 'shared';

export type SkillGroup = {
  key: SkillGroupKey;
  title: string;
  skills: SkillCard[];
};

const GROUP_TITLES: Record<SkillGroupKey, string> = {
  personal: '个人技能',
  builtin: '内置',
  shared: '共享',
};

/** 卡片标题格式化：分隔符折成空格、逐词首字母大写（缩略语原样）。 */
export const formatSkillTitle = (value: unknown): string => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      /^[A-Z0-9]{2,3}$/.test(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(' ');
};

/** 按 slug 关键词给图标，认不出用通用图标。 */
const SKILL_ICON_RULES: Array<{ keywords: string[]; icon: LucideIcon }> = [
  { keywords: ['design'], icon: Paintbrush },
  { keywords: ['document', 'pdf', 'docx', 'docs', 'wps'], icon: FileText },
  { keywords: ['knowledge'], icon: BookOpenText },
  { keywords: ['research'], icon: Microscope },
  { keywords: ['xlsx', 'excel', 'sheet'], icon: Sheet },
  { keywords: ['image'], icon: Image },
  { keywords: ['api'], icon: EthernetPort },
  { keywords: ['web', 'html'], icon: Globe },
  { keywords: ['test'], icon: FlaskConical },
];

export const getSkillIcon = (slug: unknown): LucideIcon => {
  const normalized = String(slug ?? '').toLowerCase();
  return (
    SKILL_ICON_RULES.find((rule) =>
      rule.keywords.some((keyword) => normalized.includes(keyword)),
    )?.icon ?? WandSparkles
  );
};

/** 来源类型文案（卡片预览与详情页头部）。 */
export const sourceTypeLabel = (sourceType: unknown): string => {
  if (sourceType === 'personal') return '个人技能';
  if (sourceType === 'builtin') return '内置';
  if (sourceType === 'remote') return '远程添加';
  return '上传';
};

/** 共享范围标签：读/管两个范围压成一句。 */
export const shareConfigLabel = (
  shareConfig?: Partial<ShareConfig> | null,
): string => {
  const config = shareConfig ?? {};
  const readScope =
    config.version === 2 ? config.read_scope : (config as never);
  const manageScope = config.manage_scope;
  if (config.version === 2 && !config.read_scope && !manageScope) {
    return '仅所有者';
  }
  const scopeLabel = (
    scope?: {
      access_level?: string;
      department_ids?: unknown[];
      user_uids?: unknown[];
    } | null,
  ) => {
    if (!scope) return '无';
    if (scope.access_level === 'global') return '全局';
    if (scope.access_level === 'department') {
      return `部门(${scope.department_ids?.length ?? 0})`;
    }
    return `用户(${scope.user_uids?.length ?? 0})`;
  };
  return manageScope
    ? `读${scopeLabel(readScope)} · 管${scopeLabel(manageScope)}`
    : `只读${scopeLabel(readScope)}`;
};

/** 搜索：匹配 name / slug / description（大小写不敏感）。 */
export const matchesSkillSearch = (
  skill: SkillCard,
  keyword: string,
): boolean => {
  const query = keyword.trim().toLowerCase();
  if (!query) return true;
  return [skill.name, skill.slug, skill.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(query);
};

export const isPersonalSkill = (skill: SkillCard): boolean =>
  skill.source_scope === 'personal';

export const isBuiltinSkill = (skill: SkillCard): boolean =>
  skill.source_scope === 'builtin' || skill.source_type === 'builtin';

/** 非内置、非个人即共享；未知 `source_scope` 归到这里（后端只有这三种）。 */
export const isSharedSkill = (skill: SkillCard): boolean =>
  !isPersonalSkill(skill) && !isBuiltinSkill(skill);

/** 分组：个人 / 内置 / 共享，空组由 `visibleSkillGroups` 隐藏。 */
export const groupSkills = (
  skills: SkillCard[],
  keyword = '',
): SkillGroup[] => {
  const matched = skills.filter((skill) => matchesSkillSearch(skill, keyword));
  return (
    [
      ['personal', matched.filter(isPersonalSkill)],
      ['builtin', matched.filter(isBuiltinSkill)],
      ['shared', matched.filter(isSharedSkill)],
    ] as Array<[SkillGroupKey, SkillCard[]]>
  ).map(([key, items]) => ({ key, title: GROUP_TITLES[key], skills: items }));
};

/** 空组不渲染。 */
export const visibleSkillGroups = (groups: SkillGroup[]): SkillGroup[] =>
  groups.filter((group) => group.skills.length > 0);

/** 卡片标签：个人与共享两套口径，`overrides_shared` / `shadowed_by_personal` 是橙色提示。 */
export const skillCardTags = (skill: SkillCard): string[] => {
  if (isPersonalSkill(skill)) {
    return ['个人技能', ...(skill.overrides_shared ? ['覆盖共享版本'] : [])];
  }
  return [
    shareConfigLabel(skill.share_config),
    ...(skill.shadowed_by_personal ? ['已被个人版本覆盖'] : []),
  ];
};

/** 权限判定：入口隐藏的依据，授权边界在后端。 */
export const canManageSkill = (skill: SkillCard): boolean =>
  skill.can_manage === true;

/**
 * 可删除 / 可批量选择的技能：有管理权限、非内置、非个人。
 *
 * 内置技能由系统维护（后端也拒绝删除），个人技能不在共享库里、不走批量删除端点。
 */
export const isDeletableSkill = (skill: SkillCard): boolean =>
  canManageSkill(skill) && !isBuiltinSkill(skill) && !isPersonalSkill(skill);

/** 卡片上的启停开关只对非个人技能出现（个人技能没有启用状态）。 */
export const canToggleSkillEnabled = (skill: SkillCard): boolean =>
  !isPersonalSkill(skill);

/** 批量删除的候选集合（搜索过滤之后）。 */
export const deletableSkills = (skills: SkillCard[]): SkillCard[] =>
  skills.filter(isDeletableSkill);

/** 反选：只在候选集合内翻转，避免把不可删的技能选进来。 */
export const invertSelection = (
  candidates: SkillCard[],
  selected: string[],
): string[] => {
  const current = new Set(selected);
  return candidates
    .filter((skill) => !current.has(skill.slug))
    .map((skill) => skill.slug);
};

/** 后端 `delete-batch` 的 `max_length`：超过会在 pydantic 层 422，界面先拦。 */
export const MAX_BATCH_DELETE = 50;

/** 提交前再过滤一次：选择与它所属的列表可能已经不同步（搜索词变了）。 */
export const selectedDeletableSlugs = (
  skills: SkillCard[],
  selected: string[],
): string[] => {
  const wanted = new Set(selected);
  return skills
    .filter((skill) => wanted.has(skill.slug) && isDeletableSkill(skill))
    .map((skill) => skill.slug);
};
