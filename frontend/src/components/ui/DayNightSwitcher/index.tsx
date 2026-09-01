import { useEffect, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';

import { cn } from '@/utils/cn';

import './day-night-switcher.css';

type Theme = 'light' | 'dark';

const THEME_KEY = 'ragf-theme';
const CLOUD_COUNT = 3;
const STAR_COUNT = 5;

function readStoredTheme(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function getInitialTheme(): Theme {
  const stored = readStoredTheme();
  if (stored === 'light' || stored === 'dark') return stored;

  const bodyTheme = document.body.getAttribute('data-theme');
  if (bodyTheme === 'light' || bodyTheme === 'dark') return bodyTheme;

  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.body.setAttribute('data-theme', theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

type DayNightSwitcherProps = {
  className?: string;
};

export function DayNightSwitcher({ className }: DayNightSwitcherProps) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const isDark = theme === 'dark';

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // 隐私模式下 localStorage 可能不可用，忽略即可
    }
  }, [isDark, theme]);

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

  const toggleTheme = (event: MouseEvent<HTMLButtonElement>) => {
    const nextIsDark = !isDark;
    const next = nextIsDark ? 'dark' : 'light';

    const isAppearanceTransition =
      typeof document.startViewTransition === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isAppearanceTransition) {
      setTheme(next);
      return;
    }

    const x = event.clientX;
    const y = event.clientY;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    // 标记主题切换进行中：让 root 快照的圆形过渡样式（见 index.css）
    // 只在主题切换期间生效，页面跳转转场复用同一组 root 快照
    document.documentElement.classList.add('theme-transitioning');

    const transition = document.startViewTransition(() => {
      flushSync(() => setTheme(next));
      applyTheme(next);
    });

    const endThemeTransition = () =>
      document.documentElement.classList.remove('theme-transitioning');
    transition.finished.then(endThemeTransition, endThemeTransition);

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ];
      document.documentElement.animate(
        {
          clipPath: nextIsDark ? [...clipPath].reverse() : clipPath,
        },
        {
          duration: 400,
          easing: 'ease-out',
          fill: 'forwards',
          pseudoElement: nextIsDark
            ? '::view-transition-old(root)'
            : '::view-transition-new(root)',
        },
      );
    });
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="切换日间/夜间模式"
      className={cn('dns-switch', isDark && 'dns-switch--dark', className)}
      onClick={toggleTheme}
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
