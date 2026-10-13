import { useEffect, useState, type MouseEvent } from 'react';

import {
  applyTheme,
  getInitialTheme,
  toggleTheme,
  type Theme,
} from '@/shared/lib/theme';
import { cn } from '@/shared/lib/utils';

import './day-night-switcher.css';

const CLOUD_COUNT = 3;
const STAR_COUNT = 5;

type DayNightSwitcherProps = {
  className?: string;
};

/**
 * 日夜切换开关。
 *
 * 主题状态与切换动作在 `shared/lib/theme.ts`：用户菜单里也有一个切换入口，两处必须
 * 走同一条路径。这里只在挂载时落一次持久化偏好，并跟随 `body[data-theme]` 同步渲染。
 */
export function DayNightSwitcher({ className }: DayNightSwitcherProps) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const isDark = theme === 'dark';

  useEffect(() => {
    applyTheme(getInitialTheme());
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const current = document.body.getAttribute('data-theme');
      if (current === 'light' || current === 'dark') setTheme(current);
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const handleToggle = (event: MouseEvent<HTMLButtonElement>) => {
    toggleTheme({ x: event.clientX, y: event.clientY });
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="切换日间/夜间模式"
      className={cn('dns-switch', isDark && 'dns-switch--dark', className)}
      onClick={handleToggle}
    >
      <span className="dns-switch__sky" aria-hidden="true">
        <span className="dns-switch__orb" />
        {Array.from({ length: CLOUD_COUNT }, (_, i) => (
          <span
            key={`dns-cloud-${i + 1}`}
            className={`dns-switch__cloud dns-switch__cloud--${i + 1}`}
          />
        ))}
        {Array.from({ length: STAR_COUNT }, (_, i) => (
          <span
            key={`dns-star-${i + 1}`}
            className={`dns-switch__star dns-switch__star--${i + 1}`}
          />
        ))}
      </span>
    </button>
  );
}
