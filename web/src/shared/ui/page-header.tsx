/**
 * 底边框页头：标题 + 中段插槽（放 `PageHeaderTabs`）+ 行尾动作区。
 *
 * 同行元素按基线对齐：标题 16px 与 tab 14px 字号不同，中心对齐会让文字底错开 2px。
 * ContentLayout 只给水平留白，页面自己补纵向（`py-4`）；fullHeight 页面（如个人空间）
 * 通过 `className` 带上自己的水平留白与高度约束。
 */
import * as React from 'react';

import { cn } from '@/shared/lib';
import { Button } from 'antd';

type PageHeaderProps = {
  title: string;
  /** 标题右侧的插槽，通常是 `PageHeaderTabs`（与标题之间一条竖分隔线）。 */
  children?: React.ReactNode;
  /** 行尾右对齐的动作区：统计芯片、说明文字、页内动作按钮等。 */
  actions?: React.ReactNode;
  /**
   * 加载指示：页头下沿走一条 2px 进度条。只表达「列表/数据在取数」，不承载
   * 请求成败——失败仍由内容区的状态呈现。
   */
  loading?: boolean;
  className?: string;
};

export const PageHeader = ({
  title,
  children,
  actions,
  loading = false,
  className,
}: PageHeaderProps) => (
  <header
    className={cn(
      'relative flex flex-wrap items-baseline gap-3 border-b border-color-border-1 py-2',
      className,
    )}
  >
    <h1 className="text-base font-semibold text-color-text-1">{title}</h1>
    {children}
    {actions ? (
      <div className="ml-auto flex flex-wrap items-baseline gap-2 self-center">
        {actions}
      </div>
    ) : null}
    {loading ? (
      <span
        className="absolute inset-x-0 bottom-[-1px] h-0.5 overflow-hidden bg-[var(--main-50)]"
        aria-hidden
      >
        <span className="absolute inset-0 w-2/5 animate-[page-loading_1.5s_linear_infinite] bg-[var(--main-500)]" />
      </span>
    ) : null}
  </header>
);

type PageHeaderTab<K extends string> = {
  key: K;
  label: string;
};

type PageHeaderTabsProps<K extends string> = {
  tabs: ReadonlyArray<PageHeaderTab<K>>;
  current: K;
  onChange: (key: K) => void;
  ariaLabel: string;
};

/**
 * 竖线分隔的 pill 式视图切换 tab。
 *
 * 参照 `.tab-item`：悬停 gray-50，选中是 gray-800 混 6% 的更深的灰；两种状态都不要
 * outline。URL 同步归页面自己——深链参数的默认值语义（删默认、恒写）不属于这里。
 */
export const PageHeaderTabs = <K extends string>({
  tabs,
  current,
  onChange,
  ariaLabel,
}: PageHeaderTabsProps<K>) => (
  <nav
    className="flex items-center gap-0.5 border-l border-[var(--gray-200)] pl-3"
    aria-label={ariaLabel}
  >
    {tabs.map((tab) => {
      const active = tab.key === current;
      return (
        <Button
          key={tab.key}
          htmlType="button"
          type="text"
          className={`h-7 rounded-[6px] border-0 px-2.5 text-sm outline-none ${
            active
              ? 'bg-[color-mix(in_srgb,var(--gray-800)_6%,var(--gray-0))] font-medium text-color-text-1'
              : 'bg-transparent text-color-text-3 hover:bg-[var(--gray-50)] hover:text-color-text-1'
          }`}
          aria-current={active ? 'page' : undefined}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </Button>
      );
    })}
  </nav>
);
