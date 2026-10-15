/**
 * chat 切片的下拉菜单词汇。
 *
 * 调用点用描述性的 items 数组（selected 对勾、radio 语义、label/separator），
 * 渲染时转成 antd MenuProps。组件直用 antd Dropdown，转换归这里。
 */
import { Check } from 'lucide-react';
import type { MenuProps } from 'antd';

export type ChatDropdownItem =
  | { kind: 'label'; label: string; key: string }
  | { kind: 'separator'; key: string }
  | {
      kind: 'item';
      key: string;
      label: React.ReactNode;
      onSelect: () => void;
      disabled?: boolean;
      /** 选中态展示对勾（antd 渲染 aria-checked / aria-selected）。 */
      selected?: boolean;
      /** 互斥选择语义（menuitemradio）；审批模式这类单选菜单用。 */
      radio?: boolean;
    };

export const toAntdMenuItems = (
  items: ChatDropdownItem[],
): MenuProps['items'] =>
  items.map((item) => {
    if (item.kind === 'separator') return { type: 'divider', key: item.key };
    if (item.kind === 'label')
      return { type: 'group', key: item.key, label: item.label };
    return {
      key: item.key,
      // 互斥选择的选项用 option 语义：rc-menu 只对 role='option' 渲染
      // aria-selected，menuitemradio 的 aria-checked 它不渲染
      ...(item.radio ? { role: 'option' as const } : {}),
      label: item.selected ? (
        <span className="chat-dropdown-item-inner">
          {item.label}
          <Check className="chat-dropdown-item-check" />
        </span>
      ) : (
        item.label
      ),
      disabled: item.disabled,
    };
  });

export const toSelectedKeys = (items: ChatDropdownItem[]): string[] =>
  items
    .filter((item) => item.kind === 'item' && item.selected)
    .map((item) => item.key);

export const findItem = (
  items: ChatDropdownItem[],
  key: string,
): Extract<ChatDropdownItem, { kind: 'item' }> | undefined =>
  items.find(
    (candidate): candidate is Extract<ChatDropdownItem, { kind: 'item' }> =>
      candidate.kind === 'item' && candidate.key === key,
  );
