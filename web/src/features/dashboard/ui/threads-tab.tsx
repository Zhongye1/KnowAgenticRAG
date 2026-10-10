/**
 * 会话分析 tab 的组装：会话分析区 + 全平台会话审计表 + 会话详情抽屉。
 *
 * 抽屉的 `threadId` 状态放在这里：表格负责「点哪一行」，抽屉负责「看哪一条」，
 * 闭合成一句话——打开抽屉时 `threadId` 有值，关闭时回到 `null`，查询随之停用。
 */
import * as React from 'react';

import { ConversationAuditTable } from './conversation-audit-table';
import { ThreadAnalyticsSection } from './thread-analytics-section';
import { ThreadDetailDrawer } from './thread-detail-drawer';

export const DashboardThreadsTab = ({
  onOpenFeedback,
}: {
  onOpenFeedback: () => void;
}) => {
  const [threadId, setThreadId] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <ThreadAnalyticsSection onOpenFeedback={onOpenFeedback} />

      <ConversationAuditTable onOpenThread={setThreadId} />

      <ThreadDetailDrawer
        threadId={threadId}
        onOpenChange={(open) => {
          if (!open) setThreadId(null);
        }}
      />
    </div>
  );
};
