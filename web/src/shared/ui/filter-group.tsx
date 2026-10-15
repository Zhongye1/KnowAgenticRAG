/**
 * 列表筛选组。
 *
 * 与 `PageHeaderTabs` 同一套视觉词汇（无边框、`h-7`、`rounded-[6px]`、选中浅灰底 + 深字、
 * 悬停 gray-50），但语义不同：`PageHeaderTabs` 表达「当前在哪个视图」（`aria-current="page"`），
 * 这里表达「当前列表按什么过滤」（`aria-pressed`）。把筛选塞进 `aria-current` 的 nav 里，
 * 读屏用户会听到错误的语义。
 *
 * 用原生 `<button>` 而不是 antd `Button`：antd reset 在 base 层不重置 button 背景，
 * 而 `variant`/`color` 组合的选中态是本仓参照色板外的实心块，与页头 tab 不是一套语言。
 */
import * as React from 'react';

import { cn } from '@/shared/lib';

export type FilterOption<Value extends string> = {
  value: Value;
  label: string;
};

export const FilterGroup = <Value extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  /** 无障碍名；筛选组没有可见文案，靠它给读屏与测试定位。 */
  label: string;
  /** 当前选中的值。 */
  value: Value;
  options: ReadonlyArray<FilterOption<Value>>;
  onChange: (value: Value) => void;
  className?: string;
}) => (
  <fieldset
    aria-label={label}
    className={cn(
      'm-0 flex flex-wrap items-center gap-1 border-0 p-0',
      className,
    )}
  >
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={active}
          className={cn(
            'h-7 rounded-[6px] border-0 bg-transparent px-2.5 text-sm outline-none',
            active
              ? 'bg-[color-mix(in_srgb,var(--gray-800)_6%,var(--gray-0))] font-medium text-color-text-1'
              : 'text-color-text-3 hover:bg-[var(--gray-50)] hover:text-color-text-1',
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      );
    })}
  </fieldset>
);
