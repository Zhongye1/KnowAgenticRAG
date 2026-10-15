/**
 * 主题感知与切换。
 *
 * 主题由 `html.dark` 类表达，`body[data-theme]` 同步一份供既有样式读取；`html.dark`
 * 是唯一事实源。需要按主题切换渲染结果的模块订阅 `useIsDarkMode`，切换主题统一走
 * `toggleTheme`，不要在别处直接改这两个属性。
 */
import * as React from 'react';

export type Theme = 'light' | 'dark';

/** 主题偏好的 localStorage 键名。 */
export const THEME_STORAGE_KEY = 'ars-theme';

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

/** 初始主题：本地偏好优先，其次 `body[data-theme]`，最后看 `html.dark`。 */
export function getInitialTheme(): Theme {
  const stored = readStoredTheme();
  if (stored) return stored;

  const bodyTheme = document.body.getAttribute('data-theme');
  if (bodyTheme === 'light' || bodyTheme === 'dark') return bodyTheme;

  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/** 应用主题并持久化；隐私模式下写不进去只影响下次打开。 */
export function applyTheme(theme: Theme): void {
  document.body.setAttribute('data-theme', theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage 不可用时忽略即可
  }
}

/**
 * 切换主题。
 *
 * 支持 View Transition 时从 `origin` 处做圆形扩散；`origin` 缺省时用视口中心，
 * 键盘触发走的就是这条。圆心与半径必须在 `startViewTransition` 之前写到 `<html>`
 * 上：动画声明在 `src/index.css` 的伪元素选择器上，伪元素一建出来就已经裁到 0，
 * 不会先闪一帧整屏新主题色。
 */
export function toggleTheme(origin?: { x: number; y: number }): void {
  const next: Theme = document.documentElement.classList.contains('dark')
    ? 'light'
    : 'dark';

  const canTransition =
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!canTransition) {
    applyTheme(next);
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  const root = document.documentElement;
  root.style.setProperty('--reveal-x', `${x}px`);
  root.style.setProperty('--reveal-y', `${y}px`);
  root.style.setProperty('--reveal-r', `${endRadius}px`);

  // 标记主题切换进行中：让 root 快照的圆形过渡样式只在主题切换期间生效
  root.classList.add('theme-transitioning');

  const transition = document.startViewTransition(() => applyTheme(next));
  const endThemeTransition = () => root.classList.remove('theme-transitioning');
  transition.finished.then(endThemeTransition, endThemeTransition);
}

/** 当前是否暗色主题；跟随 `html.dark` 的变化。 */
export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = React.useState(() =>
    typeof document === 'undefined'
      ? false
      : document.documentElement.classList.contains('dark'),
  );

  React.useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains('dark'));
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
