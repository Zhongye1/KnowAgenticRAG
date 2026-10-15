/**
 * 工具调用监控面板：三张紧凑指标卡 + Top 10 柱图 + 错误分布饼图与表。
 *
 * Top 10 由 `lib/chart-options.ts` 的 `rankTools` 按调用次数降序取前 10。
 *
 * 空态要给显式文案：指标卡照常显示 0，排行与错误分布不留空白图。
 */
import { Activity, BadgeCheck, CircleAlert } from 'lucide-react';

import {
  buildToolErrorPieOption,
  buildToolRankOption,
  rankErrorDistribution,
} from '../lib/chart-options';
import { formatNumber } from '../lib/dashboard-format';
import {
  formatPercent,
  metricValueTone,
  successRateTone,
} from '../lib/dashboard-metrics';
import { hasToolErrors, isToolStatsEmpty } from '../lib/tool-feedback-view';
import { useToolCallStats } from '../model/dashboard-queries';
import { EChart } from './echart';
import { MetricCard, MetricGrid } from './metric-card';
import { PanelBody, PanelCard, PanelSectionTitle } from './panel-card';
import { Empty } from '@/shared/ui/empty';

export const ToolStatsPanel = ({ className }: { className?: string } = {}) => {
  const stats = useToolCallStats();
  const data = stats.data;
  const empty = isToolStatsEmpty(data);
  const errors = rankErrorDistribution(data?.tool_error_distribution ?? {});

  return (
    <PanelCard
      title="工具调用监控"
      description="调用量、成功率与失败原因"
      testId="tool-stats"
      className={className}
    >
      <PanelBody
        loading={stats.isPending}
        error={stats.isError}
        onRetry={() => void stats.refetch()}
        errorText="工具调用统计加载失败。"
        height={320}
        testId="tool-stats"
      >
        <MetricGrid className="grid-cols-[repeat(auto-fit,minmax(min(100%,130px),1fr))]">
          <MetricCard
            icon={Activity}
            value={formatNumber(data?.total_calls)}
            label="总调用次数"
            tone="info"
            compact
          />
          <MetricCard
            icon={CircleAlert}
            value={formatNumber(data?.failed_calls)}
            label="失败调用"
            tone="warning"
            compact
          />
          <MetricCard
            icon={BadgeCheck}
            value={formatPercent(data?.success_rate)}
            label="成功率"
            tone={successRateTone(data?.success_rate)}
            valueTone={metricValueTone(successRateTone(data?.success_rate))}
            compact
          />
        </MetricGrid>

        {empty ? (
          <Empty
            description="暂无工具调用记录。当前实例还没有工具被调用，产生调用后这里会显示 Top 10 排行与错误分布。"
            className="py-8"
          />
        ) : (
          <>
            <div className="border-t border-color-border-2 pt-3.5">
              <PanelSectionTitle hint="按调用次数取前 10">
                最常用工具
              </PanelSectionTitle>
              {data ? (
                <EChart
                  testId="tool-rank-chart"
                  ariaLabel="最常用工具调用次数柱图"
                  height={220}
                  option={(palette) =>
                    buildToolRankOption({
                      tools: data.most_used_tools,
                      palette,
                    })
                  }
                />
              ) : null}
            </div>

            <div className="border-t border-color-border-2 pt-3.5">
              <PanelSectionTitle hint="按错误次数取前 5">
                工具错误分析
              </PanelSectionTitle>
              {hasToolErrors(data) ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-color-text-3">
                        <tr className="border-b border-color-border-2">
                          <th scope="col" className="py-2 pr-3 font-medium">
                            工具名称
                          </th>
                          <th
                            scope="col"
                            className="py-2 text-right font-medium"
                          >
                            错误次数
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {errors.map((row) => (
                          <tr
                            key={row.tool_name}
                            data-testid="tool-error-row"
                            className="border-b border-color-border-2 last:border-b-0"
                          >
                            <td className="py-2 pr-3 font-mono text-[11px] text-color-text-2">
                              {row.tool_name}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              <span
                                className={
                                  row.error_count > 5
                                    ? 'font-semibold text-danger-7'
                                    : 'text-warning-7'
                                }
                              >
                                {row.error_count}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data ? (
                    <EChart
                      testId="tool-error-chart"
                      ariaLabel="工具错误分布环形图"
                      height={200}
                      option={(palette) =>
                        buildToolErrorPieOption({
                          distribution: data.tool_error_distribution,
                          palette,
                        }) ?? {}
                      }
                    />
                  ) : null}
                </div>
              ) : (
                <Empty description="暂无工具调用失败记录。" className="py-6" />
              )}
            </div>
          </>
        )}
      </PanelBody>
    </PanelCard>
  );
};
