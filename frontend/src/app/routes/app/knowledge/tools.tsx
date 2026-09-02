import { Wrench } from '@phosphor-icons/react';

import { KnowledgeEmptyState } from '@/features/knowledge/components/knowledge-empty-state';
import { KnowledgeToolbar } from '@/features/knowledge/components/knowledge-toolbar';

export default function ToolsRoute() {
  return (
    <div className="flex flex-col gap-4">
      <KnowledgeToolbar searchPlaceholder="搜索工具" />
      <KnowledgeEmptyState
        icon={<Wrench className="size-6" />}
        title="工具建设中"
        description="该模块正在建设中，敬请期待。"
      />
    </div>
  );
}
