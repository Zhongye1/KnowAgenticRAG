/**
 * 工具审批模式选择器。
 *
 * 一个下拉触发器 + 两个互斥选项（请求审批 / 完全信任），保留 `aria-haspopup` /
 * `aria-expanded` 与选项上的 `menuitemradio` + `aria-checked`。
 */
import { Check, ChevronDown, Hand, ShieldAlert } from 'lucide-react';

import { Dropdown, type ChatDropdownItem } from './antd-dropdown';
import styles from './input-selector.module.css';

import type { ToolApprovalMode } from '../lib/tool-approval';

const MODE_OPTIONS: ReadonlyArray<{
  value: ToolApprovalMode;
  label: string;
  icon: typeof Hand;
}> = [
  { value: 'default', label: '请求审批', icon: Hand },
  { value: 'always_trust', label: '完全信任', icon: ShieldAlert },
];

type ToolApprovalModeSelectorProps = {
  value: ToolApprovalMode;
  onChange: (mode: ToolApprovalMode) => void;
};

export const ToolApprovalModeSelector = ({
  value,
  onChange,
}: ToolApprovalModeSelectorProps) => {
  const current =
    MODE_OPTIONS.find((option) => option.value === value) ?? MODE_OPTIONS[0];
  const CurrentIcon = current.icon;

  const items: ChatDropdownItem[] = MODE_OPTIONS.map((option) => {
    const Icon = option.icon;
    return {
      kind: 'item',
      key: option.value,
      label: (
        <span className={styles.menuItem}>
          <Icon className={styles.triggerIcon} aria-hidden />
          <span>{option.label}</span>
          {value === option.value ? (
            <Check className={styles.menuItemCheck} aria-hidden />
          ) : null}
        </span>
      ),
      onSelect: () => onChange(option.value),
      selected: value === option.value,
      radio: true,
    };
  });

  return (
    <Dropdown items={items} placement="topLeft">
      <button
        type="button"
        aria-label={current.label}
        className={`${styles.trigger} ${
          value === 'always_trust' ? styles.triggerWarning : ''
        }`}
      >
        <CurrentIcon className={styles.triggerIcon} aria-hidden />
        {current.label}
        <ChevronDown className={styles.triggerChevron} aria-hidden />
      </button>
    </Dropdown>
  );
};
