/**
 * 「生效范围」分区。
 *
 * 启用开关 + 共享范围表单共用一个保存按钮：先 `PUT .../share-config`（内置技能跳过，
 * 后端固定全局）再 `PUT .../enabled`。只读技能与内置技能不给表单：前者没有管理权限，
 * 后者的范围由系统维护；保存前的范围校验走 `shared/lib/share-config.ts`。
 */
import * as React from 'react';
import { Save } from 'lucide-react';

import type { ManagedSkill, SkillAccessLevel } from '../api/skill-api';
import { skillApi } from '../api/skill-api';
import {
  canManageManagedSkill,
  isBuiltinInstalledSkill,
} from '../lib/skill-detail';
import {
  useInvalidateSkills,
  useSkillShareTargets,
} from '../model/skill-queries';
import { useUser } from '@/entities/session';
import {
  normalizeShareConfig,
  validateShareConfig,
  type ShareConfig,
} from '@/shared/lib/share-config';
import { Button } from '@/shared/ui/button';
import { ShareConfigForm } from '@/shared/ui/share-config-form';
import { Spinner } from '@/shared/ui/spinner';
import { Switch } from '@/shared/ui/switch';
import { useNotifications } from '@/shared/ui/notifications';

type SkillShareTabProps = {
  skill: ManagedSkill;
  allowedLevels: SkillAccessLevel[];
};

export const SkillShareTab = ({ skill, allowedLevels }: SkillShareTabProps) => {
  const user = useUser();
  const notifications = useNotifications();
  const invalidate = useInvalidateSkills();
  const targets = useSkillShareTargets();

  const editable = canManageManagedSkill(skill);
  const builtin = isBuiltinInstalledSkill(skill);

  const [enabled, setEnabled] = React.useState(skill.enabled !== false);
  const [config, setConfig] = React.useState<ShareConfig>(() =>
    normalizeShareConfig(skill.share_config, allowedLevels),
  );
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // 换技能（或列表刷新带回新配置）时重置表单。按值取 key，避免对象引用变化就重置；
  // 用渲染期调整而不是 effect，省掉一次「先显示旧值再纠正」的提交。
  const resetKey = [
    skill.slug,
    skill.enabled,
    JSON.stringify(skill.share_config ?? null),
    allowedLevels.join(','),
  ].join('\u0000');
  const [appliedKey, setAppliedKey] = React.useState(resetKey);
  if (appliedKey !== resetKey) {
    setAppliedKey(resetKey);
    setEnabled(skill.enabled !== false);
    setConfig(normalizeShareConfig(skill.share_config, allowedLevels));
  }

  const save = async () => {
    if (!editable) return;
    if (!builtin) {
      const invalid = validateShareConfig(config);
      if (invalid) {
        setError(invalid);
        return;
      }
    }
    setError('');
    setSaving(true);
    try {
      if (!builtin) {
        await skillApi.updateShareConfig(skill.slug, config);
      }
      await skillApi.updateEnabled(skill.slug, enabled);
      invalidate();
      notifications.addNotification({
        type: 'success',
        title: '技能',
        message: '设置已保存。',
      });
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : '保存设置失败。';
      setError(message);
      notifications.addNotification({
        type: 'error',
        title: '技能',
        message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm text-color-text-1">共享与启用状态</h3>
          <p className="text-xs text-color-text-3">
            控制此 Skill 是否可用，以及哪些用户可以选择和运行它。
          </p>
        </div>
        {editable ? (
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? (
              <>
                <Spinner aria-hidden className="size-3.5" />
                保存中…
              </>
            ) : (
              <>
                <Save className="size-3.5" aria-hidden />
                保存设置
              </>
            )}
          </Button>
        ) : null}
      </div>

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-medium border border-color-border-1 p-3">
        <div>
          <h4 className="text-sm text-color-text-1">启用状态</h4>
          <p className="text-xs text-color-text-3">
            禁用后此 Skill 不会出现在可选资源中，也不会参与 Agent 运行时加载。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-color-text-2">
            {enabled ? '已启用' : '已禁用'}
          </span>
          <Switch
            checked={enabled}
            disabled={!editable}
            aria-label="启用状态"
            onCheckedChange={(checked) => {
              setError('');
              setEnabled(checked);
            }}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-medium border border-color-border-1 p-3">
        <div>
          <h4 className="text-sm text-color-text-1">生效范围</h4>
          <p className="text-xs text-color-text-3">
            控制哪些用户可以选择并在运行时使用此 Skill。
          </p>
        </div>
        {builtin ? (
          <p className="text-xs text-color-text-3">
            内置 Skill 固定为全局生效范围，可通过启用状态控制是否参与运行时。
          </p>
        ) : !editable ? (
          <p className="text-xs text-color-text-3">
            当前 Skill 对你只读，不能修改生效范围。
          </p>
        ) : (
          <ShareConfigForm
            value={config}
            onChange={(next) => {
              setError('');
              setConfig(next);
            }}
            allowedLevels={allowedLevels}
            departments={(targets.data?.departments ?? []).map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            users={(targets.data?.users ?? []).map((item) => ({
              value: item.uid,
              label: item.department_name
                ? `${item.username}（${item.department_name}）`
                : item.username,
            }))}
            targetsLoading={targets.isPending}
            autoSelectUser={{
              uid: user.data?.uid,
              departmentId: user.data?.department_id ?? null,
            }}
            error={error || null}
          />
        )}
      </section>
    </div>
  );
};
