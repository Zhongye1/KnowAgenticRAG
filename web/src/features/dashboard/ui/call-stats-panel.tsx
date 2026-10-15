/**
 * 调用统计面板：类型 × 时间范围的分段切换 + 堆叠柱图 + 本次口径的汇总数字。
 *
 * 汇总数字（总量 / 每桶均值 / 峰值与峰值时间）随同一份响应下发，不额外发请求；
 * 切换维度就是换查询键，加载态与失败态都留在面板内。
 */
import * as React from 'react';

import type { CallMetricType, CallTimeRange } from '../api/dashboard-api';
import {
  buildCallTimeseriesOption,
  formatCallBucketLabel,
  formatCallValue,
  isCallTimeseriesEmpty,
} from '../lib/chart-options';
import { useCallTimeseries } from '../model/dashboard-queries';
import { EChart } from './echart';
import { PanelBody, PanelCard } from './panel-card';
import { ToggleGroup } from './toggle-group';
import { Empty } from '@/shared/ui/empty';

const TIME_RANGE_OPTIONS: { value: CallTimeRange; label: string }[] = [
  { value: '14hours', label: '近 14 小时' },
  { value: '14days', label: '近 14 天' },
  { value: '14weeks', label: '近 14 周' },
];

const METRIC_TYPE_OPTIONS: { value: CallMetricType; label: string }[] = [
  { value: 'models', label: '模型调用' },
  { value: 'agents', label: '智能体调用' },
  { value: 'tokens', label: 'Token 消耗' },
  { value: 'tools', label: '工具调用' },
];

export const CallStatsPanel = ({ className }: { className?: string } = {}) => {
  const [timeRange, setTimeRange] = React.useState<CallTimeRange>('14days');
  const [metricType, setMetricType] = React.useState<CallMetricType>('agents');
  const timeseries = useCallTimeseries(metricType, timeRange);
  // 展示口径跟着数据走：取数期间 data 仍是上一份，配套口径也是上一份，
  // 否则汇总单位与峰值分桶标签会按新口径去渲染旧数据
  const shown = timeseries.data;
  const data = shown?.stats;
  const shownType = shown?.type ?? metricType;
  const shownRange = shown?.timeRange ?? timeRange;

  const summary = [
    {
      label: '总调用量',
      value: formatCallValue(Number(data?.total_count ?? 0), shownType),
    },
    {
      label: '每单位均值',
      value: formatCallValue(Number(data?.average_count ?? 0), shownType),
    },
    {
      label: '峰值',
      value:
        data?.peak_count === undefined
          ? '—'
          : `${formatCallValue(Number(data.peak_count), shownType)}（${
              data.peak_date
                ? formatCallBucketLabel(data.peak_date, shownRange)
                : '无'
            }）`,
    },
  ];

  return (
    <PanelCard
      title="调用统计"
      description="按维度与时间范围统计调用量，切换即重新取数"
      testId="call-stats"
      className={className}
      actions={
        <>
          <ToggleGroup
            label="时间范围"
            value={timeRange}
            options={TIME_RANGE_OPTIONS}
            onChange={setTimeRange}
            disabled={timeseries.isFetching}
            testId="call-time-range"
          />
          <ToggleGroup
            label="调用类型"
            value={metricType}
            options={METRIC_TYPE_OPTIONS}
            onChange={setMetricType}
            disabled={timeseries.isFetching}
            testId="call-metric-type"
          />
        </>
      }
    >
      <PanelBody
        loading={timeseries.isPending}
        error={timeseries.isError}
        onRetry={() => void timeseries.refetch()}
        errorText="调用统计加载失败。"
        height={320}
        testId="call-stats"
      >
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-3">
          {summary.map((item) => (
            <div
              key={item.label}
              className="rounded-large bg-color-bg-2 px-3 py-2"
            >
              <dt className="text-[11px] text-color-text-3">{item.label}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-color-text-1">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        {data && !isCallTimeseriesEmpty(data) ? (
          <EChart
            testId="call-stats-chart"
            ariaLabel={`${METRIC_TYPE_OPTIONS.find((option) => option.value === shownType)?.label ?? ''}调用量堆叠柱图`}
            height={280}
            option={(palette) =>
              buildCallTimeseriesOption({
                timeseries: data,
                timeRange: shownRange,
                metricType: shownType,
                palette,
              })
            }
          />
        ) : (
          <Empty
            description="该口径在所选时间范围内没有调用记录，可切换类型或时间范围。"
            className="py-8"
          />
        )}
      </PanelBody>
    </PanelCard>
  );
};
