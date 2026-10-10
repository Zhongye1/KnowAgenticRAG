/**
 * ECharts 底座的测试替身。
 *
 * 它不画图：真实 canvas 在 jsdom 里拿不到 2D 上下文。替身做的是把 option 构造函数
 * 用一份固定配色跑一遍，把「业务结果」——系列名、系列数值、横轴与纵轴标签——
 * 以 JSON 暴露成可断言的文本，因此组件用例仍能验证真的构造出了什么数据系列。
 */
import type { ChartPalette } from '@/features/dashboard/lib/chart-palette';

export const PROBE_PALETTE: ChartPalette = {
  series: ['#s1', '#s2', '#s3', '#s4'],
  axisLine: 'axis-line',
  splitLine: 'split-line',
  axisLabel: 'axis-label',
  legendText: 'legend-text',
  tooltipBackground: 'tip-bg',
  tooltipBorder: 'tip-border',
  surface: 'surface',
};

type SeriesShape = { name?: string; type?: string; data?: unknown[] };
type AxisShape = { data?: unknown[] };

export const EChart = ({
  option,
  height,
  ariaLabel,
  testId,
}: {
  option: (palette: ChartPalette) => Record<string, unknown>;
  height?: number;
  ariaLabel?: string;
  testId?: string;
}) => {
  const built = option(PROBE_PALETTE);
  const series = (built.series ?? []) as SeriesShape[];
  const xAxis = (built.xAxis ?? {}) as AxisShape;
  const yAxis = (built.yAxis ?? {}) as AxisShape;

  return (
    <div
      data-testid={testId}
      data-chart-label={ariaLabel}
      data-chart-height={height}
    >
      <span data-testid={`${testId}-xaxis`}>
        {JSON.stringify(xAxis.data ?? [])}
      </span>
      <span data-testid={`${testId}-yaxis`}>
        {JSON.stringify(yAxis.data ?? [])}
      </span>
      {series.map((item, index) => (
        <span
          key={index}
          data-testid={`${testId}-series-${index}`}
          data-series-name={item.name ?? ''}
          data-series-type={item.type ?? ''}
        >
          {JSON.stringify(item.data ?? [])}
        </span>
      ))}
    </div>
  );
};
