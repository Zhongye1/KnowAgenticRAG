/**
 * 会话分析：概览指标 + 2×2 可视化（新增/活跃趋势、消息深度分布、智能体承载、活跃用户榜）。
 *
 * 时间范围与「是否包含子智能体会话」是查询键的一部分，切换即重新取数；
 * 「刷新」是显式重取当前口径。过期响应由 react-query 的查询键隔离，
 * 图表尺寸由 `EChart` 的 ResizeObserver 负责，页面不手动调用 resize。
 */
import { Activity, Layers, Mail, MessageSquare, RefreshCw } from 'lucide-react';
import * as React from 'react';

import type { ThreadTimeRange } from '../api/dashboard-api';
import {
  buildThreadAgentOption,
  buildThreadDepthOption,
  buildThreadTrendOption,
} from '../lib/chart-options';
import { conversationStatusLabel } from '../lib/conversation-query';
import {
  formatFullDateTime,
  formatNumber,
  truncateIdentifier,
} from '../lib/dashboard-format';
import { useThreadAnalytics } from '../model/dashboard-queries';
import { EChart } from './echart';
import { MetricCard, MetricGrid } from './metric-card';
import { PanelBody, PanelCard, PanelSectionTitle } from './panel-card';
import { ToggleGroup } from './toggle-group';
import { Button } from 'antd';
import { Empty } from '@/shared/ui/empty';

const TIME_RANGE_OPTIONS: { value: ThreadTimeRange; label: string }[] = [
  { value: '7days', label: '近 7 天' },
  { value: '14days', label: '近 14 天' },
  { value: '30days', label: '近 30 天' },
  { value: '90days', label: '近 90 天' },
];

/** 子智能体会话是否计入统计；与时间范围一样是查询键的一部分。 */
const SUBAGENT_OPTIONS: { value: 'include' | 'exclude'; label: string }[] = [
  { value: 'include', label: '包含子智能体' },
  { value: 'exclude', label: '不包含子智能体' },
];

const hasTrendData = (
  trends: { new_threads: number; active_threads: number }[],
): boolean =>
  trends.some((trend) => trend.new_threads > 0 || trend.active_threads > 0);

const hasDepthData = (distribution: Record<string, number>): boolean =>
  Object.values(distribution ?? {}).some((value) => Number(value ?? 0) > 0);

