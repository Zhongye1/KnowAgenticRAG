import { BookOpen } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { Spinner } from '@/components/ui/spinner';

import {
  useKnowledgeBaseOverview,
  useKnowledgeBases,
} from '@/features/knowledge/api/knowledge-bases';
import { CreateKnowledgeBase } from '@/features/knowledge/components/create-knowledge-base';
import { KnowledgeDocuments } from '@/features/knowledge/components/knowledge-documents';
import { KnowledgeEmptyState } from '@/features/knowledge/components/knowledge-empty-state';
import { KnowledgeList } from '@/features/knowledge/components/knowledge-list';
import { KnowledgeOverview } from '@/features/knowledge/components/knowledge-overview';
import { KnowledgeToolbar } from '@/features/knowledge/components/knowledge-toolbar';

const TYPE_OPTIONS = ['全部', '通用', '文档', '代码', '多媒体'] as const;

export default function KnowledgeBaseRoute() {
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [selectedKbName, setSelectedKbName] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(keyword.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const kbsQuery = useKnowledgeBases({ params: { query: query || undefined } });
  const overviewQuery = useKnowledgeBaseOverview();

  if (kbsQuery.isLoading) {
    return (
      <div className="flex h-48 w-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  const items = kbsQuery.data?.data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <KnowledgeToolbar
          searchPlaceholder="搜索知识库"
          typeOptions={TYPE_OPTIONS}
          value={keyword}
          onChange={setKeyword}
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <KnowledgeToolbar
          searchPlaceholder="搜索知识库"
          typeOptions={TYPE_OPTIONS}
          value={keyword}
          onChange={setKeyword}
        />
        <CreateKnowledgeBase />
      </div>
      {overviewQuery.data?.data && (
        <KnowledgeOverview data={overviewQuery.data.data} />
      )}
      <KnowledgeList
        items={items}
        isLoading={kbsQuery.isLoading}
        selectedKbName={selectedKbName}
        onSelect={setSelectedKbName}
      />
      <KnowledgeDocuments kbName={selectedKbName} />
    </div>
  );
}
