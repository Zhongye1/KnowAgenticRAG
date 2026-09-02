import { ArrowLeft, Database } from '@phosphor-icons/react';
import { useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { paths } from '@/config/paths';
import { KnowledgeDocuments } from '@/features/knowledge/components/kg-details/knowledge-documents';
import { KnowledgeEmptyState } from '@/features/knowledge/components/shared/knowledge-empty-state';
import { useGetKnowledgeBase } from '@/generated/knowledge_bases/get-knowledge-base';

export default function KnowledgeBaseDetailRoute() {
  const { kbName } = useParams<{ kbName: string }>();
  const navigate = useNavigate();
  const kbQuery = useGetKnowledgeBase({
    params: { kb_name: kbName ?? '' },
    queryConfig: { enabled: Boolean(kbName) },
  });

  const goBack = () => navigate(paths.app.knowledge.kg.getHref());

  if (kbQuery.isLoading) {
    return (
      <div className="flex h-48 w-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!kbQuery.data) {
    return (
      <KnowledgeEmptyState
        icon={<Database className="size-6" />}
        title="知识库不存在或已被删除"
        description="请返回知识库列表，选择其他知识库查看文档。"
      >
        <Button size="sm" onClick={goBack}>
          <ArrowLeft className="size-4" />
          返回知识库列表
        </Button>
      </KnowledgeEmptyState>
    );
  }

  return <KnowledgeDocuments kb={kbQuery.data} onBack={goBack} />;
}
