/**
 * 技能面板纯逻辑用例。
 *
 * 这些判定是界面行为的事实 Owner：搜索匹配、三组分组（空组隐藏）、卡片标签、来源文案、
 * 可删除/可勾选判定与批量选择的过滤。变异点写在每个用例名里。
 */
import { describe, expect, it } from 'vitest';

import type { SkillCard } from '@/features/skills/api/skill-api';
import {
  canToggleSkillEnabled,
  deletableSkills,
  formatSkillTitle,
  getSkillIcon,
  groupSkills,
  invertSelection,
  isDeletableSkill,
  matchesSkillSearch,
  selectedDeletableSlugs,
  shareConfigLabel,
  skillCardTags,
  sourceTypeLabel,
  visibleSkillGroups,
} from '@/features/skills/lib/skill-view';

const card = (extra: Partial<SkillCard> = {}): SkillCard => ({
  id: 1,
  slug: 'demo-skill',
  name: 'demo skill',
  description: '演示技能',
  source_type: 'upload',
  source_scope: 'shared',
  enabled: true,
  created_by: 'u-1',
  tool_dependencies: [],
  mcp_dependencies: [],
  skill_dependencies: [],
  overrides_shared: false,
  shadowed_by_personal: false,
  can_manage: true,
  effective_permission: 'manage',
  is_builtin: false,
  ...extra,
});

describe('技能搜索', () => {
  it('匹配 name / slug / description，大小写不敏感（去掉 slug 这一项时本用例必须失败）', () => {
    const skill = card({ name: 'Deep Research', slug: 'deep-research' });
    expect(matchesSkillSearch(skill, 'deep')).toBe(true);
    expect(matchesSkillSearch(skill, 'DEEP-RESEARCH')).toBe(true);
    expect(matchesSkillSearch(skill, '演示')).toBe(true);
    expect(matchesSkillSearch(skill, 'missing')).toBe(false);
    expect(matchesSkillSearch(skill, '   ')).toBe(true);
  });

  it('搜索无命中而不是回退到全量', () => {
    const skills = [card({ slug: 'a' }), card({ slug: 'b', name: '另一个' })];
    expect(visibleSkillGroups(groupSkills(skills, '不存在'))).toEqual([]);
  });
});

