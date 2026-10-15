/**
 * MCP 详情页（`/extensions/mcp/:slug`）。
 *
 * 独立页面 + `ContentLayout`；地址里缺少 slug 时给占位提示。通知走 `useNotifications`
 * （与技能详情页同一取用方式）。
 */
import { useParams } from 'react-router';

import { McpDetailView } from '@/features/mcp';
import { ContentLayout } from '@/shared/ui/content-layout';
import { useNotifications } from '@/shared/ui/notifications';
import { PagePlaceholder } from '@/shared/ui/page-placeholder';

export const McpDetailPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { addNotification } = useNotifications();

  if (!slug) {
    return <PagePlaceholder title="MCP" description="地址里缺少 MCP slug。" />;
  }

  return (
    <ContentLayout title="MCP 详情">
      {/* 换 slug 时重挂载：表单、分区与工具搜索都是某台服务器的 */}
      <McpDetailView
        key={slug}
        slug={slug}
        notifySuccess={(title) => addNotification({ type: 'success', title })}
        notifyError={(title) => addNotification({ type: 'error', title })}
      />
    </ContentLayout>
  );
};
