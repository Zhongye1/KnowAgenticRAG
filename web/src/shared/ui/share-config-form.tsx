/**
 * 共享范围表单（`share_config` v2）。
 *
 * 读/管两个范围、三档访问级别、部门与用户多选；知识库共享设置弹窗、技能安装流与技能
 * 详情页共用它，规则在 `shared/lib/share-config.ts`，弹窗外壳、保存动作与后端写入口由
 * 消费方持有。
 *
 * 访问级别是 radio 输入，对象列表是带 `aria-pressed` 的切换按钮；`auto_select_user_dept`
 * 把当前账号/部门补进对应范围，`allowed_access_levels` 决定可选的级别。
 */
import * as React from 'react';

import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/spinner';
import {
  ACCESS_LEVELS,
  describeScope,
  normalizeShareScope,
  type AccessLevel,
  type ShareConfig,
  type ShareScope,
} from '@/shared/lib/share-config';

/** 一条可选对象（部门或用户）。 */
export type ShareTargetOption = {
  value: number | string;
  label: string;
};

export type ShareConfigFormProps = {
  value: ShareConfig;
  onChange: (config: ShareConfig) => void;
  /** 后端 `allowed_access_levels`：非管理员只有 `user`。 */
  allowedLevels?: readonly AccessLevel[];
  departments?: ShareTargetOption[];
  users?: ShareTargetOption[];
  /** 部门/用户列表还在加载；只影响提示，不挡交互（列表到了自然会渲染）。 */
  targetsLoading?: boolean;
  /** 当前账号；给出时，切到「指定人/部门」会把它补进对应范围。 */
  autoSelectUser?: { uid?: string | null; departmentId?: number | null };
  /** 保存失败或校验不通过的说明；由消费方持有，改选择时自行清空。 */
  error?: string | null;
};

const LEVEL_LABELS: Record<AccessLevel, string> = {
  global: '全局共享',
  department: '部门共享',
  user: '指定人',
};

const SCOPE_LABELS = {
  read_scope: '读取权限',
  manage_scope: '共享管理权限（包含读取权限）',
} as const;

type ScopeKey = keyof typeof SCOPE_LABELS;

export const ShareConfigForm = ({
  value,
  onChange,
  allowedLevels = ACCESS_LEVELS,
  departments = [],
  users = [],
  targetsLoading = false,
  autoSelectUser,
  error,
}: ShareConfigFormProps) => {
  const allowed = allowedLevels.length > 0 ? allowedLevels : ACCESS_LEVELS;

  /** 归一一个范围，并按需把当前账号/部门补进对应列表。 */
  const normalize = React.useCallback(
    (scope?: Partial<ShareScope> | null): ShareScope | null => {
      const normalized = normalizeShareScope(scope, allowed);
      if (!normalized || !autoSelectUser) return normalized;
      if (normalized.access_level === 'department') {
        const departmentId = autoSelectUser.departmentId;
        const ids = normalized.department_ids ?? [];
        if (
          typeof departmentId === 'number' &&
          Number.isFinite(departmentId) &&
          !ids.includes(departmentId)
        ) {
          return { ...normalized, department_ids: [departmentId, ...ids] };
        }
        return normalized;
      }
      if (normalized.access_level === 'user') {
        const uid = String(autoSelectUser.uid ?? '').trim();
        const uids = normalized.user_uids ?? [];
        if (uid && !uids.includes(uid)) {
          return { ...normalized, user_uids: [uid, ...uids] };
        }
        return normalized;
      }
      return normalized;
    },
    [allowed, autoSelectUser],
  );

  const setScope = (key: ScopeKey, scope?: Partial<ShareScope> | null) => {
    onChange({ ...value, [key]: normalize(scope) });
  };

  const onLevelChange = (key: ScopeKey, level: AccessLevel) => {
    const current = value[key];
    setScope(key, {
      access_level: level,
      department_ids: current?.department_ids ?? [],
      user_uids: current?.user_uids ?? [],
    });
  };

  const toggleId = (key: ScopeKey, level: AccessLevel, id: number | string) => {
    const current = value[key];
    if (!current) return;
    if (level === 'department') {
      const value = Number(id);
      const ids = current.department_ids ?? [];
      setScope(key, {
        ...current,
        department_ids: ids.includes(value)
          ? ids.filter((item) => item !== value)
          : [...ids, value],
      });
      return;
    }
    const uid = String(id);
    const uids = current.user_uids ?? [];
    setScope(key, {
      ...current,
      user_uids: uids.includes(uid)
        ? uids.filter((item) => item !== uid)
        : [...uids, uid],
    });
  };

  const renderScope = (key: ScopeKey) => {
    const scope = value[key];
    const levels = scope ? [scope.access_level] : [];
    return (
      <section className="flex flex-col gap-2" data-testid={`scope-${key}`}>
        <header className="flex items-center justify-between gap-2">
          <span className="flex flex-col">
            <span className="text-sm text-color-text-1">
              {SCOPE_LABELS[key]}
            </span>
            <span className="text-xs text-color-text-3">
              {scope
                ? describeScope(scope, key === 'manage_scope' ? '管理' : '访问')
                : '未单独授予管理权限：只有创建者与超级管理员可管理'}
            </span>
          </span>
          {key === 'manage_scope' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setScope(
                  'manage_scope',
                  scope
                    ? null
                    : { access_level: value.read_scope.access_level },
                )
              }
            >
              {scope ? '取消管理范围' : '添加管理范围'}
            </Button>
          ) : null}
        </header>

        {scope ? (
          <>
            <fieldset className="flex flex-wrap gap-3">
              <legend className="sr-only">{SCOPE_LABELS[key]}</legend>
              {allowed.map((level) => (
                <label
                  key={level}
                  className="flex items-center gap-1 text-sm text-color-text-2"
                >
                  <input
                    type="radio"
                    name={`${key}-access-level`}
                    checked={levels.includes(level)}
                    onChange={() => onLevelChange(key, level)}
                  />
                  {LEVEL_LABELS[level]}
                </label>
              ))}
            </fieldset>

            {scope.access_level !== 'global' ? (
              <ul className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                {(scope.access_level === 'department'
                  ? departments
                  : users
                ).map((option) => {
                  const selected =
                    scope.access_level === 'department'
                      ? (scope.department_ids ?? []).includes(
                          Number(option.value),
                        )
                      : (scope.user_uids ?? []).includes(String(option.value));
                  return (
                    <li key={String(option.value)}>
                      <Button
                        type="button"
                        variant={selected ? 'default' : 'outline'}
                        size="sm"
                        aria-pressed={selected}
                        onClick={() =>
                          toggleId(key, scope.access_level, option.value)
                        }
                      >
                        {option.label}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-3" data-testid="share-config-form">
      {targetsLoading ? (
        <p className="flex items-center gap-2 text-sm text-color-text-3">
          <Spinner aria-hidden className="size-4" />
          正在加载部门与用户…
        </p>
      ) : null}

      {renderScope('read_scope')}
      {renderScope('manage_scope')}

      {error ? (
        <p role="alert" className="text-sm text-danger-6">
          {error}
        </p>
      ) : null}
    </div>
  );
};
