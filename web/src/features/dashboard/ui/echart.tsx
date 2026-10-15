/**
 * ECharts 画布与 React 的边界。
 *
 * 按需注册 `echarts/core`（bar/line/pie + grid/tooltip/legend + canvas），不引 `echarts-for-react`。
 * canvas 不认 `var(--x)`，配色必须先从 `tokens.css` 解析成具体色值；解析结果依赖主题，
 * 主题切换要重建实例，实例在 effect 清理时 dispose。实例等 ResizeObserver 拿到非零尺寸后
 * 才创建。调用方传的是「配色 → option」的构造函数，各面板只描述数据语义。
 */
import * as React from 'react';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

import {
  readChartPalette,
  resolveChartColors,
  type ChartPalette,
} from '../lib/chart-palette';
import { cn, useIsDarkMode } from '@/shared/lib';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

export type EChartProps = {
  /** 用当前配色构造 option；由面板提供，配色由本组件解析。 */
  option: (palette: ChartPalette) => EChartsCoreOption;
  height?: number;
  className?: string;
  ariaLabel?: string;
  testId?: string;
};

export const EChart = ({
  option,
  height = 240,
  className,
  ariaLabel,
  testId,
}: EChartProps) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<EChartsType | null>(null);
  const paletteRef = React.useRef<ChartPalette | null>(null);
  const optionRef = React.useRef(option);
  const isDark = useIsDarkMode();

  /** 把当前数据与配色写进实例；没有实例或没有配色时是空操作。 */
  const apply = React.useCallback(() => {
    const palette = paletteRef.current;
    if (!chartRef.current || !palette) return;
    chartRef.current.setOption(optionRef.current(palette), true);
  }, []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let observer: ResizeObserver | null = null;

    /** 拿到非零尺寸才建实例：隐藏面板里的 0 尺寸画布不会自己长回来。 */
    const ensure = () => {
      if (!chartRef.current) {
        if (container.clientWidth <= 0 || container.clientHeight <= 0) return;
        paletteRef.current = readChartPalette(resolveChartColors(container));
        chartRef.current = echarts.init(container);
      }
      chartRef.current.resize();
      apply();
    };

    ensure();
    observer = new ResizeObserver(ensure);
    observer.observe(container);

    return () => {
      observer?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
      paletteRef.current = null;
    };
  }, [isDark, apply]);

  React.useEffect(() => {
    optionRef.current = option;
    apply();
  }, [option, apply]);

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      // canvas 画布装不进 <img>：role="img" + aria-label 是图表容器的标准语义
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- canvas 画布没有等价标签
      role="img"
      aria-label={ariaLabel}
      className={cn('w-full', className)}
      style={{ height }}
    />
  );
};
