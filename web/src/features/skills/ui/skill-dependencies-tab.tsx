/**
 * 「依赖」分区。
 *
 * 三组依赖（工具 / MCP / Skill）各自一个候选列表 + 已选 chip，保存走
 * `PUT .../dependencies`（后端整份替换）；候选是常驻复选列表，当前技能从 Skill 候选里
 * 排除（后端也会排除）。
 */
import * as React from 'react';
import { Save, X } from 'lucide-react';

import type { ManagedSkill } from '../api/skill-api';
import { skillApi } from '../api/skill-api';
import {
  buildDependencyGroups,
  dependencyLabel,
  filterDependencyOptions,
} from '../lib/skill-detail';
import {
  useInvalidateSkills,
  useSkillDependencyOptions,
} from '../model/skill-queries';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';
import { useNotifications } from '@/shared/ui/notifications';

type SkillDependenciesTabProps = {
  skill: ManagedSkill;
  editable: boolean;
};

type DependencyForm = {
  tool_dependencies: string[];
  mcp_dependencies: string[];
  skill_dependencies: string[];
};

const formFromSkill = (skill: ManagedSkill): DependencyForm => ({
  tool_dependencies: [...(skill.tool_dependencies ?? [])],
  mcp_dependencies: [...(skill.mcp_dependencies ?? [])],
  skill_dependencies: [...(skill.skill_dependencies ?? [])],
});

export const SkillDependenciesTab = ({
  skill,
  editable,
}: SkillDependenciesTabProps) => {
  const notifications = useNotifications();
  const invalidate = useInvalidateSkills();
  const options = useSkillDependencyOptions(skill.slug);
  const [form, setForm] = React.useState<DependencyForm>(() =>
    formFromSkill(skill),
  );
  const [search, setSearch] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  // 切换技能时重置表单（页面按 slug 重挂载，这里兜住同页切换）。
  // 渲染期调整而不是 effect，省掉一次「先显示旧技能依赖再纠正」的提交。
  const [formSlug, setFormSlug] = React.useState(skill.slug);
  if (formSlug !== skill.slug) {
    setFormSlug(skill.slug);
    setForm(formFromSkill(skill));
  }

  const groups = React.useMemo(
    () => buildDependencyGroups(options.data, skill.slug),
    [options.data, skill.slug],
  );

  const selectedValues = (formKey: keyof DependencyForm) => form[formKey] ?? [];

  const toggle = (formKey: keyof DependencyForm, value: string) => {
    if (!editable) return;
    setForm((current) => {
      const list = current[formKey] ?? [];
      return {
        ...current,
        [formKey]: list.includes(value)
          ? list.filter((item) => item !== value)
          : [...list, value],
      };
    });
  };

  const save = async () => {
    if (!editable) return;
    setSaving(true);
    try {
      await skillApi.updateDependencies(skill.slug, form);
      invalidate();
      notifications.addNotification({
        type: 'success',
        title: '技能',
        message: '依赖已更新。',
      });
    } catch (error) {
      notifications.addNotification({
        type: 'error',
        title: '技能',
        message: error instanceof Error ? error.message : '更新依赖失败。',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm text-color-text-1">依赖声明</h3>
          <p className="text-xs text-color-text-3">
            配置此 Skill 所需的工具、MCP 及其他 Skill 依赖。
          </p>
        </div>
        {editable ? (
          <Button
            type="button"
            disabled={saving || options.isPending}
            onClick={() => void save()}
          >
            {saving ? (
              <>
                <Spinner aria-hidden className="size-3.5" />
                保存中…
              </>
            ) : (
              <>
                <Save className="size-3.5" aria-hidden />
                更新依赖
              </>
            )}
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled>
            {skill.source_type === 'builtin' ? '系统维护' : '只读'}
          </Button>
        )}
      </div>

      {groups.map((group) => {
        const values = selectedValues(group.formKey);
        const keyword = search[group.key] ?? '';
        const visible = filterDependencyOptions(group, keyword);
        return (
          <section
            key={group.key}
            className="flex flex-col gap-2 rounded-medium border border-color-border-1 p-3"
            data-testid={`dependency-${group.key}`}
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h4 className="text-sm text-color-text-1">{group.title}</h4>
                <p className="text-xs text-color-text-3">{group.description}</p>
              </div>
              <span className="text-xs text-color-text-3">
                已选择 {values.length} 项
              </span>
            </header>

            {values.length ? (
              <ul className="flex flex-wrap gap-1">
                {values.map((value) => (
                  <li key={value}>
                    <Badge variant="secondary" className="gap-1">
                      <span title={dependencyLabel(group, value)}>
                        {dependencyLabel(group, value)}
                      </span>
                      {editable ? (
                        <button
                          type="button"
                          aria-label={`移除 ${dependencyLabel(group, value)}`}
                          onClick={() => toggle(group.formKey, value)}
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      ) : null}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-color-text-3">{group.emptyText}</p>
            )}

            <Input
              value={keyword}
              aria-label={`搜索${group.shortTitle}`}
              placeholder={`搜索${group.shortTitle}`}
              onChange={(event) =>
                setSearch((current) => ({
                  ...current,
                  [group.key]: event.target.value,
                }))
              }
            />

            {options.isPending ? (
              <p className="flex items-center gap-2 text-xs text-color-text-3">
                <Spinner aria-hidden className="size-3.5" />
                正在加载依赖候选…
              </p>
            ) : visible.length ? (
              <ul className="flex max-h-52 flex-col overflow-y-auto">
                {visible.map((option) => (
                  <li key={option.value}>
                    <label className="flex items-center gap-2 rounded-small px-1 py-1 text-sm text-color-text-2 hover:bg-color-fill-1">
                      <Checkbox
                        checked={values.includes(option.value)}
                        disabled={!editable}
                        aria-label={option.label}
                        onCheckedChange={() =>
                          toggle(group.formKey, option.value)
                        }
                      />
                      <span className="truncate">{option.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-color-text-3">
                {group.options.length ? '没有匹配的依赖' : '暂无可选依赖'}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
};
