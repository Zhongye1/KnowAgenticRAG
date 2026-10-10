/**
 * 技能切片的查询装配。
 *
 * 面板与详情页共用同一份列表查询（两个前缀各一份）：列表页读卡片投影，
 * 详情页从管理投影里按 slug 找（后端没有单条 GET）。写操作后由调用点失效
 * `skillKeys.all`，让列表、详情与依赖候选一起收敛。
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { skillApi, type SkillAccessLevel } from '../api/skill-api';
import { SKILL_MD } from '../lib/skill-files';

export const skillKeys = {
  all: ['skills'] as const,
  cards: () => [...skillKeys.all, 'cards'] as const,
  managed: () => [...skillKeys.all, 'managed'] as const,
  shareTargets: () => [...skillKeys.all, 'share-targets'] as const,
  tree: (slug: string) => [...skillKeys.all, 'tree', slug] as const,
  dependencyOptions: (slug?: string) =>
    [...skillKeys.all, 'dependency-options', slug ?? ''] as const,
};

/** 管理页卡片（`GET /api/skills`）：个人 + 共享 + 内置，一次全量。 */
export const useSkillCards = () =>
  useQuery({
    queryKey: skillKeys.cards(),
    queryFn: () => skillApi.listSkillCards(),
  });

/** 管理投影（`GET /api/system/skills`）：详情页的数据来源。 */
export const useManagedSkills = () =>
  useQuery({
    queryKey: skillKeys.managed(),
    queryFn: () => skillApi.listManagedSkills(),
  });

/** 共享范围的可选部门与用户（变动很少，缓存久一点）。 */
export const useSkillShareTargets = () =>
  useQuery({
    queryKey: skillKeys.shareTargets(),
    queryFn: () => skillApi.listShareTargets(),
    staleTime: 5 * 60 * 1000,
  });

/** 技能目录树；只对已安装的技能开查询。 */
export const useSkillTree = (slug: string, enabled = true) =>
  useQuery({
    queryKey: skillKeys.tree(slug),
    queryFn: () => skillApi.getTree(slug),
    enabled: enabled && !!slug,
  });

/** 读取一个文本文件；`path` 为空或指向目录时不发请求。 */
export const useSkillFile = (slug: string, path: string, enabled = true) =>
  useQuery({
    queryKey: [...skillKeys.all, 'file', slug, path],
    queryFn: () => skillApi.getFile(slug, path),
    enabled: enabled && !!slug && !!path,
    retry: false,
  });

/**
 * SKILL.md 预览。
 *
 * 个人技能不在管理端技能列表（`system/skills`）里，读文件走个人端点；失败与否由界面显式呈现
 * （读不到就说读不到，不显示成空文档）。
 */
export const useSkillPreviewFile = (
  skill: { slug: string; source_scope?: string } | null,
) =>
  useQuery({
    queryKey: [
      ...skillKeys.all,
      'preview',
      skill?.slug ?? '',
      skill?.source_scope ?? '',
    ],
    queryFn: () =>
      skill?.source_scope === 'personal'
        ? skillApi.getPersonalFile(skill.slug, SKILL_MD)
        : skillApi.getFile(skill?.slug ?? '', SKILL_MD),
    enabled: !!skill?.slug,
    retry: false,
  });

/** 依赖候选；`slug` 只用于把当前技能排除。 */
export const useSkillDependencyOptions = (slug?: string, enabled = true) =>
  useQuery({
    queryKey: skillKeys.dependencyOptions(slug),
    queryFn: () => skillApi.getDependencyOptions(slug),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

/** 详情页按 slug 取记录；找不到返回 null（页面据此给「未找到」）。 */
export const useSkillBySlug = (slug: string) => {
  const query = useManagedSkills();
  return {
    query,
    skill:
      (query.data?.skills ?? []).find((item) => item.slug === slug) ?? null,
    allowedAccessLevels:
      query.data?.allowedAccessLevels ?? (['user'] as SkillAccessLevel[]),
  };
};

/** 失效技能相关的全部查询；写操作后统一调用。 */
export const useInvalidateSkills = () => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: skillKeys.all });
  };
};
