/** 列表筛选组。 */
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
