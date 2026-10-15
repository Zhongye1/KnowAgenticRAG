/**
 * 图表配色：把 `styles/tokens.css` 的 CSS 变量解析成 canvas 能用的具体色值。
 *
 * token 存的是 RGB 三元组，canvas 不认 `var(--x)`：要先让浏览器把 `rgb(var(--token))`
 * 解析成具体色值，之后才能进图表 option。
 *
 * 解析结果依赖当前主题，因此调用方必须在主题切换后重新解析并重建图表。
 */

/** 图表分类色：`--data-1` 到 `--data-20`（亮暗两套值不同）。 */
export const SERIES_COLOR_TOKENS = [
  '--data-1',
  '--data-2',
  '--data-3',
  '--data-4',
  '--data-5',
  '--data-6',
  '--data-7',
  '--data-8',
  '--data-9',
  '--data-10',
  '--data-11',
  '--data-12',
  '--data-13',
  '--data-14',
  '--data-15',
  '--data-16',
  '--data-17',
  '--data-18',
  '--data-19',
  '--data-20',
] as const;

/** 图表骨架色：坐标轴、分割线、文字、tooltip 与饼图描边。 */
export const FRAME_COLOR_TOKENS = [
  '--color-border-2',
  '--color-border-1',
  '--color-text-3',
  '--color-text-2',
  '--color-bg-1',
  '--color-bg-2',
] as const;

export const CHART_COLOR_TOKENS = [
  ...SERIES_COLOR_TOKENS,
  ...FRAME_COLOR_TOKENS,
] as const;

export type ChartPalette = {
  /** 分类色序列，按索引取用并循环。 */
  series: string[];
  axisLine: string;
  splitLine: string;
  axisLabel: string;
  legendText: string;
  tooltipBackground: string;
  tooltipBorder: string;
  /** 饼图扇区之间的描边色（与卡片背景同色）。 */
  surface: string;
};

/**
 * 在给定元素上解析一份 token → 具体色值。
 *
 * 把 `rgb(var(--token))` 写进元素的 `color`，再读 `getComputedStyle` 的解析结果。
 * 元素必须在文档里，否则浏览器不会解析变量。
 */
export const resolveChartColors = (
  element: HTMLElement,
  tokens: readonly string[] = CHART_COLOR_TOKENS,
): Record<string, string> => {
  const computed = getComputedStyle(element);
  const previous = element.style.color;
  const colors: Record<string, string> = {};
  for (const token of tokens) {
    element.style.color = `rgb(var(${token}))`;
    colors[token] = computed.color;
  }
  element.style.color = previous;
  return colors;
};

/** 从解析结果里取出图表要用的语义色；缺失时回落到一个不依赖主题的透明值。 */
export const readChartPalette = (
  colors: Record<string, string>,
): ChartPalette => ({
  series: SERIES_COLOR_TOKENS.map((token) => colors[token]).filter(Boolean),
  axisLine: colors['--color-border-2'],
  splitLine: colors['--color-border-1'],
  axisLabel: colors['--color-text-3'],
  legendText: colors['--color-text-2'],
  tooltipBackground: colors['--color-bg-1'],
  tooltipBorder: colors['--color-border-2'],
  surface: colors['--color-bg-1'],
});

/** 按索引取分类色；超出长度时循环。 */
export const seriesColor = (palette: ChartPalette, index: number): string =>
  palette.series.length === 0
    ? 'transparent'
    : palette.series[
        ((index % palette.series.length) + palette.series.length) %
          palette.series.length
      ];
