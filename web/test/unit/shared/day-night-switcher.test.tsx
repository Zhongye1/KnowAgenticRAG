import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DayNightSwitcher } from '@/shared/ui/DayNightSwitcher';

/**
 * 主题切换的圆形过渡必须「先写圆心与半径、再开 View Transition」。
 *
 * 反例是把裁切动画交给 WAAPI：伪元素从建好到 `transition.ready` 之间至少隔一帧，
 * 那一帧里新快照按没有裁切画，由深转浅时会先闪一帧整屏浅色。这套用例把顺序钉住。
 */
const installViewTransitionStub = () => {
  const seen: Record<string, string> = {};
  const startViewTransition = vi.fn((callback: () => void) => {
    // 在过渡开始的那一刻读属性：此时必须已经写好，伪元素才不会被画成未裁切
    const style = document.documentElement.style;
    seen.x = style.getPropertyValue('--reveal-x');
    seen.y = style.getPropertyValue('--reveal-y');
    seen.r = style.getPropertyValue('--reveal-r');
    callback();

    return {
      ready: Promise.resolve(),
      finished: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition: () => undefined,
    };
  });

  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: startViewTransition,
  });

  return { seen, startViewTransition };
};

/** jsdom 没有 `Element.prototype.animate`，装一个桩来断言它没被调用。 */
/**
 * 点击并冲干净微任务：`flushSync` 在 startViewTransition 回调里同步更新状态，
 * 组件自己还挂了一个监听 `data-theme` 的 MutationObserver，两者都要在 act 内落地。
 */
const clickSwitcher = async (clientX: number, clientY: number) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('switch'), { clientX, clientY });
  });
};

const installAnimateStub = () => {
  const animate = vi.fn();

  Object.defineProperty(document.documentElement, 'animate', {
    configurable: true,
    value: animate,
  });

  return animate;
};

describe('DayNightSwitcher 的主题过渡', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark', 'theme-transitioning');
    document.body.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition');
    vi.restoreAllMocks();
  });

  it('圆心与半径在 startViewTransition 之前写到 <html> 上', async () => {
    const { seen, startViewTransition } = installViewTransitionStub();
    render(<DayNightSwitcher />);

    await clickSwitcher(100, 200);

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(seen.x).toBe('100px');
    expect(seen.y).toBe('200px');
    // 半径取到最远角的距离，保证圆形能盖满视口
    expect(seen.r).toBe(
      `${Math.hypot(
        Math.max(100, window.innerWidth - 100),
        Math.max(200, window.innerHeight - 200),
      )}px`,
    );
  });

  it('不再用 WAAPI 给伪元素挂裁切动画', async () => {
    installViewTransitionStub();
    const animate = installAnimateStub();
    render(<DayNightSwitcher />);

    await clickSwitcher(10, 20);

    expect(animate).not.toHaveBeenCalled();
  });

  it('过渡期间挂 theme-transitioning，结束后摘掉', async () => {
    installViewTransitionStub();
    render(<DayNightSwitcher />);

    await clickSwitcher(10, 20);

    await waitFor(() =>
      expect(
        document.documentElement.classList.contains('theme-transitioning'),
      ).toBe(false),
    );
  });

  it('环境不支持 View Transition 时直接切主题，不写圆心', async () => {
    Reflect.deleteProperty(document, 'startViewTransition');
    render(<DayNightSwitcher />);

    await clickSwitcher(10, 20);

    expect(document.documentElement.style.getPropertyValue('--reveal-x')).toBe(
      '',
    );
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

/**
 * 裁切动画的样式契约。
 *
 * 每个方向只允许一个快照参与裁切，另一个必须保持 `animation: none`（整屏画满）垫在下面。
 * 两个方向都挂裁切时会同时出现内缩与外扩：旧快照半径从 r 收到 0、新快照从 0 涨到 r，
 * 两个半径互补，中途并集盖不满视口，四角会露出没被任何快照覆盖的区域。
 */
describe('主题过渡的样式契约', () => {
  // 先剥掉注释，否则匹配到的「选择器」会把前一段注释一起带进来
  const css = readFileSync(
    join(process.cwd(), 'src/index.css'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');

  /** 带 `theme-reveal-expand` 动画的规则选择器，按源码顺序。 */
  const animatedSelectors = (): string[] =>
    (
      css.match(/[^{}]+\{[^}]*animation:[^;]*theme-reveal-expand[^}]*\}/g) ?? []
    ).map((block) => block.slice(0, block.indexOf('{')).trim());

  it('每个方向只有一个伪元素参与裁切，且方向限定正确', () => {
    expect(animatedSelectors()).toEqual([
      'html.theme-transitioning:not(.dark)::view-transition-new(root)',
      'html.theme-transitioning.dark::view-transition-old(root)',
    ]);
  });
});
