/**
 * 详情页的能力判定与依赖分组。
 *
 * 个人技能不在管理端技能列表（`system/skills`）里，因此详情页只服务共享与内置技能；
 * 内置技能的文件与依赖由系统维护，只读技能只给查看。授权边界仍在后端。
 */
import type { ManagedSkill, SkillDependencyOptions } from '../api/skill-api';
import { sourceTypeLabel } from './skill-view';

/** 详情页的三个分区。 */
export type DetailTab = 'editor' | 'settings' | 'dependencies';

/** `dir_path` 为空说明这条记录没有落盘的技能目录，没有可管理的内容。 */
export const isInstalledSkill = (
  skill?: ManagedSkill | null,
): skill is ManagedSkill => !!skill?.dir_path;

export const isBuiltinInstalledSkill = (skill?: ManagedSkill | null): boolean =>
  isInstalledSkill(skill) && skill.source_type === 'builtin';

/** 后端按资源权限算；缺失按只读。 */
export const canManageManagedSkill = (skill?: ManagedSkill | null): boolean =>
  skill?.can_manage === true;

export const isReadOnlySkill = (skill?: ManagedSkill | null): boolean =>
  isInstalledSkill(skill) && !canManageManagedSkill(skill);

/** 内置技能的文件与依赖是系统维护的，管理员也不能在界面上改。 */
export const canEditSkillFiles = (skill?: ManagedSkill | null): boolean =>
  canManageManagedSkill(skill) && !isBuiltinInstalledSkill(skill);

export const canEditSkillDependencies = (
  skill?: ManagedSkill | null,
): boolean => canEditSkillFiles(skill);

/** 导出要求已安装且有管理权限（后端 `export_skill_zip` 同样要求可管理）。 */
export const canExportSkill = (skill?: ManagedSkill | null): boolean =>
  isInstalledSkill(skill) && canManageManagedSkill(skill);

/** 内置技能不能删除（后端同样拒绝）。 */
export const canDeleteManagedSkill = (skill?: ManagedSkill | null): boolean =>
  canExportSkill(skill) && !isBuiltinInstalledSkill(skill);

/** 头部副标题：来源 + 禁用状态。 */
export const skillStatusLabel = (skill?: ManagedSkill | null): string => {
  if (!skill) return '';
  const label = sourceTypeLabel(skill.source_type);
  return skill.enabled === false ? `${label} · 已禁用` : label;
};

/**
 * 依赖分组：三组各自对应一个请求体字段。
 *
 * 工具候选带展示名（后端给 `{slug,name}`），MCP 与 Skill 只有标识，因此候选项统一折成
 * `{label,value}`。
 */
export type DependencyGroupKey = 'tools' | 'mcps' | 'skills';

export type DependencyOption = { label: string; value: string };

export type DependencyGroup = {
  key: DependencyGroupKey;
  formKey: 'tool_dependencies' | 'mcp_dependencies' | 'skill_dependencies';
  title: string;
  shortTitle: string;
  description: string;
  dropdownHint: string;
  emptyText: string;
  options: DependencyOption[];
};

export const buildDependencyGroups = (
  options?: SkillDependencyOptions | null,
  currentSlug?: string,
): DependencyGroup[] => {
  const tools = (options?.tools ?? []).map((tool) => ({
    label: tool.name || tool.slug,
    value: tool.slug,
  }));
  const mcps = (options?.mcps ?? []).map((name) => ({
    label: name,
    value: name,
  }));
  const skills = (options?.skills ?? [])
    .filter((slug) => slug !== currentSlug)
    .map((slug) => ({ label: slug, value: slug }));

  return [
    {
      key: 'tools',
      formKey: 'tool_dependencies',
      title: '工具依赖',
      shortTitle: '工具',
      description: '声明此 Skill 运行时需要调用的工具能力。',
      dropdownHint: '选择后 Agent 运行时会同时加载这些工具。',
      emptyText: '未声明工具依赖',
      options: tools,
    },
    {
      key: 'mcps',
      formKey: 'mcp_dependencies',
      title: 'MCP 依赖',
      shortTitle: 'MCP',
      description: '声明此 Skill 依赖的 MCP 服务。',
      dropdownHint: '选择此 Skill 运行时需要的 MCP 服务。',
      emptyText: '未声明 MCP 依赖',
      options: mcps,
    },
    {
      key: 'skills',
      formKey: 'skill_dependencies',
      title: 'Skill 依赖',
      shortTitle: 'Skill',
      description: '声明需要一起加载的其他 Skill。',
      dropdownHint: '依赖 Skill 会随当前 Skill 一起进入运行时可读范围。',
      emptyText: '未声明 Skill 依赖',
      options: skills,
    },
  ];
};

/** 依赖候选的本地过滤：label 与 value 都匹配。 */
export const filterDependencyOptions = (
  group: DependencyGroup,
  keyword: string,
): DependencyOption[] => {
  const query = keyword.trim().toLowerCase();
  if (!query) return group.options;
  return group.options.filter((option) =>
    `${option.label} ${option.value}`.toLowerCase().includes(query),
  );
};

/** 已选项的展示名：候选里消失的旧依赖原样显示标识，不隐藏。 */
export const dependencyLabel = (
  group: DependencyGroup,
  value: string,
): string =>
  group.options.find((option) => option.value === value)?.label ?? value;
