/**
 * 工具审批模式选择器。
 *
 * 一个下拉触发器 + 两个互斥选项（请求审批 / 完全信任），保留 `aria-haspopup` /
 * `aria-expanded` 与选项上的 `menuitemradio` + `aria-checked`。
 */
import { Check, ChevronDown, Hand, ShieldAlert } from 'lucide-react';

import { Dropdown } from 'antd';
import {
  toAntdMenuItems,
  toSelectedKeys,
  findItem,
  type ChatDropdownItem,
} from './chat-dropdown';
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
    <Dropdown
      menu={{
        items: toAntdMenuItems(items),
        selectedKeys: toSelectedKeys(items),
        onClick: ({ key }) => findItem(items, key)?.onSelect(),
        selectable: true,
      }}
      trigger={['click']}
      placement="topLeft"
    >
      <button
        type="button"
        aria-label={current.label}
        className={`${styles.trigger} ${styles.triggerApproval} ${
          value === 'always_trust' ? styles.triggerWarning : ''
        }`}
      >
        {/* 图标与参照同构：宽屏只留文字与箭头，窄屏（≤640px）收成纯图标钮 */}
        <CurrentIcon className={styles.triggerCompactIcon} aria-hidden />
        <span className={styles.triggerLabel}>{current.label}</span>
        <ChevronDown className={styles.triggerChevron} aria-hidden />
      </button>
    </Dropdown>
  );
};
