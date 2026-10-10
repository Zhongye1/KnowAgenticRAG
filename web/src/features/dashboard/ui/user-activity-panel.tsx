/**
 * 用户活跃度面板：三张紧凑指标卡 + 近 120 天活跃度热力图。
 *
 * 热力图在数据缺失时给显式空态：`daily_active_users` 通常是一段全 0 的序列，
 * 全 0 也要能看出「没有活跃」。
 */
import { Activity, CalendarDays, Users } from 'lucide-react';

import { useUserActivityStats } from '../model/dashboard-queries';
import { formatNumber } from '../lib/dashboard-format';
import { toHeatmapDays } from '../lib/heatmap';

import { ActivityHeatmap } from './activity-heatmap';
import { MetricCard, MetricGrid } from './metric-card';
import { PanelBody, PanelCard } from './panel-card';

export const UserActivityPanel = ({
  className,
}: { className?: string } = {}) => {
  const stats = useUserActivityStats();

  return (
    <PanelCard
      title="用户活跃度"
      description="账号规模与近 120 天的活跃分布"
      testId="user-activity"
      className={className}
    >
      <PanelBody
        loading={stats.isPending}
        error={stats.isError}
        onRetry={() => void stats.refetch()}
        errorText="用户活跃度加载失败。"
        height={280}
        testId="user-activity"
      >
        <MetricGrid className="grid-cols-[repeat(auto-fit,minmax(min(100%,140px),1fr))]">
          <MetricCard
            icon={Users}
            value={formatNumber(stats.data?.total_users)}
            label="总用户"
            tone="info"
            compact
          />
          <MetricCard
            icon={Activity}
            value={formatNumber(stats.data?.active_users_24h)}
            label="24 小时活跃"
            tone="success"
            compact
          />
          <MetricCard
            icon={CalendarDays}
            value={formatNumber(stats.data?.active_users_30d)}
            label="30 天活跃"
            tone="primary"
            compact
          />
        </MetricGrid>

        <div className="border-t border-color-border-1 pt-3.5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <span className="text-sm font-semibold text-color-text-1">
                活跃度分布
              </span>
              <span className="ml-2 text-[11px] text-color-text-3">
                近 120 天
              </span>
            </div>
            <span className="text-[11px] text-color-text-3">
              按日统计活跃用户
            </span>
          </div>
          <ActivityHeatmap
            days={toHeatmapDays(stats.data?.daily_active_users)}
            loading={stats.isPending}
          />
        </div>
      </PanelBody>
    </PanelCard>
  );
};
