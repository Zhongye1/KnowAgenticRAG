import { BookOpen } from '@phosphor-icons/react';

import { CreateKnowledgeBase } from '@/features/knowledge/components/create-knowledge-base';
import { KnowledgeEmptyState } from '@/features/knowledge/components/knowledge-empty-state';
import { KnowledgeToolbar } from '@/features/knowledge/components/knowledge-toolbar';

const TYPE_OPTIONS = ['全部', '通用', '文档', '代码', '多媒体'] as const;

export default function KnowledgeBaseRoute() {
  return (
    <div className="flex flex-col gap-4">
      <KnowledgeToolbar
        searchPlaceholder="搜索知识库"
        typeOptions={TYPE_OPTIONS}
      />
      <KnowledgeEmptyState
        icon={<BookOpen className="size-6" />}
        title="还没有知识库"
        description="创建你的第一个知识库，上传文档开始构建团队知识体系。"
      >
        <CreateKnowledgeBase />
      </KnowledgeEmptyState>
    </div>
  );
}
