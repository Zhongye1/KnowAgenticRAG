/**
 * 数据总览的区块外壳与面板状态。
 *
 * `PanelCard` 给标题、右上角操作与内容，统一走 `--color-bg-1` + `--color-border-1`
 * + 8px 圆角，不加阴影（普通内容卡片）。
 * `PanelBody` 承担加载/失败两态：失败必须能重试，而不是留一块空白。
 */
import type * as React from 'react';

import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/spinner';

export const PanelCard = ({
  title,
  description,
  actions,
  children,
  className,
  testId,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) => (
  <section
    data-testid={testId}
    className={cn(
      'flex min-w-0 flex-col rounded-large border border-color-border-1 bg-color-bg-1',
      className,
    )}
  >
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-color-border-1 px-4 py-3">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-color-text-1">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-color-text-3">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
    <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-4">
      {children}
    </div>
  </section>
);

/** 面板内的分组小标题（与卡片标题区分层级）。 */
export const PanelSectionTitle = ({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) => (
  <div className="flex flex-wrap items-baseline gap-2">
    <h4 className="text-sm font-semibold text-color-text-1">{children}</h4>
    {hint ? (
      <span className="text-[11px] text-color-text-3">{hint}</span>
    ) : null}
  </div>
);

/**
 * 面板内容的加载/失败两态。
 *
 * 加载中给固定高度而不是空 div：否则数据到位时整页跳动。
 * 失败态带重试入口，重试就是重新发这次查询（`refetch`）。
 */
export const PanelBody = ({
  loading,
  error,
  onRetry,
  errorText = '数据加载失败。',
  height = 240,
  children,
  testId,
}: {
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  errorText?: string;
  height?: number;
  children: React.ReactNode;
  testId?: string;
}) => {
  if (error) {
    return (
      <div
        data-testid={testId ? `${testId}-error` : undefined}
        role="alert"
        className="flex flex-col items-center justify-center gap-3 text-xs text-danger-7"
        style={{ minHeight: height }}
      >
        <span>{errorText}</span>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            重新加载
          </Button>
        ) : null}
      </div>
    );
  }
  if (loading) {
    return (
      <div
        data-testid={testId ? `${testId}-loading` : undefined}
        className="flex items-center justify-center"
        style={{ minHeight: height }}
      >
        <Spinner size="md" className="text-color-text-3" />
      </div>
    );
  }
  return (
    <div data-testid={testId} className="flex min-w-0 flex-col gap-4">
      {children}
    </div>
  );
};
