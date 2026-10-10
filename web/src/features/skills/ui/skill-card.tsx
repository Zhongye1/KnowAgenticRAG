/**
 * 技能卡片：面板里的一张卡。
 *
 * 名称、slug、描述、标签、右上角的启停开关与批量模式下的勾选框；点击卡片打开
 * SKILL.md 预览，批量模式下点击卡片切换选中，不可删除的卡片不参与选择。
 */
import { Check, Minus, Plus } from 'lucide-react';

import type { SkillCard as SkillCardModel } from '../api/skill-api';
import {
  canManageSkill,
  canToggleSkillEnabled,
  formatSkillTitle,
  getSkillIcon,
  isDeletableSkill,
  skillCardTags,
} from '../lib/skill-view';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Spinner } from '@/shared/ui/spinner';
import { cn } from '@/shared/lib';

import { SkillIcon } from './skill-icon';

type SkillCardProps = {
  skill: SkillCardModel;
  batchMode: boolean;
  selected: boolean;
  toggling: boolean;
  onOpen: (skill: SkillCardModel) => void;
  onToggleEnabled: (skill: SkillCardModel) => void;
  onToggleSelect: (skill: SkillCardModel) => void;
};

export const SkillCard = ({
  skill,
  batchMode,
  selected,
  toggling,
  onOpen,
  onToggleEnabled,
  onToggleSelect,
}: SkillCardProps) => {
  const icon = getSkillIcon(skill.slug);
  const enabled = skill.enabled !== false;
  const manageable = canManageSkill(skill);
  const selectable = isDeletableSkill(skill);
  const tags = skillCardTags(skill);

  const onCardClick = () => {
    if (batchMode) {
      // 不可删除的卡片在批量模式下没有选择语义，点击不产生选择
      if (selectable) onToggleSelect(skill);
      return;
    }
    onOpen(skill);
  };

  return (
    // 卡片表面可点只是指针便利：键盘入口是标题按钮与勾选框，不给 article 加 role/tabIndex
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- 键盘入口在卡片内的按钮
    <article
      data-testid="skill-card"
      data-slug={skill.slug}
      className={cn(
        'group/card flex flex-col gap-2 rounded-large border bg-color-bg-1 p-4 transition-colors',
        selected
          ? 'border-color-border-3 bg-color-bg-2'
          : 'border-color-border-1',
        batchMode && selectable ? 'cursor-pointer' : undefined,
      )}
      onClick={onCardClick}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {batchMode && selectable ? (
            <Checkbox
              className="mt-0.5"
              checked={selected}
              aria-label={`选择 ${skill.name}`}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={() => onToggleSelect(skill)}
            />
          ) : null}
          <SkillIcon
            icon={icon}
            className="mt-0.5 size-4 shrink-0 text-color-text-3"
          />
          <h3 className="min-w-0">
            <button
              type="button"
              className="max-w-full truncate text-left text-sm font-medium text-color-text-1"
              onClick={(event) => {
                event.stopPropagation();
                onCardClick();
              }}
            >
              {formatSkillTitle(skill.name) || skill.slug}
            </button>
            <span className="mt-0.5 block truncate font-mono text-xs text-color-text-3">
              {skill.slug}
            </span>
          </h3>
        </div>

        {canToggleSkillEnabled(skill) ? (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className={cn(enabled ? 'text-success-6' : undefined)}
            disabled={!manageable || toggling}
            aria-label={enabled ? '禁用 Skill' : '启用 Skill'}
            aria-pressed={enabled}
            onClick={(event) => {
              event.stopPropagation();
              onToggleEnabled(skill);
            }}
          >
            {toggling ? (
              <Spinner aria-hidden className="size-3.5" />
            ) : enabled ? (
              <>
                <Check
                  className="size-3.5 group-hover/card:hidden"
                  aria-hidden
                />
                <Minus
                  className="hidden size-3.5 group-hover/card:block"
                  aria-hidden
                />
              </>
            ) : (
              <Plus className="size-3.5" aria-hidden />
            )}
          </Button>
        ) : null}
      </header>

      <p className="line-clamp-2 min-h-8 text-xs text-color-text-3">
        {skill.description || '暂无描述'}
      </p>

      <ul className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <li key={tag}>
            <Badge
              variant={
                tag.startsWith('已被') || tag.startsWith('覆盖')
                  ? 'destructive'
                  : 'secondary'
              }
            >
              {tag}
            </Badge>
          </li>
        ))}
      </ul>
    </article>
  );
};
