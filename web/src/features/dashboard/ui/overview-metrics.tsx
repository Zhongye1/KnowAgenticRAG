/**
 * 概览的 6 张指标卡。
 *
 * 「总反馈数」可点击打开反馈列表；`/stats` 不返回 `conversation_trend`，卡片不画环比趋势。
 * 满意度按 80/60 档位上色：数值本身表达状态，颜色是补充而不是唯一载体。
 */
import {
  Activity,
  BarChart3,
  Heart,
  Mail,
  MessageCircle,
  Users,
} from 'lucide-react';

import { useDashboardStats } from '../model/dashboard-queries';
import { formatNumber } from '../lib/dashboard-format';
import {
  formatPercent,
  metricValueTone,
  satisfactionTone,
} from '../lib/dashboard-metrics';
import { MetricCard, MetricGrid } from './metric-card';
import { PanelBody } from './panel-card';

export const OverviewMetrics = ({
  onOpenFeedback,
}: {
  onOpenFeedback: () => void;
}) => {
  const stats = useDashboardStats();
  const satisfaction = satisfactionTone(
    stats.data?.feedback_stats?.satisfaction_rate,
  );

  return (
    <PanelBody
      loading={stats.isPending}
      error={stats.isError}
      onRetry={() => void stats.refetch()}
      errorText="概览指标加载失败。"
      height={96}
      testId="overview-metrics"
    >
      <MetricGrid>
        <MetricCard
          icon={MessageCircle}
          value={formatNumber(stats.data?.total_conversations)}
          label="累计会话"
          tone="primary"
          testId="metric-total-conversations"
        />
        <MetricCard
          icon={Activity}
          value={formatNumber(stats.data?.active_conversations)}
          label="活跃会话"
          tone="success"
          testId="metric-active-conversations"
        />
        <MetricCard
          icon={Mail}
          value={formatNumber(stats.data?.total_messages)}
          label="消息总数"
          tone="info"
          testId="metric-total-messages"
        />
        <MetricCard
          icon={Users}
          value={formatNumber(stats.data?.total_users)}
          label="用户数"
          tone="warning"
          testId="metric-total-users"
        />
        <MetricCard
          icon={BarChart3}
          value={formatNumber(stats.data?.feedback_stats?.total_feedbacks)}
          label="反馈数"
          tone="accent"
          onClick={onOpenFeedback}
          ariaLabel="查看反馈列表"
          testId="metric-total-feedbacks"
        />
        <MetricCard
          icon={Heart}
          value={formatPercent(stats.data?.feedback_stats?.satisfaction_rate)}
          label="满意度"
          tone={satisfaction}
          valueTone={metricValueTone(satisfaction)}
          testId="metric-satisfaction"
        />
      </MetricGrid>
    </PanelBody>
  );
};
