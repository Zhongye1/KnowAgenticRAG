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
import {
  KnowledgeToolbar,
  type KnowledgeBaseSort,
} from '@/features/knowledge/components/knowledge-toolbar';

export default function KnowledgeBaseRoute() {
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<KnowledgeBaseSort>('recent');
  const [selectedKbName, setSelectedKbName] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(keyword.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const kbsQuery = useKnowledgeBases({
    params: { query: query || undefined, sort },
  });
  const overviewQuery = useKnowledgeBaseOverview();

  const items = kbsQuery.data?.items ?? [];
  const total = kbsQuery.data?.total ?? items.length;

  const handleKeywordChange = (value: string) => {
    setKeyword(value);
    setSelectedKbName(null);
  };

  const handleSortChange = (value: KnowledgeBaseSort) => {
    setSort(value);
    setSelectedKbName(null);
  };

  if (kbsQuery.isLoading) {
    return (
      <div className="flex h-48 w-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  const selectedKb = items.find((kb) => kb.kb_name === selectedKbName) ?? null;

  if (items.length === 0) {
    const searching = Boolean(query);
    return (
      <div className="flex flex-col gap-4">
        <KnowledgeToolbar
          searchPlaceholder="搜索知识库"
          value={keyword}
          onChange={handleKeywordChange}
          sort={sort}
          onSortChange={handleSortChange}
          total={total}
        />
        <KnowledgeEmptyState
          icon={<BookOpen className="size-6" />}
          title={searching ? '未找到匹配的知识库' : '还没有知识库'}
          description={
            searching
              ? '换个关键词试试，或清空搜索查看全部知识库。'
              : '创建你的第一个知识库，上传文档开始构建团队知识体系。'
          }
        >
          {!searching ? <CreateKnowledgeBase /> : null}
        </KnowledgeEmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <KnowledgeToolbar
          searchPlaceholder="搜索知识库"
          value={keyword}
          onChange={handleKeywordChange}
          sort={sort}
          onSortChange={handleSortChange}
          total={total}
        />
        <CreateKnowledgeBase />
      </div>
      {overviewQuery.data && <KnowledgeOverview data={overviewQuery.data} />}
      <KnowledgeList
        items={items}
        isLoading={kbsQuery.isLoading}
        selectedKbName={selectedKbName}
        onSelect={setSelectedKbName}
      />
      <KnowledgeDocuments
        kb={selectedKb}
        onClose={() => setSelectedKbName(null)}
      />
    </div>
  );
}
