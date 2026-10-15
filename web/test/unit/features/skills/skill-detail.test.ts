/**
 * 详情页判定与文件规则的用例（纯逻辑）。
 *
 * 覆盖 `isInstalledSkill` / 内置与只读的能力收敛、头部状态文案、依赖分组与过滤，
 * 以及文件树与 Markdown 判定。
 */
import { describe, expect, it } from 'vitest';

import type { ManagedSkill } from '@/features/skills/api/skill-api';
import {
  buildDependencyGroups,
  canDeleteManagedSkill,
  canEditSkillDependencies,
  canEditSkillFiles,
  canExportSkill,
  canManageManagedSkill,
  dependencyLabel,
  filterDependencyOptions,
  isBuiltinInstalledSkill,
  isInstalledSkill,
  isReadOnlySkill,
  skillStatusLabel,
} from '@/features/skills/lib/skill-detail';
import {
  ancestorPaths,
  collectDirectoryPaths,
  findNode,
  isMarkdownPath,
  SKILL_MD,
  treePaths,
} from '@/features/skills/lib/skill-files';

const skill = (extra: Partial<ManagedSkill> = {}): ManagedSkill =>
  ({
    id: 1,
    slug: 's1',
    name: 's1',
    description: '',
    source_type: 'upload',
    tool_dependencies: [],
    mcp_dependencies: [],
    skill_dependencies: [],
    dir_path: 'shared/s1',
    version: null,
    content_hash: null,
    share_config: { version: 2, read_scope: { access_level: 'global' } },
    enabled: true,
    created_by: 'u-1',
    updated_by: 'u-1',
    created_at: null,
    updated_at: null,
    can_manage: true,
    effective_permission: 'manage',
    is_builtin: false,
    ...extra,
  }) as ManagedSkill;

describe('详情页能力收敛', () => {
  it('dir_path 为空说明没有落盘目录，不算已安装（只看记录存在时本用例必须失败）', () => {
    expect(isInstalledSkill(skill())).toBe(true);
    expect(isInstalledSkill(skill({ dir_path: '' }))).toBe(false);
    expect(isInstalledSkill(null)).toBe(false);
  });

  it('内置技能的文件与依赖由系统维护：管理员也不能编辑，但可以导出（去掉内置判定时本用例必须失败）', () => {
    const builtin = skill({ source_type: 'builtin', is_builtin: true });
    expect(isBuiltinInstalledSkill(builtin)).toBe(true);
    expect(canEditSkillFiles(builtin)).toBe(false);
    expect(canEditSkillDependencies(builtin)).toBe(false);
    expect(canExportSkill(builtin)).toBe(true);
    expect(canDeleteManagedSkill(builtin)).toBe(false);
  });

  it('只读技能只给查看：不给导出与删除，也没法编辑（把 can_manage 缺失当可管理时本用例必须失败）', () => {
    const readOnly = skill({ can_manage: false, effective_permission: 'read' });
    expect(canManageManagedSkill(readOnly)).toBe(false);
    expect(isReadOnlySkill(readOnly)).toBe(true);
    expect(canExportSkill(readOnly)).toBe(false);
    expect(canDeleteManagedSkill(readOnly)).toBe(false);
    expect(canEditSkillFiles(readOnly)).toBe(false);
    const missing = { ...skill() } as Partial<ManagedSkill>;
    delete missing.can_manage;
    expect(canManageManagedSkill(missing as ManagedSkill)).toBe(false);
  });

  it('未安装的记录不给导出与删除', () => {
    expect(canExportSkill(skill({ dir_path: '' }))).toBe(false);
    expect(canDeleteManagedSkill(skill({ dir_path: '' }))).toBe(false);
  });

  it('头部状态文案带来源与禁用状态', () => {
    expect(skillStatusLabel(skill({ source_type: 'builtin' }))).toBe('内置');
    expect(skillStatusLabel(skill({ source_type: 'remote' }))).toBe('远程添加');
    expect(skillStatusLabel(skill({ enabled: false }))).toBe('上传 · 已禁用');
    expect(skillStatusLabel(null)).toBe('');
  });
});

describe('依赖分组', () => {
  const options = {
    tools: [
      { slug: 'query_kb', name: '检索知识库' },
      { slug: 'ocr', name: '' },
    ],
    mcps: ['chart-mcp'],
    skills: ['s1', 'other'],
  };

  it('三组各自映射到请求体字段，工具用展示名，Skill 候选排除当前技能（不排除自己时本用例必须失败）', () => {
    const groups = buildDependencyGroups(options, 's1');
    expect(groups.map((group) => group.formKey)).toEqual([
      'tool_dependencies',
      'mcp_dependencies',
      'skill_dependencies',
    ]);
    expect(groups[0].options).toEqual([
      { label: '检索知识库', value: 'query_kb' },
      { label: 'ocr', value: 'ocr' },
    ]);
    expect(groups[1].options).toEqual([
      { label: 'chart-mcp', value: 'chart-mcp' },
    ]);
    expect(groups[2].options).toEqual([{ label: 'other', value: 'other' }]);
  });

  it('候选过滤匹配 label 与 value，已选项在候选里消失时回退成标识（回退成空串时本用例必须失败）', () => {
    const groups = buildDependencyGroups(options, 's1');
    expect(filterDependencyOptions(groups[0], '知识')).toHaveLength(1);
    expect(filterDependencyOptions(groups[0], 'ocr')).toHaveLength(1);
    expect(filterDependencyOptions(groups[0], '不存在')).toHaveLength(0);
    expect(dependencyLabel(groups[2], 'gone')).toBe('gone');
    expect(dependencyLabel(groups[2], 'other')).toBe('other');
  });

  it('候选缺失时三组都在，不做假数据兜底', () => {
    const groups = buildDependencyGroups(null, 's1');
    expect(groups).toHaveLength(3);
    expect(groups.every((group) => group.options.length === 0)).toBe(true);
  });
});

describe('文件树与预览判定', () => {
  const tree = [
    {
      name: 'scripts',
      path: 'scripts',
      is_dir: true,
      children: [
        { name: 'run.py', path: 'scripts/run.py', is_dir: false },
        {
          name: 'lib',
          path: 'scripts/lib',
          is_dir: true,
          children: [
            { name: 'a.txt', path: 'scripts/lib/a.txt', is_dir: false },
          ],
        },
      ],
    },
    { name: 'SKILL.md', path: 'SKILL.md', is_dir: false },
  ];

  it('按路径找节点（找不到返回 null），目录路径可列举', () => {
    expect(findNode(tree, 'scripts/lib/a.txt')?.name).toBe('a.txt');
    expect(findNode(tree, 'ghost')).toBeNull();
    expect(collectDirectoryPaths(tree)).toEqual(['scripts', 'scripts/lib']);
    expect(treePaths(tree)).toEqual([
      'scripts',
      'scripts/run.py',
      'scripts/lib',
      'scripts/lib/a.txt',
      'SKILL.md',
    ]);
  });

  it('选中深层文件时展开它的祖先目录（不展开时文件在折叠目录里看不见）', () => {
    expect(ancestorPaths('scripts/lib/a.txt')).toEqual([
      'scripts',
      'scripts/lib',
    ]);
    expect(ancestorPaths('SKILL.md')).toEqual([]);
  });

  it('Markdown 判定只认扩展名，大小写不敏感', () => {
    expect(isMarkdownPath(SKILL_MD)).toBe(true);
    expect(isMarkdownPath('docs/readme.MD')).toBe(true);
    expect(isMarkdownPath('scripts/run.py')).toBe(false);
    expect(isMarkdownPath('notes.markdown')).toBe(true);
  });
});
