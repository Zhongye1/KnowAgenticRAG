/**
 * 图表配色解析用例。
 *
 * token 存的是 RGB 三元组，canvas 不认 `var(--x)`，所以解析必须走
 * 「把 `rgb(var(--token))` 写进元素再读 computed」这条真实路径，
 * 并且不能把元素原有的 color 留下来。这里用替身观测这条路径，
 * 不断言浏览器算出的具体色值（那是主题变量的职责）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CHART_COLOR_TOKENS,
  FRAME_COLOR_TOKENS,
  SERIES_COLOR_TOKENS,
  readChartPalette,
  resolveChartColors,
  seriesColor,
} from '@/features/dashboard/lib/chart-palette';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('token → 色值解析', () => {
  it('逐个 token 写进 color 再读 computed，最后恢复原值', () => {
    // 变异：写进 `background` 而不是 `color` 会让 computed 读回透明白
    const element = document.createElement('div');
    document.body.append(element);

    // jsdom 会把 `rgb(var(--x))` 当非法色值丢掉，所以直接观测「写进去的是什么」：
    // 元素 color 的读写都被替换成记录器，计算样式替身按最后一次写入返回结果。
    const writes: string[] = [];
    Object.defineProperty(element.style, 'color', {
      configurable: true,
      get: () => (writes.length === 0 ? 'rgb(255, 0, 0)' : writes.at(-1)),
      set: (value: string) => {
        writes.push(value);
      },
    });
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (() =>
        ({
          get color() {
            return `resolved(${writes.at(-1)})`;
          },
        }) as unknown as CSSStyleDeclaration) as typeof window.getComputedStyle,
    );

    const colors = resolveChartColors(element, ['--data-1', '--data-2']);

    // 两个 token 都写成 rgb(var(--token))，收尾把原值写回去
    expect(writes).toEqual([
      'rgb(var(--data-1))',
      'rgb(var(--data-2))',
      'rgb(255, 0, 0)',
    ]);
    expect(colors).toEqual({
      '--data-1': 'resolved(rgb(var(--data-1)))',
      '--data-2': 'resolved(rgb(var(--data-2)))',
    });
    element.remove();
  });

  it('默认解析全部图表 token：20 个分类色 + 骨架色，不重复', () => {
    expect(SERIES_COLOR_TOKENS).toHaveLength(20);
    expect(CHART_COLOR_TOKENS).toHaveLength(20 + FRAME_COLOR_TOKENS.length);
    expect(new Set(CHART_COLOR_TOKENS).size).toBe(CHART_COLOR_TOKENS.length);
  });
});

describe('配色读数', () => {
  it('按语义取色，分类色按 token 顺序排列', () => {
    const colors = Object.fromEntries(
      CHART_COLOR_TOKENS.map((token, index) => [token, `color-${index}`]),
    );
    const palette = readChartPalette(colors);
    expect(palette.series).toEqual(
      SERIES_COLOR_TOKENS.map((token) => colors[token]),
    );
    expect(palette.axisLine).toBe(colors['--color-border-2']);
    expect(palette.splitLine).toBe(colors['--color-border-1']);
    expect(palette.axisLabel).toBe(colors['--color-text-3']);
    expect(palette.surface).toBe(colors['--color-bg-1']);
  });

  it('缺 token 时不留 undefined，分类色循环取用', () => {
    // 变异：缺色时返回 undefined 会让 ECharts 回落到自带默认调色板
    const palette = readChartPalette({ '--data-1': 'only-one' });
    expect(palette.series).toEqual(['only-one']);
    expect(seriesColor(palette, 0)).toBe('only-one');
    expect(seriesColor(palette, 1)).toBe('only-one');
    expect(seriesColor(palette, -1)).toBe('only-one');
    expect(seriesColor(readChartPalette({}), 0)).toBe('transparent');
  });
});
