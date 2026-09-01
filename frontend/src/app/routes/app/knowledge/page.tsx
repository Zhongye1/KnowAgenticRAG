import { Outlet } from 'react-router';

import { ContentLayout } from '@/components/layouts';
import { KnowledgeTabs } from '@/features/knowledge/components/knowledge-tabs';

export default function KnowledgeRoute() {
  return (
    <ContentLayout title="知识库/技能">
      <div className="flex flex-col gap-4">
        <KnowledgeTabs />
        <Outlet />
      </div>
    </ContentLayout>
  );
}
