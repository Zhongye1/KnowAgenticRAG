/**
 * 数据总览的指标卡与指标网格。
 *
 * 图标色块按 tone 上色，数值与标签用中性色。
 * 只有「数值本身表达状态」（满意度、成功率）时才用 `valueTone` 给数值上色——
 * 语义色不做装饰。
 */
import type * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import type { MetricTone, TextTone } from '../lib/dashboard-metrics';
import { cn } from '@/shared/lib';

const ICON_TONES: Record<MetricTone, string> = {
  primary: 'bg-primary-1 text-primary-6',
  success: 'bg-success-1 text-success-7',
  info: 'bg-link-1 text-link-7',
  warning: 'bg-warning-1 text-warning-7',
  accent: 'bg-color-fill-2 text-color-text-2',
  neutral: 'bg-color-fill-2 text-color-text-3',
};

const VALUE_TONES: Record<TextTone, string> = {
  success: 'text-success-7',
  warning: 'text-warning-7',
  danger: 'text-danger-7',
};

export type MetricCardProps = {
  icon: LucideIcon;
  /** 已格式化的数值文案（格式化在 lib 段完成）。 */
  value: string;
  label: string;
  tone?: MetricTone;
  valueTone?: TextTone;
  compact?: boolean;
  onClick?: () => void;
  /** 可点击卡片的无障碍名称；不给时退回「标签 + 数值」。 */
  ariaLabel?: string;
  testId?: string;
};

export const MetricCard = ({
  icon: Icon,
  value,
  label,
  tone = 'neutral',
  valueTone,
  compact = false,
  onClick,
  ariaLabel,
  testId,
}: MetricCardProps) => {
  const content = (
    <>
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-large',
          compact ? 'size-7' : 'size-9',
          ICON_TONES[tone],
        )}
      >
        <Icon className={compact ? 'size-3.5' : 'size-[18px]'} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate font-bold tabular-nums leading-tight',
            compact ? 'text-lg' : 'text-2xl',
            valueTone ? VALUE_TONES[valueTone] : 'text-color-text-1',
          )}
        >
          {value}
        </span>
        <span
          className={cn(
            'mt-0.5 block truncate text-color-text-3',
            compact ? 'text-[10px]' : 'text-xs',
          )}
        >
          {label}
        </span>
      </span>
    </>
  );

  const className = cn(
    'flex w-full min-w-0 items-center rounded-large border border-color-border-1 bg-color-bg-1 text-left',
    compact ? 'gap-2.5 p-2.5' : 'gap-3 p-4',
  );

  if (onClick) {
    return (
      <button
        type="button"
        data-testid={testId}
        className={cn(className, 'hover:border-primary-3 hover:bg-color-bg-2')}
        aria-label={ariaLabel ?? `${label} ${value}`}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <article data-testid={testId} className={className}>
      {content}
    </article>
  );
};

export const MetricGrid = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,168px),1fr))] gap-3',
      className,
    )}
  >
    {children}
  </div>
);
