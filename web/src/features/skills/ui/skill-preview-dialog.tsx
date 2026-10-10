/**
 * SKILL.md 预览弹窗。
 *
 * 头部是名称、来源与（禁用时的）徽标，非个人技能带启用开关；正文渲染 SKILL.md，
 * 读不到时显式给出后端原因而不是画成空文档；底栏是卸载、关闭与「去管理」。
 */
import { WandSparkles } from 'lucide-react';

import type { SkillCard } from '../api/skill-api';
import {
  canManageSkill,
  canToggleSkillEnabled,
  formatSkillTitle,
  getSkillIcon,
  isBuiltinSkill,
  isPersonalSkill,
  sourceTypeLabel,
} from '../lib/skill-view';
import { useSkillPreviewFile } from '../model/skill-queries';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Empty } from '@/shared/ui/empty';
import { MDPreview } from '@/shared/ui/md-preview';
import { Spinner } from '@/shared/ui/spinner';
import { Switch } from '@/shared/ui/switch';

import { SkillIcon } from './skill-icon';

type SkillPreviewDialogProps = {
  skill: SkillCard;
  toggling: boolean;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleEnabled: (skill: SkillCard) => void;
  onUninstall: (skill: SkillCard) => void;
  onManage: (skill: SkillCard) => void;
};

export const SkillPreviewDialog = ({
  skill,
  toggling,
  deleting,
  onOpenChange,
  onToggleEnabled,
  onUninstall,
  onManage,
}: SkillPreviewDialogProps) => {
  const preview = useSkillPreviewFile(skill);
  const icon = getSkillIcon(skill.slug);
  const enabled = skill.enabled !== false;
  const manageable = canManageSkill(skill);
  // 内置技能由系统维护（后端也拒绝删除）；个人技能走个人删除端点
  const canUninstall = manageable && !isBuiltinSkill(skill);

  const markdown = preview.data?.content ?? '';
  const failed = preview.isError
    ? preview.error instanceof Error
      ? preview.error.message
      : '读取 SKILL.md 失败'
    : '未读取到 SKILL.md';

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl gap-3"
        data-testid="skill-preview-dialog"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-medium bg-color-fill-2 text-color-text-2">
              <SkillIcon icon={icon} className="size-4" />
            </span>
            <span className="min-w-0 flex-col">
              <span className="block truncate">
                {formatSkillTitle(skill.name) || skill.slug}
              </span>
              <span className="mt-0.5 flex items-center gap-2 text-xs font-normal text-color-text-3">
                <span>{sourceTypeLabel(skill.source_type)} Skill</span>
                {!enabled ? <Badge variant="secondary">已禁用</Badge> : null}
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        {canToggleSkillEnabled(skill) ? (
          <div className="flex items-center gap-2 text-xs text-color-text-3">
            <Switch
              checked={enabled}
              disabled={!manageable || toggling}
              aria-label={enabled ? '禁用 Skill' : '启用 Skill'}
              onCheckedChange={() => onToggleEnabled(skill)}
            />
            {enabled ? '已启用' : '已禁用'}
          </div>
        ) : null}

        <div className="min-h-64 max-h-[56vh] overflow-y-auto rounded-medium border border-color-border-1 bg-color-bg-2 p-3">
          {preview.isPending ? (
            <p className="flex min-h-56 items-center justify-center gap-2 text-sm text-color-text-3">
              <Spinner aria-hidden className="size-4" />
              正在读取 SKILL.md…
            </p>
          ) : markdown ? (
            <MDPreview value={markdown} />
          ) : (
            <Empty description={failed} icon={WandSparkles} />
          )}
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <div>
            {canUninstall ? (
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => onUninstall(skill)}
              >
                {deleting ? '卸载中…' : '卸载'}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              关闭
            </Button>
            {!isPersonalSkill(skill) ? (
              <Button type="button" onClick={() => onManage(skill)}>
                去管理
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