describe('技能分组', () => {
  const skills = [
    card({ slug: 'p1', source_scope: 'personal', source_type: 'personal' }),
    card({
      slug: 'b1',
      source_scope: 'builtin',
      source_type: 'builtin',
      is_builtin: true,
    }),
    card({ slug: 's1', source_scope: 'shared', source_type: 'remote' }),
  ];

  it('按 source_scope 分个人 / 内置 / 共享三组（把共享组改成按 source_type 判定时本用例必须失败）', () => {
    const groups = groupSkills(skills);
    expect(groups.map((group) => group.key)).toEqual([
      'personal',
      'builtin',
      'shared',
    ]);
    expect(groups[0].skills.map((skill) => skill.slug)).toEqual(['p1']);
    expect(groups[1].skills.map((skill) => skill.slug)).toEqual(['b1']);
    expect(groups[2].skills.map((skill) => skill.slug)).toEqual(['s1']);
  });

  it('空组不渲染（去掉过滤时本用例必须失败）', () => {
    const groups = groupSkills([card({ slug: 's1' })]);
    expect(groups).toHaveLength(3);
    expect(visibleSkillGroups(groups).map((group) => group.key)).toEqual([
      'shared',
    ]);
  });

  it('未知 source_scope 归到共享组，不静默丢卡片', () => {
    const groups = visibleSkillGroups(
      groupSkills([card({ slug: 'x', source_scope: 'legacy' })]),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('shared');
  });
});

describe('卡片标签与文案', () => {
  it('个人技能标签带「个人技能」，覆盖共享时补一条橙色提示', () => {
    expect(
      skillCardTags(card({ source_scope: 'personal', overrides_shared: true })),
    ).toEqual(['个人技能', '覆盖共享版本']);
  });

  it('共享技能标签是共享范围摘要，被个人遮蔽时补提示（丢掉 shadowed_by_personal 判定时本用例必须失败）', () => {
    expect(
      skillCardTags(
        card({
          shadowed_by_personal: true,
          share_config: {
            version: 2,
            read_scope: {
              access_level: 'global',
              department_ids: [],
              user_uids: [],
            },
          },
        }),
      ),
    ).toEqual(['只读全局', '已被个人版本覆盖']);
  });

  it('共享范围压成一句：读 / 管两个范围（只看读范围时本用例必须失败）', () => {
    expect(
      shareConfigLabel({
        version: 2,
        read_scope: { access_level: 'department', department_ids: [1, 2] },
        manage_scope: { access_level: 'user', user_uids: ['u-1'] },
      }),
    ).toBe('读部门(2) · 管用户(1)');
    // 完全没有共享配置时读范围退化成 `{}`，因此显示「用户(0)」；
    // 实际只有共享技能会走到这个分支，而它们总带 share_config
    expect(shareConfigLabel(null)).toBe('只读用户(0)');
    expect(shareConfigLabel({ version: 2, manage_scope: null })).toBe(
      '仅所有者',
    );
  });

  it('来源文案', () => {
    expect(sourceTypeLabel('builtin')).toBe('内置');
    expect(sourceTypeLabel('remote')).toBe('远程添加');
    expect(sourceTypeLabel('upload')).toBe('上传');
    expect(sourceTypeLabel('personal')).toBe('个人技能');
  });

  it('标题按词边界折行', () => {
    expect(formatSkillTitle('deep-research')).toBe('Deep Research');
    expect(formatSkillTitle('mysql_reporter')).toBe('Mysql Reporter');
    expect(formatSkillTitle('PDF')).toBe('PDF');
    expect(formatSkillTitle('')).toBe('');
  });

  it('图标按 slug 关键词命中，认不出用通用图标', () => {
    expect(getSkillIcon('html-preview')).toBe(getSkillIcon('web-page'));
    expect(getSkillIcon('mysql-reporter')).not.toBe(getSkillIcon('web-page'));
    expect(getSkillIcon('')).toBe(getSkillIcon('unknown-thing'));
  });
});

describe('删除与批量选择判定', () => {
  it('只有可管理、非内置、非个人的技能可删（去掉内置判定时本用例必须失败）', () => {
    expect(isDeletableSkill(card())).toBe(true);
    expect(
      isDeletableSkill(card({ source_scope: 'builtin', is_builtin: true })),
    ).toBe(false);
    expect(
      isDeletableSkill(
        card({ source_scope: 'personal', source_type: 'personal' }),
      ),
    ).toBe(false);
    expect(isDeletableSkill(card({ can_manage: false }))).toBe(false);
  });

  it('can_manage 非 true 一律按不可管理，启停开关按非个人技能判定', () => {
    const missing = { ...card() } as Partial<SkillCard>;
    delete missing.can_manage;
    expect(isDeletableSkill(missing as SkillCard)).toBe(false);
    expect(canToggleSkillEnabled(card())).toBe(true);
    expect(canToggleSkillEnabled(card({ source_scope: 'personal' }))).toBe(
      false,
    );
  });

  it('反选只在候选集合内翻转（把搜索命中之外的行也翻进来时本用例必须失败）', () => {
    const candidates = deletableSkills([
      card({ slug: 'a' }),
      card({ slug: 'b' }),
      card({ slug: 'c', source_scope: 'builtin', is_builtin: true }),
    ]);
    expect(candidates.map((skill) => skill.slug)).toEqual(['a', 'b']);
    expect(invertSelection(candidates, ['a'])).toEqual(['b']);
    expect(invertSelection(candidates, [])).toEqual(['a', 'b']);
  });

  it('提交前按当前列表再过滤一次：个人与内置永远不进批量删除请求（去掉过滤时本用例必须失败）', () => {
    const skills = [
      card({ slug: 'a' }),
      card({ slug: 'p', source_scope: 'personal', source_type: 'personal' }),
      card({ slug: 'c', source_scope: 'builtin', is_builtin: true }),
    ];
    expect(selectedDeletableSlugs(skills, ['a', 'p', 'c', 'ghost'])).toEqual([
      'a',
    ]);
  });
});
