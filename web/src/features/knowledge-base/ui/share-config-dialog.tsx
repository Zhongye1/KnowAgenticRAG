/**
 * 共享设置弹窗。
 *
 * 移植上游 `ShareConfigForm.vue` 的两个范围（读取 / 共享管理）与三档访问级别。
 * 有意偏离：上游把它做成「编辑知识库」弹窗里的一个页签，本仓改成详情页头部的独立弹窗，
 * 保存时按后端唯一的写入口 `PUT /databases/{kb_id}` 一起提交名称与描述（该端点要求两者齐全）。
 */
import * as React from 'react';

import type { KnowledgeBaseDetail } from '../api/knowledge-api';
import {
  ACCESS_LEVELS,
  describeScope,
  normalizeShareConfig,
  normalizeShareScope,
  validateShareConfig,
  type AccessLevel,
} from '../lib/share-config';
import {
  useShareTargets,
  useUpdateKnowledgeBase,
} from '../model/knowledge-queries';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Spinner } from '@/shared/ui/spinner';
import { useNotifications } from '@/shared/ui/notifications';

type ShareConfigDialogProps = {
  kb: KnowledgeBaseDetail;
  onOpenChange: (open: boolean) => void;
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

export const ShareConfigDialog = ({
  kb,
  onOpenChange,
}: ShareConfigDialogProps) => {
  const targets = useShareTargets();
  const update = useUpdateKnowledgeBase(kb.kb_id);
  const notifications = useNotifications();

  const [config, setConfig] = React.useState(() =>
    normalizeShareConfig(kb.share_config),
  );
  const [error, setError] = React.useState('');

  const setScope = (
    key: ScopeKey,
    scope: Parameters<typeof normalizeShareScope>[0],
  ) => {
    // 改选择即失效上一次的校验或保存失败提示，否则要再点一次保存才消失
    setError('');
    setConfig((current) => ({ ...current, [key]: normalizeShareScope(scope) }));
  };

  const onLevelChange = (key: ScopeKey, level: AccessLevel) => {
    const current = config[key];
    setScope(key, {
      access_level: level,
      department_ids: current?.department_ids ?? [],
      user_uids: current?.user_uids ?? [],
    });
  };

  const toggleId = (
    key: ScopeKey,
    level: AccessLevel,
    value: number | string,
  ) => {
    const current = config[key];
    if (!current) return;
    if (level === 'department') {
      const id = Number(value);
      setScope(key, {
        ...current,
        department_ids: (current.department_ids ?? []).includes(id)
          ? (current.department_ids ?? []).filter((item) => item !== id)
          : [...(current.department_ids ?? []), id],
      });
      return;
    }
    const uid = String(value);
    setScope(key, {
      ...current,
      user_uids: (current.user_uids ?? []).includes(uid)
        ? (current.user_uids ?? []).filter((item) => item !== uid)
        : [...(current.user_uids ?? []), uid],
    });
  };

  const onSave = async () => {
    const invalid = validateShareConfig(config);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    try {
      await update.mutateAsync({
        name: kb.name,
        description: kb.description ?? '',
        share_config: config,
      });
      notifications.addNotification({
        type: 'success',
        title: '知识库',
        message: '共享范围已保存。',
      });
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : '保存共享范围失败。',
      );
    }
  };

  const renderScope = (key: ScopeKey) => {
    const scope = config[key];
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
                    : { access_level: config.read_scope.access_level },
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
              {ACCESS_LEVELS.map((level) => (
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
                  ? (targets.data?.departments ?? []).map((item) => ({
                      value: item.id,
                      label: item.name,
                    }))
                  : (targets.data?.users ?? []).map((item) => ({
                      value: item.uid,
                      label: item.department_name
                        ? `${item.username}（${item.department_name}）`
                        : item.username,
                    }))
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
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl gap-3"
        data-testid="share-config-dialog"
      >
        <DialogHeader>
          <DialogTitle>共享设置</DialogTitle>
          <DialogDescription>
            控制谁能读取这个知识库，以及谁还能继续共享它。管理范围必须落在读取范围内。
          </DialogDescription>
        </DialogHeader>

        {targets.isPending ? (
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

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={update.isPending}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={update.isPending}
            onClick={() => void onSave()}
          >
            {update.isPending ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
