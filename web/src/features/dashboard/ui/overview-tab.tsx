/**
 * 概览 tab 的组装。
 *
 * 网格：调用统计占 2 列，用户活跃度占 1 列；第二行是智能体分析、工具调用监控、
 * 知识库使用情况。知识域不可用（LITE）时知识库面板不挂载，工具面板补足两列。
 */
import { useKnowledgeEnabled } from '@/entities/session';

import { AgentAnalyticsPanel } from './agent-analytics-panel';
import { CallStatsPanel } from './call-stats-panel';
import { KnowledgeStatsPanel } from './knowledge-stats-panel';
import { OverviewMetrics } from './overview-metrics';
import { ToolStatsPanel } from './tool-stats-panel';
import { UserActivityPanel } from './user-activity-panel';
import { cn } from '@/shared/lib';

export const DashboardOverviewTab = ({
  onOpenFeedback,
}: {
  onOpenFeedback: () => void;
}) => {
  const knowledgeEnabled = useKnowledgeEnabled();

  return (
    <div className="flex flex-col gap-4">
      <OverviewMetrics onOpenFeedback={onOpenFeedback} />

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <CallStatsPanel className="xl:col-span-2" />
        <UserActivityPanel />
        <AgentAnalyticsPanel />
        <ToolStatsPanel className={cn(!knowledgeEnabled && 'xl:col-span-2')} />
        {knowledgeEnabled ? <KnowledgeStatsPanel /> : null}
      </div>
    </div>
  );
};
