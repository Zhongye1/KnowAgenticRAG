/**
 * 主题感知。
 *
 * 主题由 `html.dark` 类表达（见 `shared/ui/DayNightSwitcher`）。需要按主题切换
 * 渲染结果的模块（代码高亮、图表）订阅这个 hook，而不是各自读 localStorage。
 */
import * as React from 'react';

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
