/** 技能卡片：面板里的一张卡。 */
import * as React from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { Button, Checkbox, Spin } from 'antd';

import { formatExtensionTitle } from '@/shared/lib';
import { InfoCard, type InfoCardTag } from '@/shared/ui/info-card';

import type { SkillCard as SkillCardModel } from '../api/skill-api';
import {
  canManageSkill,
  canToggleSkillEnabled,
  getSkillIcon,
  isDeletableSkill,
  skillCardTags,
} from '../lib/skill-view';

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
  const Icon = getSkillIcon(skill.slug);
  const enabled = skill.enabled !== false;
  const manageable = canManageSkill(skill);
  const selectable = isDeletableSkill(skill);
  const tags: InfoCardTag[] = skillCardTags(skill).map((name) => ({
    // 「已被个人版本覆盖」「覆盖共享版本」是 orange 徽标，其余是灰
    name,
    color:
      name.startsWith('已被') || name.startsWith('覆盖') ? 'orange' : 'gray',
  }));

  const onCardClick = () => {
    if (batchMode) {
      // 不可删除的卡片在批量模式下没有选择语义，点击不产生选择
      if (selectable) onToggleSelect(skill);
      return;
    }
    onOpen(skill);
  };

  return (
    <InfoCard
      slug={skill.slug}
      title={formatExtensionTitle(skill.name) || skill.slug}
      subtitle={skill.slug}
      description={skill.description || '暂无描述'}
      tags={tags}
      className={selected ? 'border-color-border-3 bg-color-bg-2' : undefined}
      onOpen={onCardClick}
      icon={
        <SkillIcon icon={Icon} className="size-4.5 text-[var(--gray-600)]" />
      }
      action={
        batchMode && selectable ? (
          <Checkbox
            checked={selected}
            aria-label={`选择 ${skill.name}`}
            onClick={(event) => event.stopPropagation()}
            onChange={() => onToggleSelect(skill)}
          />
        ) : canToggleSkillEnabled(skill) ? (
          <Button
            htmlType="button"
            variant="outlined"
            size="small"
            className={enabled ? 'text-success-6' : undefined}
            disabled={!manageable || toggling}
            aria-label={enabled ? '禁用 Skill' : '启用 Skill'}
            aria-pressed={enabled}
            onClick={(event) => {
              event.stopPropagation();
              onToggleEnabled(skill);
            }}
          >
            {toggling ? (
              <Spin aria-hidden className="size-3.5" />
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
        ) : null
      }
    />
  );
};
