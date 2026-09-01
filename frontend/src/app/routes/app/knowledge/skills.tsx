import { Sparkle } from '@phosphor-icons/react';

import { KnowledgeEmptyState } from '@/features/knowledge/components/knowledge-empty-state';
import { KnowledgeToolbar } from '@/features/knowledge/components/knowledge-toolbar';

const TYPE_OPTIONS = ['全部', '官方', '自定义'] as const;

export default function SkillsRoute() {
  return (
    <div className="flex flex-col gap-4">
      <KnowledgeToolbar
        searchPlaceholder="搜索技能"
        typeOptions={TYPE_OPTIONS}
      />
      <KnowledgeEmptyState
        icon={<Sparkle className="size-6" />}
        title="技能建设中"
        description="该模块正在建设中，敬请期待。"
      />
    </div>
  );
}
