import { BookOpen } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { Spinner } from '@/components/ui/spinner';

import {
  useKnowledgeBaseOverview,
  useKnowledgeBases,
} from '@/features/knowledge/api/knowledge-bases';
import { CreateKnowledgeBase } from '@/features/knowledge/components/kg/create-knowledge-base';
import { KnowledgeList } from '@/features/knowledge/components/kg/knowledge-list';
import { KnowledgeOverview } from '@/features/knowledge/components/kg/knowledge-overview';
import { KnowledgeEmptyState } from '@/features/knowledge/components/shared/knowledge-empty-state';
import {
  KnowledgeToolbar,
  type KnowledgeBaseSort,
} from '@/features/knowledge/components/shared/knowledge-toolbar';

export default function KnowledgeBaseRoute() {
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<KnowledgeBaseSort>('recent');

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

  if (kbsQuery.isLoading) {
    return (
      <div className="flex h-48 w-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (items.length === 0) {
    const searching = Boolean(query);
    return (
      <div className="flex flex-col gap-4">
        <KnowledgeToolbar
          searchPlaceholder="搜索知识库"
          value={keyword}
          onChange={setKeyword}
          sort={sort}
          onSortChange={setSort}
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
          onChange={setKeyword}
          sort={sort}
          onSortChange={setSort}
          total={total}
        />
        <CreateKnowledgeBase />
      </div>
      {overviewQuery.data && <KnowledgeOverview data={overviewQuery.data} />}
      <KnowledgeList items={items} isLoading={kbsQuery.isLoading} />
    </div>
  );
}
