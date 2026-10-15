/**
 * EChart 包装的生命周期用例。
 *
 * 这块是命令式画布与 React 的边界，之前 6 个面板用例都把它替换成替身，因此
 * 「拿到非零尺寸才建实例」「主题切换重建」「卸载 dispose」三件容易错的事没有守卫。
 * 这里 mock `echarts/core` 只观测调用序列，不渲染真图表。
 */
import { render, screen, waitFor } from '@testing-library/react';
import type { EChartsCoreOption } from 'echarts/core';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 15000 });

const { echarts, theme } = vi.hoisted(() => ({
  echarts: {
    use: vi.fn(),
    init: vi.fn(),
  },
  theme: { isDark: false },
}));

vi.mock('echarts/core', () => ({
  use: (...args: unknown[]) => echarts.use(...args),
  init: (...args: unknown[]) => echarts.init(...args),
}));
vi.mock('echarts/charts', () => ({
  BarChart: {},
  LineChart: {},
  PieChart: {},
}));
vi.mock('echarts/components', () => ({
  GridComponent: {},
  LegendComponent: {},
  TooltipComponent: {},
}));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));
vi.mock('@/shared/lib', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib')>()),
  useIsDarkMode: () => theme.isDark,
}));

const { EChart } = await import('@/features/dashboard/ui/echart');

/** 捕获 ResizeObserver 回调，用来手动触发「尺寸变了」这条路径。 */
const observers: (() => void)[] = [];

class ResizeObserverStub {
  private readonly callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
    observers.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub);

/** 每次 init 返回一个可观测的实例。 */
const instances: {
  setOption: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}[] = [];

const stubSize = (width: number, height: number) => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => height,
  });
};

const renderChart = (option: EChartsCoreOption) =>
  render(<EChart testId="chart" option={() => option} ariaLabel="测试图表" />);

describe('EChart 包装', () => {
  beforeEach(() => {
    instances.length = 0;
    observers.length = 0;
    theme.isDark = false;
    echarts.init.mockReset().mockImplementation(() => {
      const instance = {
        setOption: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn(),
      };
      instances.push(instance);
      return instance;
    });
    stubSize(320, 200);
  });

  it('容器有尺寸时建实例并写入 option，卸载时 dispose', async () => {
    const view = renderChart({ series: [] });
    await waitFor(() => expect(instances).toHaveLength(1));
    expect(screen.getByTestId('chart')).toBeTruthy();
    await waitFor(() => expect(instances[0].setOption).toHaveBeenCalled());

    view.unmount();
    expect(instances[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('容器尺寸为 0 时不建实例，拿到尺寸后才建', async () => {
    stubSize(0, 0);
    renderChart({ series: [] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    // 变异：去掉非零尺寸守卫，这里会立刻 init 出一个 0 尺寸画布
    expect(instances).toHaveLength(0);

    stubSize(320, 200);
    // 尺寸由布局决定：模拟浏览器在容器变大后回调 ResizeObserver
    observers.at(-1)?.();
    await waitFor(() => expect(instances).toHaveLength(1));
  });

  it('主题切换重建实例（先 dispose 旧的再 init 新的）', async () => {
    const view = renderChart({ series: [] });
    await waitFor(() => expect(instances).toHaveLength(1));

    theme.isDark = true;
    view.rerender(
      <EChart
        testId="chart"
        option={() => ({ series: [] })}
        ariaLabel="测试图表"
      />,
    );

    await waitFor(() => expect(instances).toHaveLength(2));
    expect(instances[0].dispose).toHaveBeenCalledTimes(1);
    expect(instances[1].setOption).toHaveBeenCalled();
  });
});
