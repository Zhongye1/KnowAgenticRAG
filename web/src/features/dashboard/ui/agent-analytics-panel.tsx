/**
 * 智能体分析面板：概览指标 + 对话/工具调用并列柱图 + 表现表。
 *
 * 名称只用后端下发的 `agent_names`，缺失时退回 `agent_id`；没有头像生成与外部元信息补全。
 */
import { Bot, MessageSquare, Wrench } from 'lucide-react';

import {
  buildAgentRankOption,
  hasAgentUsage,
  rankAgents,
  sortAgentSatisfaction,
} from '../lib/chart-options';
import { formatNumber } from '../lib/dashboard-format';
import { formatPercent, satisfactionTextTone } from '../lib/dashboard-metrics';
import { useAgentAnalytics } from '../model/dashboard-queries';
import { EChart } from './echart';
import { MetricCard, MetricGrid } from './metric-card';
import { PanelBody, PanelCard, PanelSectionTitle } from './panel-card';
import { cn } from '@/shared/lib';
import { Empty } from '@/shared/ui/empty';

const TEXT_TONES = {
  success: 'text-success-7',
  warning: 'text-warning-7',
  danger: 'text-danger-7',
} as const;

export const AgentAnalyticsPanel = ({
  className,
}: { className?: string } = {}) => {
  const analytics = useAgentAnalytics();
  const data = analytics.data;
  const ranked = data ? rankAgents(data, 3) : [];
  const performers = data ? sortAgentSatisfaction(data) : [];
  const totalConversations = (data?.agent_conversation_counts ?? []).reduce(
    (sum, item) => sum + Number(item.conversation_count ?? 0),
    0,
  );
  const totalToolUsage = (data?.agent_tool_usage ?? []).reduce(
    (sum, item) => sum + Number(item.tool_usage_count ?? 0),
    0,
  );

  return (
    <PanelCard
      title="智能体分析"
      description="调用量与满意度按智能体拆分"
      testId="agent-analytics"
      className={className}
    >
      <PanelBody
        loading={analytics.isPending}
        error={analytics.isError}
        onRetry={() => void analytics.refetch()}
        errorText="智能体分析加载失败。"
        height={320}
        testId="agent-analytics"
      >
        <MetricGrid className="grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))]">
          <MetricCard
            icon={Bot}
            value={formatNumber(data?.total_agents)}
            label="智能体总数"
            tone="info"
            compact
          />
          <MetricCard
            icon={MessageSquare}
            value={formatNumber(totalConversations)}
            label="总对话数"
            tone="accent"
            compact
          />
          <MetricCard
            icon={Wrench}
            value={formatNumber(totalToolUsage)}
            label="工具调用总数"
            tone="warning"
            compact
          />
        </MetricGrid>

        <div className="border-t border-color-border-2 pt-3.5">
          <PanelSectionTitle hint="按对话数与工具调用数取前 3">
            对话 / 工具调用分布
          </PanelSectionTitle>
          {data && ranked.length > 0 && hasAgentUsage(data) ? (
            <EChart
              testId="agent-rank-chart"
              ariaLabel="智能体对话数与工具调用数柱图"
              height={220}
              option={(palette) =>
                buildAgentRankOption({ agents: data, palette }) ?? {}
              }
            />
          ) : (
            <Empty
              description="暂无智能体调用记录。当前实例还没有智能体产生对话或工具调用。"
              className="py-6"
            />
          )}
        </div>

        <div className="border-t border-color-border-2 pt-3.5">
          <PanelSectionTitle hint="有反馈的排在前面">
            智能体满意度
          </PanelSectionTitle>
          {performers.length === 0 ? (
            <Empty description="暂无智能体数据。" className="py-6" />
          ) : (
            <div className="overflow-x-auto">
              {/* 面板在 1/3 宽里，列少而窄：不设 min-width，避免满意度列被挤出视口 */}
              <table className="w-full text-left text-xs">
                <thead className="text-color-text-3">
                  <tr className="border-b border-color-border-2">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      智能体
                    </th>
                    <th
                      scope="col"
                      className="py-2 pr-3 text-right font-medium"
                    >
                      对话数
                    </th>
                    <th
                      scope="col"
                      className="py-2 pr-3 text-right font-medium"
                    >
                      反馈数
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      满意度
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {performers.map((agent) => (
                    <tr
                      key={agent.agent_id}
                      data-testid="agent-satisfaction-row"
                      className="border-b border-color-border-2 last:border-b-0"
                    >
                      <td
                        className="max-w-[220px] truncate py-2 pr-3 text-color-text-1"
                        title={agent.agent_id}
                      >
                        {agent.name}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-color-text-2">
                        {agent.conversationCount}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-color-text-2">
                        {agent.totalFeedbacks}
                      </td>
                      <td
                        className={cn(
                          'py-2 text-right font-semibold tabular-nums',
                          agent.totalFeedbacks > 0
                            ? TEXT_TONES[
                                satisfactionTextTone(agent.satisfactionRate)
                              ]
                            : 'text-color-text-3',
                        )}
                      >
                        {/* 后端在没有反馈时把 satisfaction_rate 记成 100，直接展示会让闲置智能体显示绿色 100% */}
                        {agent.totalFeedbacks > 0
                          ? formatPercent(agent.satisfactionRate)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PanelBody>
    </PanelCard>
  );
};
