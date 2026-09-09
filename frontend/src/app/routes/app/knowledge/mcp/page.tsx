import { PlugsConnected } from '@phosphor-icons/react';

import { KnowledgeEmptyState } from '@/features/knowledge/components/shared/knowledge-empty-state';
import { KnowledgeToolbar } from '@/features/knowledge/components/shared/knowledge-toolbar';

export default function MCPRoute() {
  return (
    <div className="flex flex-col gap-4">
      <KnowledgeToolbar searchPlaceholder="搜索 MCP" />
      <KnowledgeEmptyState
        icon={<PlugsConnected className="size-6" />}
        title="MCP 建设中"
        description="该模块正在建设中，敬请期待。"
      />
    </div>
  );
}