export const ThreadAnalyticsSection = ({
  onOpenFeedback,
}: {
  onOpenFeedback: () => void;
}) => {
  const [timeRange, setTimeRange] = React.useState<ThreadTimeRange>('30days');
  const [includeSubagents, setIncludeSubagents] = React.useState(false);
  const analytics = useThreadAnalytics(timeRange, includeSubagents);
  const data = analytics.data;
  const summary = data?.summary;
  const trends = data?.daily_trends ?? [];
  const depth = data?.depth_distribution ?? {};
  const agentDistribution = data?.agent_distribution ?? [];
  const topUsers = data?.top_users ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <ToggleGroup
          label="统计周期"
          value={timeRange}
          options={TIME_RANGE_OPTIONS}
          onChange={setTimeRange}
          disabled={analytics.isFetching}
          testId="thread-time-range"
        />
        <ToggleGroup
          label="子智能体"
          value={includeSubagents ? 'include' : 'exclude'}
          options={SUBAGENT_OPTIONS}
          onChange={(value) => setIncludeSubagents(value === 'include')}
          disabled={analytics.isFetching}
          testId="thread-subagents"
        />
        <Button
          htmlType="button"
          variant="outlined"
          size="small"
          disabled={analytics.isFetching}
          onClick={() => void analytics.refetch()}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          刷新
        </Button>
        <Button
          htmlType="button"
          variant="outlined"
          size="small"
          onClick={onOpenFeedback}
        >
          反馈列表
        </Button>
      </div>

      <PanelBody
        loading={analytics.isPending}
        error={analytics.isError}
        onRetry={() => void analytics.refetch()}
        errorText="会话分析加载失败。"
        height={200}
        testId="thread-analytics"
      >
        <MetricGrid className="lg:grid-cols-4">
          <MetricCard
            icon={MessageSquare}
            value={formatNumber(summary?.total_threads)}
            label="累计会话"
            tone="primary"
            testId="metric-thread-total"
          />
          <MetricCard
            icon={Activity}
            value={formatNumber(summary?.active_threads)}
            label="活跃会话"
            tone="success"
            testId="metric-thread-active"
          />
          <MetricCard
            icon={Layers}
            value={String(summary?.avg_messages_per_thread ?? 0)}
            label="平均消息数 / 会话"
            tone="info"
            testId="metric-thread-avg-messages"
          />
          <MetricCard
            icon={Mail}
            value={formatNumber(summary?.total_messages)}
            label="消息总数"
            tone="accent"
            testId="metric-thread-messages"
          />
        </MetricGrid>

        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <PanelCard
            title="会话增长与活跃趋势"
            description="每日新增会话与活跃会话"
          >
            {hasTrendData(trends) ? (
              <EChart
                testId="thread-trend-chart"
                ariaLabel="每日新增会话与活跃会话趋势图"
                height={220}
                option={(palette) =>
                  buildThreadTrendOption({ trends, palette })
                }
              />
            ) : (
              <Empty description="所选周期内没有会话活动。" className="py-10" />
            )}
          </PanelCard>

          <PanelCard
            title="对话轮数深度分布"
            description="单次问答与多轮交互的占比"
          >
            {hasDepthData(depth) ? (
              <EChart
                testId="thread-depth-chart"
                ariaLabel="会话消息条数深度分布柱图"
                height={220}
                option={(palette) =>
                  buildThreadDepthOption({ distribution: depth, palette })
                }
              />
            ) : (
              <Empty
                description="所选周期内没有会话，无法统计轮数分布。"
                className="py-10"
              />
            )}
          </PanelCard>

          <PanelCard
            title="智能体会话承载排行"
            description="各智能体的累计会话数"
          >
            {agentDistribution.length > 0 ? (
              <EChart
                testId="thread-agent-chart"
                ariaLabel="智能体会话数排行柱图"
                height={220}
                option={(palette) =>
                  buildThreadAgentOption({
                    distribution: agentDistribution,
                    palette,
                  })
                }
              />
            ) : (
              <Empty
                description="所选周期内没有智能体会话。"
                className="py-10"
              />
            )}
          </PanelCard>

          <PanelCard
            title="高频用户活跃榜"
            description="按会话数与消息交互量排序"
          >
            {topUsers.length === 0 ? (
              <Empty description="所选周期内没有活跃用户。" className="py-10" />
            ) : (
              <div className="max-h-[240px] overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-color-bg-1 text-color-text-3">
                    <tr className="border-b border-color-border-2">
                      <th
                        scope="col"
                        className="w-10 py-2 pr-2 text-center font-medium"
                      >
                        #
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        用户
                      </th>
                      <th
                        scope="col"
                        className="w-16 py-2 pr-3 text-right font-medium"
                      >
                        会话数
                      </th>
                      <th
                        scope="col"
                        className="w-16 py-2 pr-3 text-right font-medium"
                      >
                        消息数
                      </th>
                      <th scope="col" className="w-36 py-2 font-medium">
                        最近活跃
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topUsers.map((user, index) => (
                      <tr
                        key={user.uid}
                        data-testid="top-user-row"
                        className="border-b border-color-border-2 last:border-b-0"
                      >
                        <td className="py-2 pr-2 text-center tabular-nums text-color-text-3">
                          {index + 1}
                        </td>
                        <td className="min-w-0 py-2 pr-3">
                          <span className="block truncate text-color-text-1">
                            {user.username || user.uid}
                          </span>
                          <span
                            className="block truncate font-mono text-[10px] text-color-text-3"
                            title={user.uid}
                          >
                            {truncateIdentifier(user.uid)}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-color-text-2">
                          {user.thread_count}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-color-text-2">
                          {user.message_count}
                        </td>
                        <td className="py-2 text-color-text-3">
                          {formatFullDateTime(user.last_active_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PanelCard>
        </div>

        {/* <PanelSectionTitle hint="含进行中、已归档与已删除的历史记录">
          会话状态分布
        </PanelSectionTitle>
        <ul
          className="flex flex-wrap gap-3"
          data-testid="thread-status-distribution"
        >
          {Object.entries(data?.status_distribution ?? {}).length === 0 ? (
            <li className="text-xs text-color-text-3">所选周期内没有会话。</li>
          ) : (
            Object.entries(data?.status_distribution ?? {}).map(
              ([status, count]) => (
                <li
                  key={status}
                  className="rounded-large border border-color-border-2 bg-color-bg-2 px-3 py-2 text-xs"
                >
                  <span className="text-color-text-3">
                    {conversationStatusLabel(status)}
                  </span>
                  <span className="ml-2 font-semibold tabular-nums text-color-text-1">
                    {count}
                  </span>
                </li>
              ),
            )
          )}
        </ul> */}
      </PanelBody>
    </div>
  );
};
