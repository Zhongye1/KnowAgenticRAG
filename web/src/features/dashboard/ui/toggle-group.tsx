/**
 * 分段切换控件。
 *
 * 语义用 `aria-pressed` 的可切换按钮组：键盘可达、状态可读，不靠颜色单独表意。
 */
import { cn } from '@/shared/lib';

export type ToggleOption<Value extends string> = {
  value: Value;
  label: string;
};

export const ToggleGroup = <Value extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  testId,
}: {
  label: string;
  value: Value;
  options: readonly ToggleOption<Value>[];
  onChange: (value: Value) => void;
  disabled?: boolean;
  testId?: string;
}) => (
  <fieldset
    aria-label={label}
    data-testid={testId}
    className="flex flex-wrap items-center gap-0.5 rounded-medium bg-color-fill-2 p-0.5"
  >
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={active}
          disabled={disabled}
          className={cn(
            'rounded-small px-2 py-1 text-xs whitespace-nowrap transition-colors',
            active
              ? 'bg-color-bg-1 font-medium text-color-text-1'
              : 'text-color-text-3 hover:text-color-text-1',
            disabled && 'cursor-not-allowed opacity-50',
          )}
          onClick={() => {
            if (!active) onChange(option.value);
          }}
        >
          {option.label}
        </button>
      );
    })}
  </fieldset>
);
