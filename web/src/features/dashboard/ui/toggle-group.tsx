/**
 * 分段切换控件。
 *
 */
import { Segmented } from 'antd';

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
  <Segmented<Value>
    aria-label={label}
    data-testid={testId}
    value={value}
    options={options.map((option) => ({
      label: option.label,
      value: option.value,
    }))}
    disabled={disabled}
    onChange={onChange}
  />
);
